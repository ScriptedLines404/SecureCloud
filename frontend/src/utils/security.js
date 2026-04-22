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

export function secureZero(data) {
    if (typeof data === 'string') {
        // Strings are immutable in JS, so we can't truly zero them
        // But we can help garbage collection by removing references
        return '';
    }
    if (data instanceof Uint8Array) {
        for (let i = 0; i < data.length; i++) {
            data[i] = 0;
        }
    }
    return null;
}

/**
 * Clear all sensitive data from memory
 */
export function clearSensitiveData() {
    // Clear session storage
    sessionStorage.clear();
    
    // Clear specific localStorage items (but keep necessary ones)
    const keep = ['sessionToken', 'userId'];
    const toRemove = [];
    
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!keep.includes(key)) {
            toRemove.push(key);
        }
    }
    
    toRemove.forEach(key => localStorage.removeItem(key));
}

/**
 * Check if we're in a secure context (HTTPS)
 */
export function isSecureContext() {
    return window.isSecureContext || 
           location.protocol === 'https:' || 
           location.hostname === 'localhost' ||
           location.hostname === '127.0.0.1';
}

/**
 * Validate email format
 */
export function isValidEmail(email) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
}

/**
 * Validate password strength
 */
export function isStrongPassword(password) {
    if (!password || password.length < 8) return false;
    
    // Check for at least one number
    if (!/\d/.test(password)) return false;
    
    // Check for at least one letter
    if (!/[a-zA-Z]/.test(password)) return false;
    
    return true;
}

/**
 * Sanitize input to prevent XSS
 */
export function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    // Remove any HTML tags
    return input.replace(/<[^>]*>/g, '')
                .replace(/[&<>"]/g, function(m) {
                    if (m === '&') return '&amp;';
                    if (m === '<') return '&lt;';
                    if (m === '>') return '&gt;';
                    if (m === '"') return '&quot;';
                    return m;
                });
}

/**
 * Secure logout - clear all sensitive data
 */
export function secureLogout() {
    clearSensitiveData();
    
    // Redirect to login
    window.location.href = '/login-opaque';
}

/**
 * Content Security Policy compliance check
 */
export function checkCSPCompliance() {
    const errors = [];
    
    // Check for inline scripts (should use nonce or hash)
    const inlineScripts = document.querySelectorAll('script:not([src])');
    if (inlineScripts.length > 0) {
        errors.push('Inline scripts detected - use nonce or hash for CSP');
    }
    
    // Check for eval usage
    if (window.eval.toString().includes('native code') === false) {
        errors.push('eval() is being used - this violates CSP');
    }
    
    return errors;
}