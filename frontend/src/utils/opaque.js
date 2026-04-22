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

import { 
    encodeBase64Url,
    decodeBase64Url,
    sha256,
    hmacSha256,
    generateSecureToken,
    deriveKeyHKDF
} from './encryption-webcrypto';

const API_URL = import.meta.env.PROD ? '/api' : 'http://localhost:5001/api';

let _exportKey = null;
const EXPORT_KEY_STORAGE = 'opaque_export_key';

/**
 * Base64 URL encode
 */
function base64UrlEncode(data) {
    if (data instanceof Uint8Array) {
        return encodeBase64Url(data);
    }
    const bytes = new TextEncoder().encode(data);
    return encodeBase64Url(bytes);
}

/**
 * Base64 URL decode
 */
function base64UrlDecode(str) {
    return decodeBase64Url(str);
}

/**
 * API call
 */
export async function apiCall(endpoint, data) {
    console.log(`📤 API Request to ${endpoint}:`, JSON.stringify(data, null, 2).substring(0, 200));
    
    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        console.log(`📥 API Response from ${endpoint}:`, result);
        
        if (!response.ok) {
            throw new Error(result.error || 'Request failed');
        }
        
        return result;
    } catch (error) {
        console.error(`❌ API call to ${endpoint} failed:`, error.message);
        throw error;
    }
}

/**
 * OPRF (Oblivious Pseudorandom Function) implementation
 */
class OPRF {
    constructor() {
        this.curve = 'P-256';
    }
    
    async blind(password) {
        // Generate blinding factor
        const r = generateSecureToken(32);
        
        // Hash the password
        const passwordHash = await sha256(new TextEncoder().encode(password));
        
        // Blind the hash (XOR-based blinding)
        const blinded = new Uint8Array(passwordHash.length);
        for (let i = 0; i < passwordHash.length; i++) {
            blinded[i] = passwordHash[i] ^ r[i % r.length];
        }
        
        return { blinded, blindFactor: r };
    }
    
    async finalize(evaluated, blindFactor, password) {
        // Unblind the evaluated result
        const passwordHash = await sha256(new TextEncoder().encode(password));
        const result = new Uint8Array(evaluated.length);
        
        for (let i = 0; i < evaluated.length; i++) {
            result[i] = evaluated[i] ^ blindFactor[i % blindFactor.length];
        }
        
        // Derive final OPRF output using HKDF
        const finalOutput = await deriveKeyHKDF(
            result,
            new Uint8Array(32),
            new TextEncoder().encode('OPRF-output'),
            256
        );
        
        const finalOutputRaw = await crypto.subtle.exportKey('raw', finalOutput);
        return new Uint8Array(finalOutputRaw);
    }
}

/**
 * Registration flow
 */
export async function register(email, password) {
    console.log('\n========== REGISTRATION ==========');
    console.log('Email:', email);
    
    try {
        const oprf = new OPRF();
        
        // Step 1: Generate OPRF blind
        const { blinded, blindFactor } = await oprf.blind(password);
        
        const registrationRequestBase64 = base64UrlEncode(blinded);
        
        // Store client state
        const clientState = {
            blindFactor: Array.from(blindFactor),
            passwordHash: Array.from(await sha256(new TextEncoder().encode(password))),
            timestamp: Date.now()
        };
        
        // Step 2: Send to server
        console.log('📤 Sending to /auth/register/start...');
        const serverStart = await apiCall('/auth/register/start', {
            email: email.toLowerCase(),
            registrationRequest: registrationRequestBase64
        });
        
        // Step 3: Finish registration
        const evaluated = base64UrlDecode(serverStart.registrationResponse);
        
        // Finalize OPRF
        const oprfOutput = await oprf.finalize(evaluated, blindFactor, password);
        
        // Derive authentication key and export key
        const authKey = await deriveKeyHKDF(
            oprfOutput,
            new Uint8Array(32),
            new TextEncoder().encode('AuthKey'),
            256
        );
        const exportKey = await deriveKeyHKDF(
            oprfOutput,
            new Uint8Array(32),
            new TextEncoder().encode('ExportKey'),
            256
        );
        
        // Create registration record
        const registrationRecord = {
            oprfOutput: Array.from(oprfOutput),
            authKey: Array.from(await crypto.subtle.exportKey('raw', authKey)),
            exportKey: Array.from(await crypto.subtle.exportKey('raw', exportKey)),
            version: '1.0',
            timestamp: Date.now()
        };
        
        const registrationRecordBase64 = base64UrlEncode(
            JSON.stringify(registrationRecord)
        );
        
        // Step 4: Final server confirmation
        console.log('📤 Sending to /auth/register/finish...');
        const serverFinish = await apiCall('/auth/register/finish', {
            email: email.toLowerCase(),
            sessionId: serverStart.sessionId,
            registrationRecord: registrationRecordBase64
        });
        
        console.log(`✅ Registration successful`);
        
        return serverFinish;
        
    } catch (error) {
        console.error(`❌ Registration failed:`, error);
        throw error;
    }
}

