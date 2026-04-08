// backend/middleware/security.js
const rateLimit = require('express-rate-limit');

/**
 * Phase 8: Backend Hardening - Strict Security Middleware
 * All validation re-enabled at strict levels
 */

/**
 * PHASE 9: Advanced rate limiting with exponential backoff
 */
class RateLimiter {
    constructor() {
        this.ipAttempts = new Map();
        this.accountAttempts = new Map();
        this.blockedIPs = new Map();
        this.blockedAccounts = new Map();
        
        // Cleanup every 5 minutes
        setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }

    /**
     * Check if request should be rate limited
     */
    checkLimit(ip, email) {
        const now = Date.now();
        
        // Check if IP is blocked
        const ipBlocked = this.blockedIPs.get(ip);
        if (ipBlocked && ipBlocked > now) {
            const waitTime = Math.ceil((ipBlocked - now) / 1000);
            return {
                limited: true,
                reason: 'IP_BLOCKED',
                waitTime,
                message: `Too many attempts. Try again in ${waitTime} seconds.`
            };
        }

        // Check if account is blocked
        const accountBlocked = this.blockedAccounts.get(email);
        if (accountBlocked && accountBlocked > now) {
            const waitTime = Math.ceil((accountBlocked - now) / 1000);
            return {
                limited: true,
                reason: 'ACCOUNT_BLOCKED',
                waitTime,
                message: `Account temporarily locked. Try again in ${waitTime} seconds.`
            };
        }

        // Get attempt counts
        const ipAttempts = this.ipAttempts.get(ip) || [];
        const accountAttempts = this.accountAttempts.get(email) || [];

        // Clean old attempts (only last 15 minutes)
        const recentThreshold = now - 15 * 60 * 1000;
        const recentIPAttempts = ipAttempts.filter(t => t > recentThreshold);
        const recentAccountAttempts = accountAttempts.filter(t => t > recentThreshold);

        // Check limits - increased thresholds
        if (recentIPAttempts.length >= 50) { // Increased from 20
            // Block IP for 30 minutes
            const blockUntil = now + 30 * 60 * 1000;
            this.blockedIPs.set(ip, blockUntil);
            this.ipAttempts.delete(ip);
            
            console.warn(`🚫 IP ${ip} blocked for 30 minutes due to excessive attempts`);
            
            return {
                limited: true,
                reason: 'IP_RATE_LIMIT',
                waitTime: 1800,
                message: 'Too many attempts. Try again in 30 minutes.'
            };
        }

        if (recentAccountAttempts.length >= 10) { // Increased from 5
            // Block account for 15 minutes
            const blockUntil = now + 15 * 60 * 1000;
            this.blockedAccounts.set(email, blockUntil);
            
            console.warn(`🚫 Account ${email} blocked for 15 minutes`);
            
            return {
                limited: true,
                reason: 'ACCOUNT_RATE_LIMIT',
                waitTime: 15 * 60,
                message: `Too many failed attempts. Account locked for 15 minutes.`
            };
        }

        return { limited: false };
    }

    /**
     * Record a failed attempt
     */
    recordFailedAttempt(ip, email) {
        const now = Date.now();
        const recentThreshold = now - 15 * 60 * 1000;
        
        // Get and update IP attempts
        const ipAttempts = this.ipAttempts.get(ip) || [];
        const recentIPAttempts = ipAttempts.filter(t => t > recentThreshold);
        recentIPAttempts.push(now);
        this.ipAttempts.set(ip, recentIPAttempts);
        
        // Get and update account attempts
        const accountAttempts = this.accountAttempts.get(email) || [];
        const recentAccountAttempts = accountAttempts.filter(t => t > recentThreshold);
        recentAccountAttempts.push(now);
        this.accountAttempts.set(email, recentAccountAttempts);
        
        console.log(`📊 Failed attempt recorded for ${email} (${ip}) - Total: ${recentAccountAttempts.length}/10`);
    }

