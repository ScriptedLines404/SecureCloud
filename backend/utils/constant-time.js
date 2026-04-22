/**
 * SecureCloud - Zero-Knowledge Cloud Storage System with OPAQUE Authentication, Hierarchical Key Isolation, Secure Sharing, and Formalised Tri-Layer Trust Boundaries
 * Copyright (C) 2026 Vladimir Illich Arunan V V
 * 
 * This file is part of SecureCloud.
 * 
 * SecureCloud is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * SecureCloud is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with SecureCloud. If not, see <https://www.gnu.org/licenses/>.
 */

const crypto = require('crypto');

/**
 * Constant-time string comparison
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