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

/**
 * Generate a random IV for AES-GCM
 */
export function generateIV() {
    return crypto.getRandomValues(new Uint8Array(12));
}

/**
 * Generate a random salt for key derivation
 */
export function generateSalt() {
    return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Derive a key using PBKDF2 (for master key from password)
 */
export async function deriveKeyFromPassword(password, salt, iterations = 100000) {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);
    
    const baseKey = await crypto.subtle.importKey(
        'raw',
        passwordBuffer,
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
    );
    
    const key = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: iterations,
            hash: 'SHA-256'
        },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
    );
    
    return key;
}

/**
 * Derive a key using HKDF
 */
export async function deriveKeyHKDF(ikm, salt, info, length = 256) {
    const baseKey = await crypto.subtle.importKey(
        'raw',
        ikm,
        { name: 'HKDF', hash: 'SHA-256' },
        false,
        ['deriveBits', 'deriveKey']
    );
    
    const key = await crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: salt,
            info: info
        },
        baseKey,
        { name: 'AES-GCM', length: length },
        true,
        ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
    );
    
    return key;
}

/**
 * Encrypt data with AES-GCM
 */
export async function encryptWithAESGCM(key, data, iv = null) {
    const ivToUse = iv || generateIV();
    
    const encrypted = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: ivToUse,
            tagLength: 128
        },
        key,
        data
    );
    
    // Combine IV + encrypted data
    const result = new Uint8Array(ivToUse.length + encrypted.byteLength);
    result.set(ivToUse, 0);
    result.set(new Uint8Array(encrypted), ivToUse.length);
    
    return result;
}

/**
 * Decrypt data with AES-GCM
 */
export async function decryptWithAESGCM(key, encryptedData) {
    const iv = encryptedData.slice(0, 12);
    const data = encryptedData.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: iv,
            tagLength: 128
        },
        key,
        data
    );
    
    return decrypted;
}

/**
 * Generate a random encryption key
 */
export async function generateEncryptionKey() {
    return await crypto.subtle.generateKey(
        {
            name: 'AES-GCM',
            length: 256
        },
        true,
        ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
    );
}

/**
 * Wrap a key (encrypt with another key)
 */
export async function wrapKey(keyToWrap, wrappingKey) {
    const iv = generateIV();
    
    const wrapped = await crypto.subtle.wrapKey(
        'raw',
        keyToWrap,
        wrappingKey,
        {
            name: 'AES-GCM',
            iv: iv,
            tagLength: 128
        }
    );
    
    // Combine IV + wrapped key
    const result = new Uint8Array(iv.length + wrapped.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(wrapped), iv.length);
    
    return result;
}

/**
 * Unwrap a key (decrypt with another key)
 */
export async function unwrapKey(wrappedData, unwrappingKey, usages = ['encrypt', 'decrypt']) {
    const iv = wrappedData.slice(0, 12);
    const wrappedKey = wrappedData.slice(12);
    
    const key = await crypto.subtle.unwrapKey(
        'raw',
        wrappedKey,
        unwrappingKey,
        {
            name: 'AES-GCM',
            iv: iv,
            tagLength: 128
        },
        { name: 'AES-GCM', length: 256 },
        true,
        usages
    );
    
    return key;
}

/**
 * Export a key to raw format
 */
export async function exportKeyToRaw(key) {
    return new Uint8Array(await crypto.subtle.exportKey('raw', key));
}

/**
 * Import a key from raw format
 */
export async function importKeyFromRaw(rawKey, usages = ['encrypt', 'decrypt']) {
    return await crypto.subtle.importKey(
        'raw',
        rawKey,
        { name: 'AES-GCM', length: 256 },
        true,
        usages
    );
}

/**
 * Export key to base64 string
 */
export async function exportKeyToBase64(key) {
    const raw = await exportKeyToRaw(key);
    return btoa(String.fromCharCode(...raw));
}

/**
 * Import key from base64 string
 */
export async function importKeyFromBase64(base64, usages = ['encrypt', 'decrypt']) {
    const binary = atob(base64);
    const raw = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        raw[i] = binary.charCodeAt(i);
    }
    return await importKeyFromRaw(raw, usages);
}

/**
 * Compute SHA-256 hash of data
 */
export async function sha256(data) {
    const hash = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(hash);
}

/**
 * Compute HMAC-SHA256
 */
export async function hmacSha256(key, data) {
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
    return new Uint8Array(signature);
}

/**
 * Constant-time comparison
 */
export function constantTimeCompare(a, b) {
    if (a.length !== b.length) return false;
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a[i] ^ b[i];
    }
    return result === 0;
}

/**
 * Generate a secure random token
 */
export function generateSecureToken(length = 32) {
    return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Encode bytes to base64 URL-safe
 */
export function encodeBase64Url(bytes) {
    const base64 = btoa(String.fromCharCode(...bytes));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Decode base64 URL-safe to bytes
 */
export function decodeBase64Url(str) {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}