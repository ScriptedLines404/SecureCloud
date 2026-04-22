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

import { supabase } from '../utils/supabase';

/**
 * Save file metadata directly to Supabase
 */
export async function saveFileMetadata(fileData) {
    try {
        console.log('📤 Saving metadata directly to Supabase:', fileData);
        
        // Map the incoming data to match database column names
        const dbRecord = {
            id: fileData.fileId,
            user_id: fileData.userId,
            file_name: fileData.fileName || fileData.originalName, // Use fileName or fallback to originalName
            file_size: fileData.fileSize,
            file_type: fileData.fileType || 'application/octet-stream',
            drive_file_id: fileData.driveFileId,
            drive_file_name: fileData.driveFileName,
            drive_file_url: fileData.driveFileUrl,
            original_file_name: fileData.originalName || fileData.fileName, // Store original name separately
            encrypted: true,
            encryption_version: 'AES-GCM-256'
        };

        console.log('📝 Database record:', dbRecord);

        const { data, error } = await supabase
            .from('files')
            .insert(dbRecord)
            .select()
            .single();

        if (error) {
            console.error('❌ Failed to save metadata:', error);
            
            // Check if it's a duplicate
            if (error.code === '23505') {
                return { 
                    success: false, 
                    error: 'File already exists',
                    code: 'DUPLICATE'
                };
            }
            
            return { 
                success: false, 
                error: error.message,
                code: error.code,
                details: error.details
            };
        }

        console.log('✅ Metadata saved successfully:', data);
        return { success: true, data };
        
    } catch (error) {
        console.error('❌ Error saving metadata:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get user's files from Supabase
 */
export async function getUserFiles(userId) {
    try {
        console.log('📋 Fetching files for user:', userId);
        
        const { data, error } = await supabase
            .from('files')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ Failed to fetch files:', error);
            return { success: false, error: error.message };
        }

        console.log(`✅ Found ${data.length} files`);
        return { success: true, data };
        
    } catch (error) {
        console.error('❌ Error fetching files:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Delete file metadata from Supabase
 */
export async function deleteFileMetadata(fileId) {
    try {
        console.log('🗑️ Deleting metadata for file:', fileId);
        
        const { error } = await supabase
            .from('files')
            .delete()
            .eq('id', fileId);

        if (error) {
            console.error('❌ Failed to delete metadata:', error);
            return { success: false, error: error.message };
        }

        console.log('✅ Metadata deleted successfully');
        return { success: true };
        
    } catch (error) {
        console.error('❌ Error deleting metadata:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get storage stats for user
 */
export async function getUserStats(userId) {
    try {
        const { data, error } = await supabase
            .from('files')
            .select('file_size')
            .eq('user_id', userId);

        if (error) {
            return { success: false, error: error.message };
        }

        const fileCount = data.length;
        const totalBytes = data.reduce((sum, file) => sum + (file.file_size || 0), 0);
        
        // Format storage used
        let storageUsed;
        if (totalBytes < 1024 * 1024) {
            storageUsed = `${Math.round(totalBytes / 1024)} KB`;
        } else if (totalBytes < 1024 * 1024 * 1024) {
            storageUsed = `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
        } else {
            storageUsed = `${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        }

        return {
            success: true,
            fileCount,
            totalBytes,
            storageUsed
        };
        
    } catch (error) {
        return { success: false, error: error.message };
    }
}