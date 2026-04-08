/**
 * SecureCloud - Zero-Knowledge Encrypted Flie Encryptor for Cloud Storage
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
    generateEncryptionKey,
    wrapKey,
    unwrapKey,
    deriveKeyHKDF,
    exportKeyToRaw,
    importKeyFromRaw,
    exportKeyToBase64,
    importKeyFromBase64
} from '../utils/encryption-webcrypto';
import { supabase } from '../utils/supabase';

// Use WeakMap for better memory management of sensitive keys
const keyStorage = new WeakMap();
const keyMetadata = new Map();

// Key wrapping salt
const KEK_SALT = new TextEncoder().encode('SecureCloud-KEK-Salt-v2');
const KEY_DERIVATION_INFO = new TextEncoder().encode('SecureCloud-MasterKey-v2');

/**
 * Securely store master key in memory
 */
function storeMasterKey(masterKey, userId) {
    const keyWrapper = { key: masterKey };
    keyStorage.set(keyWrapper, masterKey);
    keyMetadata.set(userId, {
        wrapper: keyWrapper,
        timestamp: Date.now(),
        userId
    });
    return keyWrapper;
}

/**
 * Retrieve master key from memory
 */
export function getMasterKeyFromMemory(userId) {
    if (!userId) {
        userId = localStorage.getItem('userId');
    }
    
    if (!userId) return null;
    
    const metadata = keyMetadata.get(userId);
    if (!metadata) return null;
    
    if (Date.now() - metadata.timestamp > 60 * 60 * 1000) {
        keyMetadata.delete(userId);
        return null;
    }
    
    return keyStorage.get(metadata.wrapper) || null;
}

/**
 * Clear master key from memory
 */
export function clearMasterKeyFromMemory(userId) {
    if (!userId) {
        userId = localStorage.getItem('userId');
    }
    
    if (!userId) return;
    
    const metadata = keyMetadata.get(userId);
    if (metadata) {
        keyStorage.delete(metadata.wrapper);
        keyMetadata.delete(userId);
    }
}

/**
 * Derive a stable Key Encryption Key (KEK) from OPAQUE export key
 */
async function deriveKEK(exportKey) {
    let keyBytes;
    if (exportKey instanceof Uint8Array) {
        keyBytes = exportKey;
    } else if (exportKey instanceof ArrayBuffer) {
        keyBytes = new Uint8Array(exportKey);
    } else if (typeof exportKey === 'string') {
        // Assume base64
        const binary = atob(exportKey);
        keyBytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            keyBytes[i] = binary.charCodeAt(i);
        }
    } else {
        throw new Error('Invalid export key format');
    }
    
    const kek = await deriveKeyHKDF(keyBytes, KEK_SALT, KEY_DERIVATION_INFO);
    return kek;
}

/**
 * Generate a new Master Encryption Key (MEK)
 */
export async function generateMasterKey() {
    return await generateEncryptionKey();
}

/**
 * Generate a cryptographically secure random share key for public shares
 */
export async function generateShareKey() {
    return await generateEncryptionKey();
}

/**
 * Derive a share key from email for private shares
 */
export async function deriveShareKeyFromEmail(email, shareId) {
    const normalizedEmail = email.toLowerCase().trim();
    const keyMaterial = `${normalizedEmail}:${shareId}`;
    const encoder = new TextEncoder();
    const keyBytes = encoder.encode(keyMaterial);
    const hash = await crypto.subtle.digest('SHA-256', keyBytes);
    
    const shareKey = await crypto.subtle.importKey(
        'raw',
        hash,
        { name: 'AES-GCM' },
        false,
        ['wrapKey', 'unwrapKey']
    );
    
    return shareKey;
}

/**
 * Wrap a file's master key with a share key
 */
export async function wrapFileKeyForSharing(fileId, shareKey) {
    const masterKey = getMasterKeyFromMemory();
    if (!masterKey) {
        throw new Error('Master key not available');
    }
    
    const wrappedKey = await wrapKey(masterKey, shareKey);
    const base64Result = btoa(String.fromCharCode(...wrappedKey));
    
    return base64Result;
}

