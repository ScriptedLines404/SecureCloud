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
import { generateShareKey, deriveShareKeyFromEmail, wrapFileKeyForSharing } from './keyManagementService';
import { perfMetrics } from '../utils/performanceMetrics';

// Generate a unique share token
export function generateShareToken() {
    return crypto.randomUUID();
}

// Save wrapped share key to database
async function saveShareKey(fileId, shareId, wrappedKey) {
    try {
        const { error } = await supabase
            .from('share_keys')
            .insert({
                file_id: fileId,
                share_id: shareId,
                wrapped_key: wrappedKey,
                key_version: '1.0'
            });

        if (error) {
            console.error('Save share key error:', error);
            throw error;
        }
        return { success: true };
    } catch (error) {
        console.error('Failed to save share key:', error);
        return { success: false, error: error.message };
    }
}

// Get wrapped share key from database
export async function getShareKey(shareId) {
    try {
        const { data, error } = await supabase
            .from('share_keys')
            .select('wrapped_key')
            .eq('share_id', shareId)
            .single();

        if (error || !data) {
            return { success: false, error: 'Share key not found' };
        }

        return { success: true, data: data.wrapped_key };
    } catch (error) {
        console.error('Get share key error:', error);
        return { success: false, error: error.message };
    }
}

// Create a share (public or private)
export async function createShare(fileId, userId, shareType = 'public', targetEmail = null, expiresInDays = 7) {
    const timerId = perfMetrics.startTimer(`share-creation-${shareType}`);
    const startTime = performance.now();
    
    try {
        console.log(`🔗 Creating ${shareType} share for file:`, fileId);
        
        // Generate share token
        const shareToken = generateShareToken();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);
        
        // Create share record
        const shareData = {
            file_id: fileId,
            user_id: userId,
            share_token: shareToken,
            share_type: shareType,
            expires_at: expiresAt.toISOString(),
            access_count: 0,
            email_verified: false
        };

        if (shareType === 'private' && targetEmail) {
            shareData.target_email = targetEmail.toLowerCase();
        }

        console.log('Inserting share with data:', shareData);

        const { data: share, error: shareError } = await supabase
            .from('shares')
            .insert(shareData)
            .select()
            .single();
            
        if (shareError) {
            console.error('Share creation error:', shareError);
            throw shareError;
        }
        
        console.log('Share created:', share);
        
        // Generate or derive share key
        let shareKey;
        const keyTimer = perfMetrics.startTimer(`share-key-${shareType}`);
        
        if (shareType === 'private') {
            shareKey = await deriveShareKeyFromEmail(targetEmail.toLowerCase(), share.id);
            console.log('✅ Private share key derived from email');
        } else {
            shareKey = await generateShareKey();
            console.log('✅ Public share key generated');
        }
        
        const keyDuration = perfMetrics.endTimer(keyTimer, 'encryption', 'keyGeneration', { 
            type: `share-${shareType}` 
        });
        
        console.log(`✅ Share key created in ${keyDuration?.toFixed(2)}ms`);
        
        // Wrap the file's master key with the share key
        const wrapTimer = perfMetrics.startTimer('wrap-share-key');
        const wrappedKey = await wrapFileKeyForSharing(fileId, shareKey);
        const wrapDuration = perfMetrics.endTimer(wrapTimer, 'encryption', 'keyWrapping', { 
            type: `share-${shareType}` 
        });
        
        console.log(`✅ Master key wrapped in ${wrapDuration?.toFixed(2)}ms`);
        
        // Save the wrapped key
        const keyResult = await saveShareKey(fileId, share.id, wrappedKey);
        if (!keyResult.success) {
            throw new Error(keyResult.error);
        }
        
        // Export the share key to include in the URL hash (only for public shares)
        let shareKeyBase64 = null;
        if (shareType === 'public') {
            const exportTimer = perfMetrics.startTimer('export-share-key');
            const exportedShareKey = await crypto.subtle.exportKey('raw', shareKey);
            shareKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(exportedShareKey)));
            const exportDuration = perfMetrics.endTimer(exportTimer, 'encryption', 'keyDerivation', { 
                type: 'share-export' 
            });
            console.log(`✅ Share key exported in ${exportDuration?.toFixed(2)}ms, length: ${shareKeyBase64.length}`);
        }
        
        const totalDuration = performance.now() - startTime;
        
        perfMetrics.metrics.sharing[shareType === 'public' ? 'publicShareCreation' : 'privateShareCreation'].push({
            duration: totalDuration,
            fileId,
            userId,
            expiresInDays,
            timestamp: Date.now(),
            sessionId: perfMetrics.sessionId
        });
        
        perfMetrics.endTimer(timerId, 'sharing', shareType === 'public' ? 'publicShareCreation' : 'privateShareCreation', {
            fileId,
            expiresInDays
        });
        
        console.log(`✅ ${shareType} share created in ${totalDuration.toFixed(2)}ms:`, shareToken);
        
        return { 
            success: true, 
            share: {
                ...share,
                share_key: shareKeyBase64
            },
            performance: {
                total: totalDuration,
                keyGeneration: keyDuration,
                keyWrapping: wrapDuration
            }
        };
    } catch (error) {
        const totalDuration = performance.now() - startTime;
        
        perfMetrics.metrics.sharing[shareType === 'public' ? 'publicShareCreation' : 'privateShareCreation'].push({
            duration: totalDuration,
            fileId,
            userId,
            error: error.message,
            timestamp: Date.now(),
            sessionId: perfMetrics.sessionId
        });
        
        perfMetrics.endTimer(timerId, 'sharing', shareType === 'public' ? 'publicShareCreation' : 'privateShareCreation', {
            fileId,
            error: error.message
        });
        
        perfMetrics.trackError('shareCreation', error.message);
        
        console.error(`❌ Failed to create share after ${totalDuration.toFixed(2)}ms:`, error);
        return { success: false, error: error.message };
    }
}