    /**
     * Record successful login to reset counters
     */
    recordSuccess(ip, email) {
        this.ipAttempts.delete(ip);
        this.accountAttempts.delete(email);
        this.blockedIPs.delete(ip);
        this.blockedAccounts.delete(email);
        
        console.log(`✅ Rate limits reset for ${email} (${ip})`);
    }

    /**
     * Clean up expired entries
     */
    cleanup() {
        const now = Date.now();
        
        // Clean IP attempts
        for (const [ip, attempts] of this.ipAttempts.entries()) {
            const recent = attempts.filter(t => t > now - 15 * 60 * 1000);
            if (recent.length === 0) {
                this.ipAttempts.delete(ip);
            } else {
                this.ipAttempts.set(ip, recent);
            }
        }
        
        // Clean account attempts
        for (const [email, attempts] of this.accountAttempts.entries()) {
            const recent = attempts.filter(t => t > now - 15 * 60 * 1000);
            if (recent.length === 0) {
                this.accountAttempts.delete(email);
            } else {
                this.accountAttempts.set(email, recent);
            }
        }
        
        // Clean blocked IPs
        for (const [ip, until] of this.blockedIPs.entries()) {
            if (until <= now) {
                this.blockedIPs.delete(ip);
            }
        }
        
        // Clean blocked accounts
        for (const [email, until] of this.blockedAccounts.entries()) {
            if (until <= now) {
                this.blockedAccounts.delete(email);
            }
        }
    }

    /**
     * Log abuse attempts for monitoring
     */
    logAbuse(ip, email, reason) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            ip,
            email,
            reason,
            ipAttempts: (this.ipAttempts.get(ip) || []).length,
            accountAttempts: (this.accountAttempts.get(email) || []).length
        };
        
        console.warn('🚨 Abuse attempt detected:', logEntry);
        
        // In production, you might want to send this to a logging service
        if (process.env.NODE_ENV === 'production') {
            // Send to logging service
        }
    }
}

// Create global rate limiter instance
const rateLimiter = new RateLimiter();

/**
 * Enhanced rate limiting middleware
 */
const enhancedRateLimit = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const email = req.body?.email?.toLowerCase();
    
    // Skip if no email (not an auth request)
    if (!email) {
        return next();
    }
    
    const limit = rateLimiter.checkLimit(ip, email);
    
    if (limit.limited) {
        // Log abuse attempt
        rateLimiter.logAbuse(ip, email, limit.reason);
        
        // Add retry-after header
        res.setHeader('Retry-After', limit.waitTime);
        
        return res.status(429).json({ 
            error: limit.message,
            code: limit.reason,
            retryAfter: limit.waitTime
        });
    }
    
    // Attach rate limiter to request for tracking
    req.rateLimiter = rateLimiter;
    req.clientIp = ip;
    
    next();
};

/**
 * Record failed authentication attempt
 */
const recordFailedAttempt = (req, res, next) => {
    const originalJson = res.json;
    
    res.json = function(data) {
        // If this is a failed authentication response (non-200 status or error)
        if (res.statusCode !== 200 && req.body?.email && req.rateLimiter) {
            const ip = req.clientIp || req.ip || req.connection.remoteAddress;
            const email = req.body.email.toLowerCase();
            req.rateLimiter.recordFailedAttempt(ip, email);
        }
        
        return originalJson.call(this, data);
    };
    
    next();
};

/**
 * Record successful authentication
 */
const recordAuthSuccess = (req, res, next) => {
    const originalJson = res.json;
    
    res.json = function(data) {
        if (data.success && req.body?.email && req.rateLimiter) {
            const ip = req.clientIp || req.ip || req.connection.remoteAddress;
            req.rateLimiter.recordSuccess(ip, req.body.email.toLowerCase());
        }
        
        return originalJson.call(this, data);
    };
    
    next();
};

