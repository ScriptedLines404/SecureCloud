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

import { supabase } from '../utils/supabase';
import { perfMetrics } from '../utils/performanceMetrics';

// Use WeakMap for better memory management of sensitive keys
const keyStorage = new WeakMap();
const keyMetadata = new Map();

// Key wrapping salt
const KEK_SALT = new TextEncoder().encode('SecureCloud-KEK-Salt-v2');
const KEY_DERIVATION_INFO = new TextEncoder().encode('SecureCloud-MasterKey-v2');

// Flag to track if we're in fallback mode
let isFallbackMode = false;

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
    
    // Track key storage size
    try {
        crypto.subtle.exportKey('raw', masterKey).then(rawKey => {
            perfMetrics.trackKeyStorage('master', rawKey.byteLength);
        });
    } catch (e) {
        // Ignore export errors
    }
    
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
    const timerId = perfMetrics.startTimer('derive-kek');
    
    try {
        let keyBytes;
        if (exportKey instanceof Uint8Array) {
            keyBytes = exportKey;
        } else if (exportKey instanceof ArrayBuffer) {
            keyBytes = new Uint8Array(exportKey);
        } else {
            throw new Error('Invalid export key format');
        }

        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            keyBytes,
            { name: 'HKDF' },
            false,
            ['deriveBits']
        );

        const kekBits = await crypto.subtle.deriveBits(
            {
                name: 'HKDF',
                hash: 'SHA-256',
                salt: KEK_SALT,
                info: KEY_DERIVATION_INFO
            },
            keyMaterial,
            256
        );

        const kek = await crypto.subtle.importKey(
            'raw',
            kekBits,
            { name: 'AES-GCM' },
            false,
            ['wrapKey', 'unwrapKey']
        );
        
        const duration = perfMetrics.endTimer(timerId, 'encryption', 'keyDerivation', { type: 'KEK' });
        console.log(`✅ KEK derived in ${duration?.toFixed(2)}ms`);
        
        return kek;
    } catch (error) {
        perfMetrics.endTimer(timerId, 'encryption', 'keyDerivation', { type: 'KEK', error: error.message });
        perfMetrics.trackError('keyDerivation', error.message);
        throw error;
    }
}

/**
 * Generate a new Master Encryption Key (MEK)
 */
export async function generateMasterKey() {
    const timerId = perfMetrics.startTimer('generate-master-key');
    
    try {
        const key = await crypto.subtle.generateKey(
            {
                name: 'AES-GCM',
                length: 256
            },
            true,
            ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
        );
        
        const duration = perfMetrics.endTimer(timerId, 'encryption', 'keyGeneration', { type: 'master' });
        console.log(`✅ Master key generated in ${duration?.toFixed(2)}ms`);
        
        return key;
    } catch (error) {
        perfMetrics.endTimer(timerId, 'encryption', 'keyGeneration', { type: 'master', error: error.message });
        perfMetrics.trackError('keyGeneration', error.message);
        throw error;
    }
}

/**
 * Generate a cryptographically secure random share key for public shares
 */
export async function generateShareKey() {
    const timerId = perfMetrics.startTimer('generate-share-key');
    
    try {
        console.log('🔑 Generating secure share key...');
        
        const key = await crypto.subtle.generateKey(
            {
                name: 'AES-GCM',
                length: 256
            },
            true,
            ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
        );
        
        const duration = perfMetrics.endTimer(timerId, 'encryption', 'keyGeneration', { type: 'share' });
        console.log(`✅ Share key generated in ${duration?.toFixed(2)}ms`);
        
        return key;
    } catch (error) {
        perfMetrics.endTimer(timerId, 'encryption', 'keyGeneration', { type: 'share', error: error.message });
        perfMetrics.trackError('keyGeneration', error.message);
        throw error;
    }
}

/**
 * Derive a share key from email for private shares
 */
