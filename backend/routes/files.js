// backend/routes/files.js
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Save file metadata after upload
 */
router.post('/metadata', async (req, res) => {
    try {
        const { fileId, fileName, fileSize, fileType, driveFileId, driveFileName, driveFileUrl } = req.body;
        
        // Get user ID from session - THIS IS CRITICAL
        const userId = req.session?.userId;
        
        console.log('📝 Metadata save request:');
        console.log('- fileId:', fileId);
        console.log('- fileName:', fileName);
        console.log('- userId from session:', userId);
        
        if (!userId) {
            console.error('❌ No userId in session - authentication failed');
            return res.status(401).json({ error: 'Unauthorized - no user session' });
        }

        if (!fileId) {
            console.error('❌ No fileId provided');
            return res.status(400).json({ error: 'fileId is required' });
        }

        console.log(`💾 Saving metadata for file: ${fileName} (${fileSize} bytes)`);

        // Insert metadata
        const { data, error } = await supabase
            .from('files')
            .insert({
                id: fileId,
                user_id: userId,
                file_name: fileName,
                file_size: fileSize,
                file_type: fileType || 'application/octet-stream',
                drive_file_id: driveFileId,
                drive_file_name: driveFileName,
                drive_file_url: driveFileUrl,
                encrypted: true,
                encryption_version: 'AES-GCM-256'
            })
            .select()
            .single();

        if (error) {
            console.error('❌ Failed to save metadata:', error);
            
            // Check for specific error types
            if (error.code === '23505') { // Unique violation
                return res.status(409).json({ error: 'File already exists' });
            } else if (error.code === '23503') { // Foreign key violation
                console.error('❌ Foreign key violation - user_id not found in users table:', userId);
                return res.status(400).json({ error: 'Invalid user ID' });
            } else if (error.code === '22P02') { // Invalid UUID
                console.error('❌ Invalid UUID format:', fileId);
                return res.status(400).json({ error: 'Invalid file ID format' });
            }
            return res.status(500).json({ error: 'Failed to save file metadata' });
        }

        console.log(`✅ Metadata saved successfully. File ID: ${data.id}`);
        res.json({
            success: true,
            file: data
        });

    } catch (error) {
        console.error('❌ Error saving metadata:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * Get user's files
 */
router.get('/list', async (req, res) => {
    try {
        const userId = req.session?.userId;
        
        console.log('📋 List files request - userId from session:', userId);
        
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { data, error } = await supabase
            .from('files')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ Failed to list files:', error);
            return res.status(500).json({ error: 'Failed to list files' });
        }

        console.log(`✅ Found ${data.length} files for user ${userId}`);
        res.json({
            success: true,
            files: data
        });

    } catch (error) {
        console.error('❌ Error listing files:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * Get file metadata
 */
router.get('/metadata/:fileId', async (req, res) => {
    try {
        const userId = req.session?.userId;
        const { fileId } = req.params;
        
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { data, error } = await supabase
            .from('files')
            .select('*')
            .eq('id', fileId)
            .eq('user_id', userId)
            .single();

        if (error) {
            console.error('❌ Failed to get file metadata:', error);
            return res.status(404).json({ error: 'File not found' });
        }

        res.json({
            success: true,
            file: data
        });

    } catch (error) {
        console.error('❌ Error getting file metadata:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * Delete file metadata
 */
router.delete('/:fileId', async (req, res) => {
    try {
        const userId = req.session?.userId;
        const { fileId } = req.params;
        
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Verify ownership
        const { data: existing, error: checkError } = await supabase
            .from('files')
            .select('id')
            .eq('id', fileId)
            .eq('user_id', userId)
            .single();

        if (checkError || !existing) {
            return res.status(404).json({ error: 'File not found' });
        }

        const { error } = await supabase
            .from('files')
            .delete()
            .eq('id', fileId);

        if (error) {
            console.error('❌ Failed to delete metadata:', error);
            return res.status(500).json({ error: 'Failed to delete file metadata' });
        }

        res.json({
            success: true,
            message: 'File metadata deleted'
        });

    } catch (error) {
        console.error('❌ Error deleting file metadata:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * Get storage stats
 */
router.get('/stats', async (req, res) => {
    try {
        const userId = req.session?.userId;
        
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Get total file count and size
        const { data, error } = await supabase
            .from('files')
            .select('file_size')
            .eq('user_id', userId);

        if (error) {
            console.error('❌ Failed to get stats:', error);
            return res.status(500).json({ error: 'Failed to get stats' });
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

        res.json({
            success: true,
            fileCount,
            totalBytes,
            storageUsed
        });

    } catch (error) {
        console.error('❌ Error getting stats:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;