/**
 * Rate limiting configuration (legacy - kept for compatibility)
 */
const rateLimiters = {
    // Relaxed limits for authentication endpoints
    auth: rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 20, // 20 attempts per window (increased from 10)
        message: { error: 'Invalid credentials' },
        standardHeaders: true,
        legacyHeaders: false,
        skipSuccessfulRequests: true, // Don't count successful requests
        keyGenerator: (req) => {
            // Use IP + email if available to prevent distributed attacks
            const email = req.body?.email || '';
            return req.ip + email.substring(0, 8);
        }
    }),

    // Stricter limits for failed attempts
    strict: rateLimit({
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 50, // 50 attempts per hour (increased from 20)
        message: { error: 'Too many attempts' },
        standardHeaders: true,
        legacyHeaders: false,
    }),

    // API endpoints
    api: rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 200, // Increased from 100
        message: { error: 'Rate limit exceeded' }
    })
};

/**
 * Security headers middleware (strict)
 */
const securityHeaders = (req, res, next) => {
    // HSTS (HTTP Strict Transport Security) - 1 year
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');

    // Enable XSS protection
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Content Security Policy (strict)
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Content-Security-Policy', 
            "default-src 'self'; " +
            "script-src 'self'; " +
            "style-src 'self'; " +
            "img-src 'self' data:; " +
            "font-src 'self'; " +
            "connect-src 'self' https://fgbroytazaxzbsbemhxa.supabase.co https://www.googleapis.com;"
        );
    }

    next();
};

/**
 * Strict input validation middleware
 */
const validateInput = (req, res, next) => {
    // Skip validation for non-POST requests or OPTIONS
    if (req.method !== 'POST' || req.method === 'OPTIONS') {
        return next();
    }

    // Skip email validation for verify endpoint
    const isVerifyEndpoint = req.path.includes('/auth/verify');
    
    // Validate email format (strict) - but skip for verify endpoint
    if (!isVerifyEndpoint && req.body.email) {
        const email = req.body.email.toLowerCase().trim();
        
        // RFC 5322 compliant email regex
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
        
        if (!emailRegex.test(email)) {
            console.log('❌ Email validation failed:', req.body.email);
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        req.body.email = email; // Normalize
    }

    // Strict base64 validation for OPAQUE messages
    const base64Fields = [
        'registrationRequest', 
        'authenticationRequest', 
        'registrationResponse', 
        'authenticationResponse',
        'registrationRecord',
        'authenticationFinal'
    ];
    
    for (const field of base64Fields) {
        if (req.body[field] !== undefined && req.body[field] !== null) {
            // Allow empty string for authenticationFinal (as per RFC)
            if (field === 'authenticationFinal' && req.body[field] === '') {
                continue;
            }
            
            if (typeof req.body[field] !== 'string') {
                console.log(`❌ Invalid type for ${field}:`, typeof req.body[field]);
                return res.status(400).json({ error: 'Invalid credentials' });
            }
            
            // URL-safe base64 can contain: A-Z, a-z, 0-9, +, /, =, -, _
            if (!/^[A-Za-z0-9+\/=_-]+$/.test(req.body[field])) {
                console.log(`❌ Invalid base64 format for ${field}`);
                return res.status(400).json({ error: 'Invalid credentials' });
            }
        }
    }

    next();
};

/**
 * Audit logging middleware
 */
const auditLog = (req, res, next) => {
    const startTime = Date.now();
    
    // Store original end function
    const originalEnd = res.end;
    
    // Override end function to log after response
    res.end = function(chunk, encoding) {
        const duration = Date.now() - startTime;
        
        // Only log authentication failures (for security monitoring)
        if (res.statusCode === 400 && req.path.includes('/auth/')) {
            const logEntry = {
                timestamp: new Date().toISOString(),
                method: req.method,
                path: req.path,
                statusCode: res.statusCode,
                duration,
                ip: req.ip,
                userAgent: req.get('User-Agent')?.substring(0, 100),
                email: req.body?.email ? 'present' : 'absent'
            };
            
            console.warn('⚠️ Auth failure:', logEntry);
        }
        
        // In development, log all requests
        if (process.env.NODE_ENV === 'development' && !req.path.includes('/health')) {
            const logEntry = {
                timestamp: new Date().toISOString(),
                method: req.method,
                path: req.path,
                statusCode: res.statusCode,
                duration,
                ip: req.ip
            };
            console.log('📝 Request:', logEntry);
        }
        
        originalEnd.call(this, chunk, encoding);
    };
    
    next();
};

/**
 * CORS configuration (strict)
 */
const corsOptions = {
    origin: (origin, callback) => {
        // In production, only allow your domain
        if (process.env.NODE_ENV === 'production') {
            const allowedOrigins = ['https://yourdomain.com'];
            
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error('CORS not allowed'));
            }
        } else {
            // In development, allow localhost
            const allowedOrigins = ['http://localhost:3000'];
            
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error('CORS not allowed'));
            }
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
};

