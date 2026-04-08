// backend/utils/constant-time.js
const crypto = require('crypto');

/**
 * PHASE 7: Constant-time string comparison
 * Prevents timing attacks on sensitive comparisons
 */
function constantTimeEqual(a, b) {
    if (!a || !b) return false;
    
    // Convert to strings if not already
    const strA = String(a);
    const strB = String(b);
    
    // Use timing-safe equality check
    try {
        return crypto.timingSafeEqual(
            Buffer.from(strA),
            Buffer.from(strB)
        );
    } catch (err) {
        // If buffers are different lengths, they can't be equal
        // But we still need to take the same time
        if (strA.length === strB.length) {
            // This should never happen if crypto.timingSafeEqual threw
            return false;
        }
        
        // Compare dummy buffers of same length to maintain timing
        const dummy = Buffer.alloc(strA.length);
        const dummy2 = Buffer.alloc(strA.length);
        crypto.timingSafeEqual(dummy, dummy2);
        
        return false;
    }
}

/**
 * Constant-time comparison for session IDs
 */
function compareSessionIds(sessionId1, sessionId2) {
    return constantTimeEqual(sessionId1 || '', sessionId2 || '');
}

/**
 * Constant-time comparison for cryptographic outputs
 */
function compareAuthOutputs(output1, output2) {
    return constantTimeEqual(output1 || '', output2 || '');
}

module.exports = {
    constantTimeEqual,
    compareSessionIds,
    compareAuthOutputs
};