// Get share info by token
export async function getShareByToken(shareToken) {
    try {
        console.log('Getting share for token:', shareToken);
        
        const response = await fetch(`/api/shares/${shareToken}`);
        const result = await response.json();
        
        console.log('Share by token response:', result);
        
        if (!response.ok) {
            return { success: false, error: result.error || 'Share not found' };
        }
        
        return { success: true, share: result.share };
    } catch (error) {
        console.error('getShareByToken error:', error);
        return { success: false, error: error.message };
    }
}

// Request verification code for private share
export async function requestVerificationCode(shareToken, email) {
    const timerId = perfMetrics.startTimer('request-verification');
    const startTime = performance.now();
    
    try {
        console.log('Requesting code for:', shareToken, email);
        
        const response = await fetch('/api/shares/request-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shareToken, email })
        });
        
        const result = await response.json();
        const duration = performance.now() - startTime;
        
        perfMetrics.metrics.sharing.shareVerification.push({
            duration,
            type: 'request',
            status: response.status,
            timestamp: Date.now(),
            sessionId: perfMetrics.sessionId
        });
        
        perfMetrics.endTimer(timerId, 'sharing', 'shareVerification', {
            type: 'request',
            status: response.status
        });
        
        console.log(`Verification request completed in ${duration.toFixed(2)}ms`);
        
        if (!response.ok) {
            return { success: false, error: result.error || 'Failed to send code' };
        }
        
        return { success: true, message: result.message };
    } catch (error) {
        const duration = performance.now() - startTime;
        
        perfMetrics.metrics.sharing.shareVerification.push({
            duration,
            type: 'request',
            error: error.message,
            timestamp: Date.now(),
            sessionId: perfMetrics.sessionId
        });
        
        perfMetrics.endTimer(timerId, 'sharing', 'shareVerification', {
            type: 'request',
            error: error.message
        });
        
        perfMetrics.trackError('shareVerification', error.message);
        
        console.error(`requestVerificationCode error after ${duration.toFixed(2)}ms:`, error);
        return { success: false, error: error.message };
    }
}

// Verify code and get access
export async function verifyCode(shareToken, email, code) {
    const timerId = perfMetrics.startTimer('verify-code');
    const startTime = performance.now();
    
    try {
        console.log('Verifying code for:', shareToken, email, code);
        
        const response = await fetch('/api/shares/verify-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shareToken, email, code })
        });
        
        const result = await response.json();
        const duration = performance.now() - startTime;
        
        perfMetrics.metrics.sharing.shareVerification.push({
            duration,
            type: 'verify',
            status: response.status,
            timestamp: Date.now(),
            sessionId: perfMetrics.sessionId
        });
        
        perfMetrics.endTimer(timerId, 'sharing', 'shareVerification', {
            type: 'verify',
            status: response.status
        });
        
        console.log(`Verification completed in ${duration.toFixed(2)}ms`);
        
        if (!response.ok) {
            return { success: false, error: result.error || 'Verification failed' };
        }
        
        return { 
            success: true, 
            share: result.share,
            wrappedKey: result.wrappedKey 
        };
    } catch (error) {
        const duration = performance.now() - startTime;
        
        perfMetrics.metrics.sharing.shareVerification.push({
            duration,
            type: 'verify',
            error: error.message,
            timestamp: Date.now(),
            sessionId: perfMetrics.sessionId
        });
        
        perfMetrics.endTimer(timerId, 'sharing', 'shareVerification', {
            type: 'verify',
            error: error.message
        });
        
        perfMetrics.trackError('shareVerification', error.message);
        
        console.error(`verifyCode error after ${duration.toFixed(2)}ms:`, error);
        return { success: false, error: error.message };
    }
}

