const sessionStore = require('../services/session-store');
const crypto = require('crypto');

/**
 * Middleware to verify request signatures using OPAQUE export key
 */
function verifyRequestSignature(req, res, next) {
    // Skip for auth endpoints
    if (req.path.includes('/auth/')) {
        return next();
    }

    console.log('\n🔐 Verifying request signature for:', req.path);

    const sessionToken = req.headers.authorization?.replace('Bearer ', '');
    const signature = req.headers['x-request-signature'];
    const timestamp = req.headers['x-request-timestamp'];

    if (!sessionToken || !signature || !timestamp) {
        console.error('❌ Missing required headers for signature verification');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check timestamp to prevent replay attacks (5 minute window)
    const requestTime = parseInt(timestamp);
    const now = Date.now();
    if (isNaN(requestTime) || Math.abs(now - requestTime) > 5 * 60 * 1000) {
        console.error('❌ Request timestamp outside acceptable window');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get session from session store
    const session = sessionStore.getSession(sessionToken);
    if (!session) {
        console.error('❌ No session found for token');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('Session found for user:', session.userId);

    // Get export key from session
    const exportKey = session.exportKey;
    if (!exportKey) {
        console.error('❌ No export key found for session');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Reconstruct the exact same data structure that was signed on the client
    const dataToSign = {
        method: req.method.toUpperCase(),
        path: req.path,
        body: req.body,
        timestamp: requestTime
    };

    // Stringify with sorted keys to ensure consistency with client
    const dataToSignString = JSON.stringify(dataToSign, Object.keys(dataToSign).sort());

    // Recreate signature
    const hmac = crypto.createHmac('sha256', exportKey);
    hmac.update(dataToSignString);
    const expectedSignature = hmac.digest('base64');

    // Constant-time comparison
    try {
        const signatureBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expectedSignature);
        
        if (signatureBuffer.length !== expectedBuffer.length) {
            console.error('❌ Signature length mismatch');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
            console.error('❌ Invalid signature');
            return res.status(401).json({ error: 'Unauthorized' });
        }
    } catch (error) {
        console.error('❌ Signature verification error:', error.message);
        return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('✅ Signature verified successfully for user:', session.userId);

    // Attach session info to request - THIS IS CRITICAL
    req.session = {
        userId: session.userId,
        sessionToken: sessionToken,
        exportKey: exportKey
    };
    
    next();
}

module.exports = {
    verifyRequestSignature
};