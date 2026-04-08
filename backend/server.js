// backend/server.js - Updated to use Web Crypto OPAQUE
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

// Import security middleware
const {
    rateLimiters,
    securityHeaders,
    validateInput,
    auditLog,
    enforceTLS,
    validateOrigin,
    enhancedRateLimit,
    errorHandler
} = require('./middleware/security');

// Import Web Crypto OPAQUE server
const opaqueServer = require('./services/opaque-server-webcrypto');

// Import session store
const sessionStore = require('./services/session-store');

// Import signature verification middleware
const { verifyRequestSignature } = require('./middleware/signature-verification');

const app = express();
const PORT = process.env.PORT || 5001;

// ========== Initialize Services ==========
let supabase;

// Cleanup interval for expired sessions
setInterval(() => {
    if (opaqueServer) {
        opaqueServer.cleanup();
    }
    if (sessionStore) {
        sessionStore.cleanup();
    }
}, 60 * 1000);

async function startServer() {
    // Initialize OPAQUE with persistent key
    try {
        const privateKeyBase64 = process.env.OPAQUE_SERVER_PRIVATE_KEY;
        if (!privateKeyBase64) {
            console.error('❌ OPAQUE_SERVER_PRIVATE_KEY not set in .env');
            process.exit(1);
        }
        await opaqueServer.initialize(privateKeyBase64);
    } catch (error) {
        console.error('❌ Failed to initialize OPAQUE server:', error.message);
        process.exit(1);
    }

    // Initialize Supabase
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('❌ Supabase environment variables not set');
        process.exit(1);
    }

    supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // ========== Apply Security Middleware ==========
    
    app.use(enforceTLS);
    app.use(validateOrigin);
    
    // CORS configuration
    const corsOptions = {
        origin: process.env.NODE_ENV === 'production' 
            ? ['https://yourdomain.com'] 
            : ['http://localhost:3000'],
        credentials: true,
        optionsSuccessStatus: 200
    };
    
    app.use(cors(corsOptions));
    app.use(express.json({ limit: '50mb' }));
    app.use(securityHeaders);
    app.use(auditLog);
    app.use(validateInput);

    // Handle OPTIONS preflight requests
    app.options('*', (req, res) => {
        res.sendStatus(200);
    });

    // Health check endpoint
    app.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV,
            opaque: {
                protocol: 'RFC 9380 (Web Crypto API)',
                activeSessions: opaqueServer.registrationSessions.size + opaqueServer.authenticationSessions.size
            },
            sessionStore: {
                activeSessions: sessionStore.getStats ? sessionStore.getStats().length : 0
            }
        });
    });

    // ========== PUBLIC TEST ENDPOINTS ==========
    
    app.get('/api/public/test', (req, res) => {
        res.json({
            success: true,
            message: 'Server is running with Web Crypto OPAQUE',
            timestamp: new Date().toISOString()
        });
    });

    app.get('/api/public/db-test', async (req, res) => {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('count', { count: 'exact', head: true });
            
            res.json({
                success: true,
                database: 'connected',
                error: error ? error.message : null
            });
        } catch (error) {
            res.json({
                success: false,
                database: 'error',
                error: error.message
            });
        }
    });

    // ========== TEST ENDPOINT TO VERIFY SESSION ==========
    app.get('/api/test/session', verifyRequestSignature, async (req, res) => {
        try {
            res.json({
                success: true,
                message: 'Session is valid',
                userId: req.session?.userId,
                sessionToken: req.session?.sessionToken ? 'present' : 'missing'
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========== Authentication Endpoints ==========
    
    // Apply rate limiting
    app.use('/api/auth', enhancedRateLimit, rateLimiters.auth);
    
    // Import and use auth routes
    const authRouter = require('./routes/auth');
    app.use('/api/auth', authRouter);

    // ========== DEBUG ENDPOINTS ==========
    app.post('/api/debug/session', (req, res) => {
        const { sessionToken } = req.body;
        
        if (!sessionToken) {
            return res.json({ 
                authenticated: false, 
                reason: 'No token provided' 
            });
        }
        
        const session = sessionStore.getSession(sessionToken);
        
        if (session) {
            res.json({
                authenticated: true,
                userId: session.userId,
                expiresAt: new Date(session.expiresAt).toISOString(),
                requestCount: session.requestCount
            });
        } else {
            res.json({
                authenticated: false,
                reason: 'Session not found or expired'
            });
        }
    });

    // ========== PROTECTED ROUTES ==========
    
    // Apply signature verification middleware for all non-auth routes
    app.use('/api', (req, res, next) => {
        if (req.path.startsWith('/auth/') || 
            req.path.startsWith('/debug/') || 
            req.path.startsWith('/public/') ||
            req.path.startsWith('/shares/')) {
            return next();
        }
        verifyRequestSignature(req, res, next);
    });

    // ========== PUBLIC SHARE ENDPOINTS (NO AUTH REQUIRED) ==========
    app.use('/api/shares', (req, res, next) => {
        if (req.method === 'GET' || 
            req.path.includes('/request-code') || 
            req.path.includes('/verify-code') ||
            req.path.includes('/key')) {
            return next();
        }
        verifyRequestSignature(req, res, next);
    });

    // Session stats endpoint
    app.get('/api/auth/session-stats', enhancedRateLimit, async (req, res) => {
        try {
            const stats = sessionStore.getStats ? sessionStore.getStats() : [];
            res.json({
                activeSessions: stats.length,
                yourSession: req.session ? {
                    createdAt: req.session.createdAt,
                    expiresAt: req.session.expiresAt
                } : null
            });
        } catch (error) {
            console.error('Session stats error:', error.message);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // ========== FILE ROUTES ==========
    const filesRouter = require('./routes/files');
    app.use('/api/files', filesRouter);

    // ========== SHARE ROUTES ==========
    const sharesRouter = require('./routes/shares');
    app.use('/api/shares', sharesRouter);

    // Error handler
    app.use(errorHandler);

    // Start server
    app.listen(PORT, () => {
        console.log(`\n🚀 Server running on port ${PORT}`);
        console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`🔐 OPAQUE RFC 9380 via Web Crypto API`);
        console.log(`💾 Database: Supabase`);
        console.log(`🛡️  Security: Hardened with Phase 8 middleware`);
        console.log(`🔑 Request signing: Enabled for all non-auth routes`);
        console.log(`🔗 Sharing: Public share links enabled\n`);
    });
}

startServer();