export async function deriveShareKeyFromEmail(email, shareId) {
    const timerId = perfMetrics.startTimer('derive-share-key');
    
    try {
        console.log('Deriving share key from email for share:', shareId);
        
        const normalizedEmail = email.toLowerCase().trim();
        const keyMaterial = `${normalizedEmail}:${shareId}`;
        
        const encoder = new TextEncoder();
        const keyBytes = encoder.encode(keyMaterial);
        const hashBuffer = await crypto.subtle.digest('SHA-256', keyBytes);
        
        const shareKey = await crypto.subtle.importKey(
            'raw',
            hashBuffer,
            { name: 'AES-GCM' },
            false,
            ['wrapKey', 'unwrapKey']
        );
        
        const duration = perfMetrics.endTimer(timerId, 'encryption', 'keyDerivation', { type: 'share-email' });
        console.log(`✅ Share key derived in ${duration?.toFixed(2)}ms`);
        
        return shareKey;
    } catch (error) {
        perfMetrics.endTimer(timerId, 'encryption', 'keyDerivation', { type: 'share-email', error: error.message });
        perfMetrics.trackError('keyDerivation', error.message);
        throw error;
    }
}

/**
 * Wrap a file's master key with a share key
 */
export async function wrapFileKeyForSharing(fileId, shareKey) {
    const timerId = perfMetrics.startTimer('wrap-key');
    
    try {
        console.log('🔄 Wrapping master key for sharing, fileId:', fileId);
        
        const masterKey = getMasterKeyFromMemory();
        if (!masterKey) {
            throw new Error('Master key not available');
        }

        const iv = new Uint8Array(12);
        crypto.getRandomValues(iv);
        
        const wrappedKey = await crypto.subtle.wrapKey(
            'raw',
            masterKey,
            shareKey,
            { 
                name: 'AES-GCM', 
                iv: iv, 
                tagLength: 128 
            }
        );

        const result = new Uint8Array(iv.length + wrappedKey.byteLength);
        result.set(iv, 0);
        result.set(new Uint8Array(wrappedKey), iv.length);
        
        const base64Result = btoa(String.fromCharCode(...result));
        
        const duration = perfMetrics.endTimer(timerId, 'encryption', 'keyWrapping', { 
            fileId,
            keySize: wrappedKey.byteLength
        });
        
        console.log(`📦 Key wrapped in ${duration?.toFixed(2)}ms, base64 length: ${base64Result.length}`);
        
        return base64Result;
    } catch (error) {
        perfMetrics.endTimer(timerId, 'encryption', 'keyWrapping', { fileId, error: error.message });
        perfMetrics.trackError('keyWrapping', error.message);
        throw error;
    }
}

/**
 * Wrap master key with KEK derived from export key
 */
export async function wrapMasterKey(masterKey, exportKey) {
    const timerId = perfMetrics.startTimer('wrap-master-key');
    
    try {
        const kek = await deriveKEK(exportKey);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        
        const wrappedKey = await crypto.subtle.wrapKey(
            'raw',
            masterKey,
            kek,
            { name: 'AES-GCM', iv, tagLength: 128 }
        );

        const result = new Uint8Array(iv.length + wrappedKey.byteLength);
        result.set(iv, 0);
        result.set(new Uint8Array(wrappedKey), iv.length);
        
        const duration = perfMetrics.endTimer(timerId, 'encryption', 'keyWrapping', { type: 'master' });
        console.log(`✅ Master key wrapped in ${duration?.toFixed(2)}ms`);
        
        return result;
    } catch (error) {
        perfMetrics.endTimer(timerId, 'encryption', 'keyWrapping', { type: 'master', error: error.message });
        perfMetrics.trackError('keyWrapping', error.message);
        throw error;
    }
}

/**
 * Unwrap master key using KEK derived from export key
 */