/**
 * Unwrap master key using KEK derived from export key
 */
export async function unwrapMasterKey(wrappedData, exportKey) {
    const kek = await deriveKEK(exportKey);
    const masterKey = await unwrapKey(wrappedData, kek);
    return masterKey;
}

/**
 * Wrap master key with KEK derived from export key
 */
export async function wrapMasterKey(masterKey, exportKey) {
    const kek = await deriveKEK(exportKey);
    const wrappedKey = await wrapKey(masterKey, kek);
    return wrappedKey;
}

/**
 * Save wrapped MEK to Supabase
 */
export async function saveWrappedMasterKey(userId, wrappedMek) {
    try {
        const wrappedBase64 = btoa(String.fromCharCode(...wrappedMek));
        
        const { error } = await supabase
            .from('user_keys')
            .upsert({
                user_id: userId,
                wrapped_mek: wrappedBase64,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
        
        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Failed to save wrapped key:', error);
        return { success: false, error };
    }
}

/**
 * Load wrapped MEK from Supabase
 */
export async function loadWrappedMasterKey(userId) {
    try {
        const { data, error } = await supabase
            .from('user_keys')
            .select('wrapped_mek')
            .eq('user_id', userId)
            .maybeSingle();
        
        if (error) throw error;
        
        if (!data || !data.wrapped_mek || data.wrapped_mek === '') {
            return { success: false, error: 'No key found' };
        }
        
        const wrappedMek = new Uint8Array(
            atob(data.wrapped_mek).split('').map(c => c.charCodeAt(0))
        );
        
        return { success: true, data: wrappedMek };
    } catch (error) {
        return { success: false, error };
    }
}

/**
 * Initialize master key for new user
 */
export async function initializeMasterKey(userId, exportKey) {
    try {
        const existing = await loadWrappedMasterKey(userId);
        if (existing.success) {
            return await loadMasterKey(userId, exportKey);
        }
        
        const masterKey = await generateMasterKey();
        const wrappedMek = await wrapMasterKey(masterKey, exportKey);
        
        const saveResult = await saveWrappedMasterKey(userId, wrappedMek);
        if (!saveResult.success) throw new Error('Failed to save wrapped key');
        
        storeMasterKey(masterKey, userId);
        
        console.log(`✅ Master key created for user: ${userId}`);
        return masterKey;
    } catch (error) {
        console.error('Failed to initialize master key:', error);
        throw error;
    }
}

/**
 * Load master key for existing user
 */
export async function loadMasterKey(userId, exportKey) {
    try {
        const loadResult = await loadWrappedMasterKey(userId);
        if (!loadResult.success) throw new Error(loadResult.error);
        
        const masterKey = await unwrapMasterKey(loadResult.data, exportKey);
        storeMasterKey(masterKey, userId);
        
        console.log(`✅ Master key loaded for user: ${userId}`);
        return masterKey;
    } catch (error) {
        console.error('Failed to load master key:', error);
        throw error;
    }
}

/**
 * Export a key to base64 string
 */
export async function exportKeyToBase64(key) {
    const raw = await crypto.subtle.exportKey('raw', key);
    const bytes = new Uint8Array(raw);
    return btoa(String.fromCharCode(...bytes));
}

/**
 * Import a key from base64 string
 */
export async function importKeyFromBase64(base64Key, usages = ['encrypt', 'decrypt']) {
    const binary = atob(base64Key);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return await crypto.subtle.importKey(
        'raw',
        bytes,
        { name: 'AES-GCM', length: 256 },
        true,
        usages
    );
}

/**
 * Clear all keys for a user (on logout)
 */
export function clearAllKeys(userId) {
    if (!userId) {
        userId = localStorage.getItem('userId');
    }
    
    if (userId) {
        clearMasterKeyFromMemory(userId);
    }
    
    console.log('✅ All keys cleared for user:', userId);
}