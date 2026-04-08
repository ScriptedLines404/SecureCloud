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
    exportKeyToRaw, 
    importKeyFromRaw,
    encryptWithAESGCM,
    decryptWithAESGCM,
    deriveKeyHKDF,
    wrapKey,
    unwrapKey,
    generateIV,
    sha256,
    hmacSha256,
    constantTimeCompare,
    generateSecureToken,
    encodeBase64Url,
    decodeBase64Url
} from './encryption-webcrypto';
import { getMasterKeyFromMemory } from '../services/keyManagementService';
import { perfMetrics } from './performanceMetrics';

/**
 * Encrypt a file using the Master Key
 */
export async function encryptFile(file, fileId) {
    console.log(`🔐 Encrypting file: ${file.name} (${file.size} bytes)`);
    
    const startTime = performance.now();
    
    try {
        // Get master key from memory
        const masterKey = getMasterKeyFromMemory();
        if (!masterKey) {
            throw new Error('Master key not available. Please log in again.');
        }
        
        // Derive file-specific key from master key
        const fileKey = await deriveFileKey(masterKey, fileId);
        
        // Read file as ArrayBuffer
        const fileBuffer = await file.arrayBuffer();
        
        // Encrypt the file
        const encryptedData = await encryptWithAESGCM(fileKey, fileBuffer);
        
        const duration = performance.now() - startTime;
        const throughput = file.size / (duration / 1000);
        
        console.log(`✅ File encrypted successfully in ${duration.toFixed(2)}ms`);
        console.log(`📊 Throughput: ${(throughput / (1024 * 1024)).toFixed(2)} MB/s`);
        
        return encryptedData;
    } catch (error) {
        console.error('Encryption failed:', error);
        throw new Error(`Encryption failed: ${error.message}`);
    }
}

/**
 * Decrypt a file using the Master Key
 */
export async function decryptFile(encryptedData, fileId) {
    console.log(`🔐 Decrypting file...`);
    
    const startTime = performance.now();
    
    try {
        // Get master key from memory
        const masterKey = getMasterKeyFromMemory();
        if (!masterKey) {
            throw new Error('Master key not available. Please log in again.');
        }
        
        // Derive file-specific key from master key
        const fileKey = await deriveFileKey(masterKey, fileId);
        
        // Decrypt the file
        const decryptedBuffer = await decryptWithAESGCM(fileKey, encryptedData);
        
        const duration = performance.now() - startTime;
        const throughput = decryptedBuffer.byteLength / (duration / 1000);
        
        console.log(`✅ File decrypted successfully in ${duration.toFixed(2)}ms`);
        console.log(`📊 Throughput: ${(throughput / (1024 * 1024)).toFixed(2)} MB/s`);
        
        return decryptedBuffer;
    } catch (error) {
        console.error('Decryption failed:', error);
        throw new Error(`Decryption failed: ${error.message}`);
    }
}

/**
 * Derive file-specific key from master key
 */
export async function deriveFileKey(masterKey, fileId) {
    const salt = new TextEncoder().encode('SecureCloud-File-v2');
    const info = new TextEncoder().encode(`file-${fileId}`);
    
    const masterKeyRaw = await crypto.subtle.exportKey('raw', masterKey);
    
    const fileKey = await deriveKeyHKDF(masterKeyRaw, salt, info);
    
    return fileKey;
}

/**
 * Generate a unique file ID
 */
export function generateFileId() {
    return crypto.randomUUID();
}

/**
 * Create a file metadata object
 */
export function createFileMetadata(file, fileId, userId) {
    return {
        fileId,
        userId,
        originalName: file.name,
        fileSize: file.size,
        fileType: file.type || 'application/octet-stream',
        lastModified: file.lastModified,
        uploadedAt: new Date().toISOString(),
        encryptionVersion: 'AES-GCM-256-MEK'
    };
}

// Re-export utilities
export {
    generateEncryptionKey,
    exportKeyToRaw,
    importKeyFromRaw,
    encryptWithAESGCM,
    decryptWithAESGCM,
    deriveKeyHKDF,
    wrapKey,
    unwrapKey,
    generateIV,
    sha256,
    hmacSha256,
    constantTimeCompare,
    generateSecureToken,
    encodeBase64Url,
    decodeBase64Url
};