// Get wrapped key for share (after verification)
export async function getWrappedKeyForShare(shareId) {
    try {
        console.log('Getting wrapped key for share:', shareId);
        
        const response = await fetch(`/api/shares/${shareId}/key`);
        const result = await response.json();
        
        if (!response.ok) {
            return { success: false, error: result.error || 'Key not found' };
        }
        
        return { success: true, data: result.wrappedKey };
    } catch (error) {
        console.error('getWrappedKeyForShare error:', error);
        return { success: false, error: error.message };
    }
}

// Increment share access count
export async function incrementShareAccess(shareId) {
    const timerId = perfMetrics.startTimer('increment-access');
    const startTime = performance.now();
    
    try {
        const { error } = await supabase
            .rpc('increment_share_access', { share_id: shareId });
            
        const duration = performance.now() - startTime;
        
        perfMetrics.metrics.sharing.shareAccess.push({
            duration,
            shareId,
            timestamp: Date.now(),
            sessionId: perfMetrics.sessionId
        });
        
        perfMetrics.endTimer(timerId, 'sharing', 'shareAccess', { shareId });
        
        if (error) {
            console.error('Increment access error:', error);
            return false;
        }
        return true;
    } catch (error) {
        const duration = performance.now() - startTime;
        
        perfMetrics.metrics.sharing.shareAccess.push({
            duration,
            shareId,
            error: error.message,
            timestamp: Date.now(),
            sessionId: perfMetrics.sessionId
        });
        
        perfMetrics.endTimer(timerId, 'sharing', 'shareAccess', { 
            shareId, 
            error: error.message 
        });
        
        perfMetrics.trackError('shareAccess', error.message);
        
        console.error(`Failed to increment access count after ${duration.toFixed(2)}ms:`, error);
        return false;
    }
}

// Get user's shares
export async function getUserShares(userId) {
    try {
        console.log('Getting shares for user:', userId);
        
        const { data, error } = await supabase
            .from('shares')
            .select(`
                *,
                files:file_id (
                    id,
                    file_name,
                    original_file_name,
                    file_size
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
            
        if (error) {
            console.error('Get user shares error:', error);
            throw error;
        }
        
        console.log(`Found ${data.length} shares for user`);
        return { success: true, shares: data };
    } catch (error) {
        console.error('getUserShares error:', error);
        return { success: false, error: error.message };
    }
}

// Delete share
export async function deleteShare(shareId) {
    try {
        console.log('Deleting share:', shareId);
        
        const { error } = await supabase
            .from('shares')
            .delete()
            .eq('id', shareId);
            
        if (error) {
            console.error('Delete share error:', error);
            throw error;
        }
        
        console.log('Share deleted successfully');
        return { success: true };
    } catch (error) {
        console.error('deleteShare error:', error);
        return { success: false, error: error.message };
    }
}

// Create shareable link
export function createShareableLink(shareToken, fileId, shareKey = null, baseUrl = window.location.origin) {
    if (shareKey) {
        const urlSafeKey = shareKey.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        return `${baseUrl}/shared/${shareToken}#fileId=${fileId}&key=${urlSafeKey}`;
    } else {
        return `${baseUrl}/private/${shareToken}`;
    }
}

// Extract and decode URL-safe base64 parameters from URL hash
export function extractShareParamsFromHash() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const fileId = params.get('fileId');
    let shareKey = params.get('key');
    
    if (shareKey) {
        shareKey = shareKey.replace(/-/g, '+').replace(/_/g, '/');
        while (shareKey.length % 4) {
            shareKey += '=';
        }
    }
    
    return { fileId, shareKey };
}

// Check if a share token is valid (quick check)
export async function validateShareToken(shareToken) {
    try {
        const response = await fetch(`/api/shares/${shareToken}`);
        return response.ok;
    } catch (error) {
        return false;
    }
}