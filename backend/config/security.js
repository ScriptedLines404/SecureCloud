// backend/config/security.js
module.exports = {
    // OPAQUE configuration
    opaque: {
        sessionExpiry: 5 * 60 * 1000, // 5 minutes
        maxAttempts: 3,
        lockoutDuration: 15 * 60 * 1000, // 15 minutes
        
        // OPRF configuration
        oprf: {
            curve: 'curve25519',
            hash: 'SHA-256'
        }
    },
    
    // Rate limiting
    rateLimits: {
        authentication: {
            windowMs: 15 * 60 * 1000,
            max: 10
        },
        registration: {
            windowMs: 60 * 60 * 1000,
            max: 5
        },
        api: {
            windowMs: 15 * 60 * 1000,
            max: 100
        }
    },
    
    // CORS configuration
    cors: {
        origin: process.env.NODE_ENV === 'production' 
            ? ['https://yourdomain.com'] 
            : ['http://localhost:3000'],
        credentials: true
    },
    
    // HTTPS/TLS enforcement
    tls: {
        requireHTTPS: process.env.NODE_ENV === 'production',
        hsts: {
            maxAge: 31536000, // 1 year
            includeSubDomains: true,
            preload: true
        }
    }
};