/**
 * Login flow
 */
export async function login(email, password) {
    console.log('\n========== LOGIN ==========');
    console.log('Email:', email);
    
    try {
        const oprf = new OPRF();
        
        // Step 1: Generate OPRF blind
        const { blinded, blindFactor } = await oprf.blind(password);
        
        const startLoginRequestBase64 = base64UrlEncode(blinded);
        
        // Store client state
        const clientState = {
            blindFactor: Array.from(blindFactor),
            passwordHash: Array.from(await sha256(new TextEncoder().encode(password))),
            timestamp: Date.now()
        };
        
        // Step 2: Send to server
        console.log('📤 Sending to /auth/login/start...');
        const serverStart = await apiCall('/auth/login/start', {
            email: email.toLowerCase(),
            authenticationRequest: startLoginRequestBase64
        });
        
        // Step 3: Finish login
        const evaluated = base64UrlDecode(serverStart.authenticationResponse);
        
        // Finalize OPRF
        const oprfOutput = await oprf.finalize(evaluated, blindFactor, password);
        
        // Derive authentication key and export key
        const authKey = await deriveKeyHKDF(
            oprfOutput,
            new Uint8Array(32),
            new TextEncoder().encode('AuthKey'),
            256
        );
        const exportKey = await deriveKeyHKDF(
            oprfOutput,
            new Uint8Array(32),
            new TextEncoder().encode('ExportKey'),
            256
        );
        
        // Generate authentication proof
        const authProof = await generateAuthProof(authKey, clientState);
        const finishLoginRequestBase64 = base64UrlEncode(authProof);
        
        // Step 4: Final server confirmation
        console.log('📤 Sending to /auth/login/finish...');
        const serverFinish = await apiCall('/auth/login/finish', {
            email: email.toLowerCase(),
            sessionId: serverStart.sessionId,
            authenticationFinal: finishLoginRequestBase64
        });
        
        if (!serverFinish.success || !serverFinish.userId || !serverFinish.sessionToken) {
            throw new Error('Invalid server response');
        }
        
        // Store session data
        localStorage.setItem('sessionToken', serverFinish.sessionToken);
        localStorage.setItem('userId', serverFinish.userId);
        localStorage.setItem('userEmail', email.toLowerCase());
        
        // Store export key
        const exportKeyRaw = await crypto.subtle.exportKey('raw', exportKey);
        _exportKey = new Uint8Array(exportKeyRaw);
        
        // Store in session storage
        try {
            sessionStorage.setItem(EXPORT_KEY_STORAGE, JSON.stringify({
                data: Array.from(_exportKey),
                userId: serverFinish.userId
            }));
        } catch (e) {
            console.warn('Could not store export key in sessionStorage');
        }
        
        console.log(`✅ Login successful`);
        
        return {
            success: true,
            userId: serverFinish.userId,
            sessionToken: serverFinish.sessionToken,
            exportKey: _exportKey,
            isFirstLogin: serverFinish.isFirstLogin
        };
        
    } catch (error) {
        console.error(`❌ Login failed:`, error);
        throw error;
    }
}

/**
 * Generate authentication proof
 */
async function generateAuthProof(authKey, clientState) {
    const authKeyRaw = await crypto.subtle.exportKey('raw', authKey);
    const timestamp = Date.now().toString();
    const nonce = generateSecureToken(16);
    const message = new TextEncoder().encode(`${timestamp}:${Array.from(nonce)}:${clientState.passwordHash}`);
    
    const proof = await hmacSha256(authKeyRaw, message);
    
    const proofData = new Uint8Array(nonce.length + proof.length + 8);
    proofData.set(nonce, 0);
    proofData.set(proof, nonce.length);
    const timestampBytes = new Uint8Array(new BigInt64Array([BigInt(timestamp)]).buffer);
    proofData.set(timestampBytes, nonce.length + proof.length);
    
    return proofData;
}

/**
 * Get export key
 */
export function getExportKey() {
    return _exportKey;
}

/**
 * Logout
 */
export function logout() {
    _exportKey = null;
    sessionStorage.removeItem(EXPORT_KEY_STORAGE);
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('userEmail');
    sessionStorage.clear();
    console.log('✅ Logout complete');
}

/**
 * Check if user is logged in
 */
export function isLoggedIn() {
    const sessionToken = localStorage.getItem('sessionToken');
    const userId = localStorage.getItem('userId');
    return !!(sessionToken && userId);
}