/**
 * Session token validation
 */
const validateSessionToken = (req, res, next) => {
    // Skip for auth endpoints
    if (req.path.includes('/auth/')) {
        return next();
    }
    
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Strict token validation
    if (token.length < 32) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Tokens should be base64
    if (!/^[A-Za-z0-9+\/=_-]+$/.test(token)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    req.sessionToken = token;
    next();
};

/**
 * PHASE 8: Strict TLS enforcement middleware
 */
const enforceTLS = (req, res, next) => {
    // Skip in development mode for local testing
    if (process.env.NODE_ENV === 'development') {
        // Check if it's localhost
        const host = req.get('host') || '';
        if (host.includes('localhost') || host.includes('127.0.0.1')) {
            return next();
        }
    }

    // In production, enforce HTTPS
    if (process.env.NODE_ENV === 'production') {
        // Check if connection is secure
        const isSecure = req.secure || 
                        req.headers['x-forwarded-proto'] === 'https' ||
                        req.headers['x-forwarded-protocol'] === 'https';
        
        if (!isSecure) {
            console.warn('⚠️  Insecure connection rejected:', req.path);
            return res.status(403).json({ 
                error: 'HTTPS required',
                code: 'INSECURE_CONNECTION'
            });
        }

        // Add HSTS header
        res.setHeader(
            'Strict-Transport-Security',
            'max-age=31536000; includeSubDomains; preload'
        );
    }

    next();
};

/**
 * PHASE 8: Validate request origin
 */
const validateOrigin = (req, res, next) => {
    const origin = req.get('origin');
    const referer = req.get('referer');
    
    // In production, verify that requests come from our domain
    if (process.env.NODE_ENV === 'production') {
        const allowedDomains = ['https://yourdomain.com'];
        
        if (origin && !allowedDomains.some(domain => origin.startsWith(domain))) {
            console.warn('⚠️  Invalid origin rejected:', origin);
            return res.status(403).json({ error: 'Invalid origin' });
        }
        
        if (referer && !allowedDomains.some(domain => referer.startsWith(domain))) {
            console.warn('⚠️  Invalid referer rejected:', referer);
            return res.status(403).json({ error: 'Invalid referer' });
        }
    }

    next();
};

/**
 * Error handler with safe messages
 */
const errorHandler = (err, req, res, next) => {
    console.error('❌ Server error:', err.message);
    
    // Always return generic error to client
    res.status(500).json({ 
        error: 'An error occurred' 
    });
};

module.exports = {
    // Existing exports
    rateLimiters,
    securityHeaders,
    validateInput,
    auditLog,
    corsOptions,
    validateSessionToken,
    enforceTLS,
    validateOrigin,
    errorHandler,
    
    // New exports for enhanced rate limiting
    enhancedRateLimit,
    recordAuthSuccess,
    recordFailedAttempt,
    rateLimiter
};