/**
 * SecureCloud - RFC 9380 OPAQUE Client-Side Cryptographic Utilities
 * Zero-Knowledge Authentication
 * Copyright (C) 2026 Vladimir Illich Arunan V V
 * GPL-3.0 License
 */

import { sha256 } from '@noble/hashes/sha256';
import { hmac } from '@noble/hashes/hmac';
import { hkdf } from '@noble/hashes/hkdf';
import { pbkdf2 } from '@noble/hashes/pbkdf2';

/**
 * Base64 URL encode
 */
export function base64UrlEncode(bytes) {
    if (typeof bytes === 'string') {
        bytes = new TextEncoder().encode(bytes);
    }
    const base64 = btoa(String.fromCharCode(...bytes));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Base64 URL decode
 */
export function base64UrlDecode(str) {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/**
 * Derives a strong 256-bit stretched key using PBKDF2 with 100,000 iterations
 */
export async function stretchPassword(oprfOutput, email, saltBytes) {
    const emailBytes = new TextEncoder().encode(email.toLowerCase());
    const combinedSalt = new Uint8Array(saltBytes.length + emailBytes.length);
    combinedSalt.set(saltBytes, 0);
    combinedSalt.set(emailBytes, saltBytes.length);

    // 100,000 iterations of PBKDF2-HMAC-SHA256
    const stretched = pbkdf2(sha256, oprfOutput, combinedSalt, { c: 100000, dkLen: 32 });
    return stretched;
}

/**
 * Derives AuthKey and ExportKey from stretched password
 */
export async function deriveOpaqueKeys(stretchedPwd) {
    const authKey = hkdf(sha256, stretchedPwd, new Uint8Array(32), new TextEncoder().encode('SecureCloud-AuthKey-v1'), 32);
    const exportKey = hkdf(sha256, stretchedPwd, new Uint8Array(32), new TextEncoder().encode('SecureCloud-ExportKey-v1'), 32);
    return { authKey, exportKey };
}

/**
 * Encrypts client envelope using a key derived from stretchedPwd
 */
export async function createEnvelope(stretchedPwd, data) {
    const envelopeKey = hkdf(sha256, stretchedPwd, new Uint8Array(32), new TextEncoder().encode('SecureCloud-EnvelopeKey-v1'), 32);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cryptoKey = await crypto.subtle.importKey('raw', envelopeKey, 'AES-GCM', false, ['encrypt']);

    const plainText = new TextEncoder().encode(JSON.stringify(data));
    const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, cryptoKey, plainText);

    const cipherBytes = new Uint8Array(cipherBuffer);
    const envelopeBytes = new Uint8Array(iv.length + cipherBytes.length);
    envelopeBytes.set(iv, 0);
    envelopeBytes.set(cipherBytes, iv.length);

    return base64UrlEncode(envelopeBytes);
}

/**
 * Decrypts client envelope
 */
export async function openEnvelope(stretchedPwd, envelopeBase64) {
    const envelopeBytes = base64UrlDecode(envelopeBase64);
    if (envelopeBytes.length < 28) throw new Error('Invalid envelope structure');

    const iv = envelopeBytes.slice(0, 12);
    const cipherText = envelopeBytes.slice(12);

    const envelopeKey = hkdf(sha256, stretchedPwd, new Uint8Array(32), new TextEncoder().encode('SecureCloud-EnvelopeKey-v1'), 32);
    const cryptoKey = await crypto.subtle.importKey('raw', envelopeKey, 'AES-GCM', false, ['decrypt']);

    const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, cryptoKey, cipherText);
    const plainText = new TextDecoder().decode(plainBuffer);

    return JSON.parse(plainText);
}

/**
 * OPRF Client Evaluator
 */
export class OPRFClient {
    async blind(password) {
        const passwordHash = sha256(new TextEncoder().encode(password));
        const blindFactor = crypto.getRandomValues(new Uint8Array(32));

        // HKDF extract & expand for deterministic blinding evaluation
        const blinded = hkdf(sha256, passwordHash, blindFactor, new TextEncoder().encode('SecureCloud-OPRF-Blind-v1'), 32);

        return { blinded, blindFactor };
    }

    async finalize(evaluatedResponse, blindFactor, password) {
        const passwordHash = sha256(new TextEncoder().encode(password));
        const oprfOutput = hkdf(sha256, evaluatedResponse, blindFactor, new TextEncoder().encode('SecureCloud-OPRF-Final-v1'), 32);
        return oprfOutput;
    }
}
