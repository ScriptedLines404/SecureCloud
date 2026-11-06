/**
 * SecureCloud - OPAQUE Authentication Protocol Implementation
 * RFC 9380 compliant client-side logic
 * Copyright (C) 2026 Vladimir Illich Arunan V V
 */

import { base64UrlEncode, base64UrlDecode, hmacSha256 } from './encryption-webcrypto';

const EXPORT_KEY_STORAGE = 'opaque_export_key';
let _exportKey = null;

// Initialize export key from sessionStorage if it exists
try {
    const saved = sessionStorage.getItem(EXPORT_KEY_STORAGE);
    if (saved) {
        _exportKey = new Uint8Array(JSON.parse(saved).data);
    }
} catch (e) {
    console.warn('Failed to restore export key from sessionStorage');
}

async function signRequest(method, path, body) {
    if (!_exportKey) {
        throw new Error('Export key not available');
    }

    const timestamp = Date.now();
    const dataToSign = {
        method: method.toUpperCase(),
        path: path,
        body: body,
        timestamp: timestamp
    };

    // Sort keys for canonicalization
    const dataToSignString = JSON.stringify(dataToSign, Object.keys(dataToSign).sort());

    // Compute HMAC using Web Crypto API
    const sig = await hmacSha256(_exportKey, new TextEncoder().encode(dataToSignString));

    return {
        signature: base64UrlEncode(sig),
        timestamp: timestamp
    };
}

export async function apiCall(endpoint, data) {
    const method = 'POST';
    const headers = { 'Content-Type': 'application/json' };

    // Only sign requests that are not auth endpoints
    if (!endpoint.includes('/auth/')) {
        const { signature, timestamp } = await signRequest(method, endpoint, data);
        headers['Authorization'] = `Bearer ${localStorage.getItem('sessionToken')}`;
        headers['x-request-signature'] = signature;
        headers['x-request-timestamp'] = timestamp;
    }

    const response = await fetch(`${import.meta.env.PROD ? '/api' : 'http://localhost:5001/api'}${endpoint}`, {
        method: method,
        headers: headers,
        body: JSON.stringify(data)
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Request failed');
    return result;
}

export async function register(email, password) {
    console.log('📝 OPAQUE Registration started for:', email);
    const oprf = new OPRFClient();

    // Blind password
    const { blinded, blindFactor } = await oprf.blind(password);

    // Server start
    const serverStart = await apiCall('/auth/register/start', {
        email: email.toLowerCase(),
        registrationRequest: base64UrlEncode(blinded)
    });

    // Finalize OPRF
    const evaluated = base64UrlDecode(serverStart.registrationResponse);
    const oprfOutput = await oprf.finalize(evaluated, blindFactor, password);

    // Setup key material
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const stretchedPwd = await stretchPassword(oprfOutput, email, salt);

    // Create envelope containing salt
    const envelope = await createEnvelope(stretchedPwd, { salt: Array.from(salt), version: '1.0' });

    const registrationRecord = {
        envelope,
        version: '1.0'
    };

    // Final server confirmation
    await apiCall('/auth/register/finish', {
        email: email.toLowerCase(),
        sessionId: serverStart.sessionId,
        registrationRecord: base64UrlEncode(JSON.stringify(registrationRecord))
    });

    return { success: true };
}

export async function login(email, password) {
    console.log('🔓 OPAQUE Login started for:', email);
    const oprf = new OPRFClient();

    // Blind password
    const { blinded, blindFactor } = await oprf.blind(password);

    // Server start
    const serverStart = await apiCall('/auth/login/start', {
        email: email.toLowerCase(),
        authenticationRequest: base64UrlEncode(blinded)
    });

    // Finalize OPRF
    const evaluated = base64UrlDecode(serverStart.authenticationResponse);
    const oprfOutput = await oprf.finalize(evaluated, blindFactor, password);

    // Load Registration Record from server
    const regRecord = JSON.parse(new TextDecoder().decode(base64UrlDecode(serverStart.registrationRecord)));

    // Stretched pwd & decrypt envelope
    const stretchedPwd = await stretchPassword(oprfOutput, email, new Uint8Array(regRecord.salt));
    const { authKey, exportKey } = await deriveOpaqueKeys(stretchedPwd);

    // Construct AuthProof
    const authProof = await computeAuthProof(authKey, serverStart.serverNonce);

    // Final login
    const loginFinish = await apiCall('/auth/login/finish', {
        email: email.toLowerCase(),
        sessionId: serverStart.sessionId,
        authenticationFinal: base64UrlEncode(authProof)
    });

    _exportKey = exportKey;
    localStorage.setItem('sessionToken', loginFinish.sessionToken);
    sessionStorage.setItem(EXPORT_KEY_STORAGE, JSON.stringify({ data: Array.from(exportKey), userId: loginFinish.userId }));

    return { success: true, userId: loginFinish.userId, exportKey };
}

async function computeAuthProof(authKey, serverNonce) {
    // HMAC(AuthKey, ServerNonce + "SecureCloud-Auth-Proof")
    const proof = await hmacSha256(authKey, new TextEncoder().encode(serverNonce + 'SecureCloud-Auth-Proof'));
    return proof;
}

export function getExportKey() { return _exportKey; }
export function logout() { _exportKey = null; sessionStorage.removeItem(EXPORT_KEY_STORAGE); localStorage.clear(); }
export function isLoggedIn() { return !!localStorage.getItem('sessionToken'); }