export async function unwrapMasterKey(wrappedData, exportKey) {
    const timerId = perfMetrics.startTimer('unwrap-master-key');
    
    try {
        const kek = await deriveKEK(exportKey);
        const iv = wrappedData.slice(0, 12);
        const wrappedKey = wrappedData.slice(12);

        const masterKey = await crypto.subtle.unwrapKey(
            'raw',
            wrappedKey,
            kek,
            { name: 'AES-GCM', iv, tagLength: 128 },
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
        
        const duration = perfMetrics.endTimer(timerId, 'encryption', 'keyUnwrapping', { type: 'master' });
        console.log(`✅ Master key unwrapped in ${duration?.toFixed(2)}ms`);
        
        return masterKey;
    } catch (error) {
        perfMetrics.endTimer(timerId, 'encryption', 'keyUnwrapping', { type: 'master', error: error.message });
        perfMetrics.trackError('keyUnwrapping', error.message);
        throw error;
    }
}

/**
 * Unwrap a file key using a share key (for public shares)
 */
export async function unwrapFileKeyForSharing(wrappedData, shareKey) {
    const timerId = perfMetrics.startTimer('unwrap-share-key');
    
    try {
        let wrappedBuffer;
        if (typeof wrappedData === 'string') {
            const binaryString = atob(wrappedData);
            wrappedBuffer = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                wrappedBuffer[i] = binaryString.charCodeAt(i);
            }
        } else {
            wrappedBuffer = wrappedData;
        }
        
        const iv = wrappedBuffer.slice(0, 12);
        const wrappedKey = wrappedBuffer.slice(12);

        const fileKey = await crypto.subtle.unwrapKey(
            'raw',
            wrappedKey,
            shareKey,
            { name: 'AES-GCM', iv, tagLength: 128 },
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
        );
        
        const duration = perfMetrics.endTimer(timerId, 'encryption', 'keyUnwrapping', { type: 'share' });
        console.log(`✅ Share key unwrapped in ${duration?.toFixed(2)}ms`);
        
        return fileKey;
    } catch (error) {
        perfMetrics.endTimer(timerId, 'encryption', 'keyUnwrapping', { type: 'share', error: error.message });
        perfMetrics.trackError('keyUnwrapping', error.message);
        throw error;
    }
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
export async function initializeMasterKey(userId, exportKey, options = {}) {
    const timerId = perfMetrics.startTimer('init-master-key');
    
    try {
        const { isFallback = false } = options;
        
        // If this is a fallback login, we need to handle it differently
        if (isFallback) {
            console.log('🔄 Fallback mode: Generating new master key');
            
            // Generate a new master key
            const masterKey = await generateMasterKey();
            
            // Store in memory (don't try to wrap with KEK since exportKey might be fallback)
            storeMasterKey(masterKey, userId);
            
            // Try to save wrapped key, but don't fail if it doesn't work
            try {
                // For fallback, we'll use a simple wrapping with the export key
                const iv = crypto.getRandomValues(new Uint8Array(12));
                const rawMasterKey = await crypto.subtle.exportKey('raw', masterKey);
                
                // Import export key as AES key for wrapping
                const kek = await crypto.subtle.importKey(
                    'raw',
                    exportKey,
                    { name: 'AES-GCM' },
                    false,
                    ['wrapKey']
                );
                
                const wrappedKey = await crypto.subtle.wrapKey(
                    'raw',
                    masterKey,
                    kek,
                    { name: 'AES-GCM', iv, tagLength: 128 }
                );
                
                const result = new Uint8Array(iv.length + wrappedKey.byteLength);
                result.set(iv, 0);
                result.set(new Uint8Array(wrappedKey), iv.length);
                
                await saveWrappedMasterKey(userId, result);
                console.log('✅ Fallback master key saved');
            } catch (saveError) {
                console.warn('⚠️ Could not save fallback master key:', saveError);
                // Continue anyway - user can still use the app
            }
            
            const duration = perfMetrics.endTimer(timerId, 'encryption', 'keyGeneration', { 
                type: 'master-init-fallback',
                userId
            });
            
            console.log(`✅ Fallback master key created in ${duration?.toFixed(2)}ms for user:`, userId);
            return masterKey;
        }

        // Normal OPAQUE flow
        const existing = await loadWrappedMasterKey(userId);
        if (existing.success) {
            return await loadMasterKey(userId, exportKey);
        }

        const masterKey = await generateMasterKey();
        const wrappedMek = await wrapMasterKey(masterKey, exportKey);
        
        const saveResult = await saveWrappedMasterKey(userId, wrappedMek);
        if (!saveResult.success) throw new Error('Failed to save wrapped key');

        storeMasterKey(masterKey, userId);
        
        const duration = perfMetrics.endTimer(timerId, 'encryption', 'keyGeneration', { 
            type: 'master-init',
            userId
        });
        
        console.log(`✅ Master key created in ${duration?.toFixed(2)}ms for user:`, userId);
        return masterKey;
    } catch (error) {
        perfMetrics.endTimer(timerId, 'encryption', 'keyGeneration', { 
            type: 'master-init', 
            error: error.message 
        });
        perfMetrics.trackError('keyGeneration', error.message);
        throw error;
    }
}

/**
 * Load master key for existing user
 */
export async function loadMasterKey(userId, exportKey, options = {}) {
    const timerId = perfMetrics.startTimer('load-master-key');
    
    try {
        const { isFallback = false } = options;
        
        // For fallback mode, we need to handle differently
        if (isFallback) {
            console.log('🔄 Fallback mode: Loading master key from memory or generating new');
            
            // Check if we already have it in memory
            const existingKey = getMasterKeyFromMemory(userId);
            if (existingKey) {
                return existingKey;
            }
            
            // Try to load from database
            const loadResult = await loadWrappedMasterKey(userId);
            if (loadResult.success) {
                try {
                    // Try to unwrap with fallback export key
                    const masterKey = await unwrapMasterKey(loadResult.data, exportKey);
                    storeMasterKey(masterKey, userId);
                    return masterKey;
                } catch (unwrapError) {
                    console.warn('⚠️ Could not unwrap existing key, generating new:', unwrapError);
                }
            }
            
            // Generate new master key
            return await initializeMasterKey(userId, exportKey, { isFallback: true });
        }

        // Normal OPAQUE flow
        const loadResult = await loadWrappedMasterKey(userId);
        if (!loadResult.success) throw new Error(loadResult.error);

        const masterKey = await unwrapMasterKey(loadResult.data, exportKey);
        storeMasterKey(masterKey, userId);
        
        const duration = perfMetrics.endTimer(timerId, 'encryption', 'keyUnwrapping', { 
            type: 'master-load',
            userId
        });
        
        console.log(`✅ Master key loaded in ${duration?.toFixed(2)}ms for user:`, userId);
        return masterKey;
    } catch (error) {
        perfMetrics.endTimer(timerId, 'encryption', 'keyUnwrapping', { 
            type: 'master-load', 
            error: error.message 
        });
        perfMetrics.trackError('keyUnwrapping', error.message);
        throw error;
    }
}

/**
 * Derive file encryption key from master key
 */
export async function deriveFileKey(masterKey, fileId) {
    const timerId = perfMetrics.startTimer('derive-file-key');
    
    try {
        const masterKeyRaw = await crypto.subtle.exportKey('raw', masterKey);
        
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            masterKeyRaw,
            { name: 'HKDF' },
            false,
            ['deriveKey']
        );

        const fileKey = await crypto.subtle.deriveKey(
            {
                name: 'HKDF',
                hash: 'SHA-256',
                salt: new TextEncoder().encode('SecureCloud-File-v2'),
                info: new TextEncoder().encode(`file-${fileId}`)
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
        
        const duration = perfMetrics.endTimer(timerId, 'encryption', 'keyDerivation', { 
            type: 'file',
            fileId
        });
        
        console.log(`✅ File key derived in ${duration?.toFixed(2)}ms`);
        
        return fileKey;
    } catch (error) {
        perfMetrics.endTimer(timerId, 'encryption', 'keyDerivation', { 
            type: 'file', 
            error: error.message 
        });
        perfMetrics.trackError('keyDerivation', error.message);
        throw error;
    }
}

/**
 * Export a key to base64 string
 */
export async function exportKeyToBase64(key) {
    try {
        const exported = await crypto.subtle.exportKey('raw', key);
        const bytes = new Uint8Array(exported);
        return btoa(String.fromCharCode(...bytes));
    } catch (error) {
        console.error('Failed to export key:', error);
        throw error;
    }
}

/**
 * Import a key from base64 string
 */
export async function importKeyFromBase64(base64Key, usages = ['encrypt', 'decrypt']) {
    try {
        const bytes = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));
        return await crypto.subtle.importKey(
            'raw',
            bytes,
            { name: 'AES-GCM', length: 256 },
            false,
            usages
        );
    } catch (error) {
        console.error('Failed to import key:', error);
        throw error;
    }
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

/**
 * Check if we're in fallback mode
 */
export function isInFallbackMode() {
    return isFallbackMode;
}

/**
 * Set fallback mode
 */
export function setFallbackMode(value) {
    isFallbackMode = value;
    console.log(`🔄 Fallback mode: ${value ? 'ON' : 'OFF'}`);
}