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

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const emailService = require('../services/email-service');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize email service
emailService.initialize();

// Cleanup verification codes every 5 minutes
setInterval(() => {
    emailService.cleanup();
}, 5 * 60 * 1000);

// Create share (public or private)
router.post('/', async (req, res) => {
    try {
        const { fileId, shareType, expiresInDays = 7, targetEmail } = req.body;
        const userId = req.session?.userId;
        
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Verify file ownership
        const { data: file, error: fileError } = await supabase
            .from('files')
            .select('id, file_name, user_id')
            .eq('id', fileId)
            .eq('user_id', userId)
            .single();

        if (fileError || !file) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Generate share token
        const shareToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);

        // For private shares, validate email
        if (shareType === 'private') {
            if (!targetEmail || !targetEmail.includes('@')) {
                return res.status(400).json({ error: 'Valid target email required for private share' });
            }
        }

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

        const { data: share, error } = await supabase
            .from('shares')
            .insert(shareData)
            .select()
            .single();

        if (error) {
            console.error('Share insert error:', error);
            throw error;
        }

        // Get sender's email
        const { data: user } = await supabase
            .from('users')
            .select('email')
            .eq('id', userId)
            .single();

        res.json({
            success: true,
            share: {
                ...share,
                share_link: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/private/${shareToken}`,
                sender_email: user?.email
            }
        });

    } catch (error) {
        console.error('Share creation error:', error);
        res.status(500).json({ error: 'Failed to create share' });
    }
});

// Get share info (for both public and private) - FIXED to include drive_file_id
router.get('/:shareToken', async (req, res) => {
    // Set CORS headers for public access
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    try {
        const { shareToken } = req.params;

        console.log('Getting share for token:', shareToken);

        const { data: share, error } = await supabase
            .from('shares')
            .select(`
                id,
                share_type,
                target_email,
                expires_at,
                file_id,
                email_verified,
                files:file_id (
                    id,
                    file_name,
                    original_file_name,
                    file_size,
                    file_type,
                    drive_file_id,
                    drive_file_url
                )
            `)
            .eq('share_token', shareToken)
            .single();

        if (error || !share) {
            console.log('Share not found:', error);
            return res.status(404).json({ error: 'Share not found' });
        }

        // Check expiration
        if (share.expires_at && new Date(share.expires_at) < new Date()) {
            return res.status(410).json({ error: 'Share has expired' });
        }

        // For private shares, return limited info and indicate verification needed
        if (share.share_type === 'private') {
            return res.json({
                success: true,
                share: {
                    id: share.id,
                    share_type: share.share_type,
                    file_name: share.files.file_name,
                    file_size: share.files.file_size,
                    requiresVerification: true,
                    email_verified: share.email_verified
                }
            });
        }

        // For public shares, return everything including drive_file_id
        console.log('Returning public share with drive_file_id:', share.files.drive_file_id);
        
        res.json({
            success: true,
            share: {
                id: share.id,
                share_type: share.share_type,
                expires_at: share.expires_at,
                file_id: share.file_id,
                created_at: share.created_at,
                files: {
                    id: share.files.id,
                    file_name: share.files.file_name,
                    original_file_name: share.files.original_file_name,
                    file_size: share.files.file_size,
                    file_type: share.files.file_type,
                    drive_file_id: share.files.drive_file_id,
                    drive_file_url: share.files.drive_file_url
                }
            }
        });

    } catch (error) {
        console.error('Get share error:', error);
        res.status(500).json({ error: 'Failed to get share' });
    }
});

// Public route to request verification code - NO AUTH REQUIRED
router.post('/request-code', async (req, res) => {
    // Set CORS headers for public access
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    try {
        const { shareToken, email } = req.body;

        if (!shareToken || !email) {
            return res.status(400).json({ error: 'Share token and email required' });
        }

        console.log('Requesting code for:', shareToken, email);

        // Get share info
        const { data: share, error: shareError } = await supabase
            .from('shares')
            .select(`
                *,
                files:file_id (
                    file_name,
                    user_id
                )
            `)
            .eq('share_token', shareToken)
            .single();

        if (shareError || !share) {
            console.log('Share not found:', shareError);
            return res.status(404).json({ error: 'Share not found' });
        }

        // Verify this is a private share
        if (share.share_type !== 'private') {
            return res.status(400).json({ error: 'Not a private share' });
        }

        // Verify email matches target email
        if (share.target_email !== email.toLowerCase()) {
            console.log('Email mismatch:', share.target_email, email);
            return res.status(403).json({ error: 'This share is not intended for this email' });
        }

        // Check expiration
        if (share.expires_at && new Date(share.expires_at) < new Date()) {
            return res.status(410).json({ error: 'Share has expired' });
        }

        // Get sender's email
        const { data: user } = await supabase
            .from('users')
            .select('email')
            .eq('id', share.user_id)
            .single();

        // Generate and store verification code
        const code = emailService.generateVerificationCode();
        emailService.storeVerificationCode(email, code, share.id);

        // Send email
        const emailResult = await emailService.sendVerificationEmail(
            email,
            code,
            share.files.file_name,
            user?.email || 'Someone'
        );

        if (!emailResult.success) {
            return res.status(500).json({ error: 'Failed to send verification email' });
        }

        res.json({
            success: true,
            message: 'Verification code sent'
        });

    } catch (error) {
        console.error('Request code error:', error);
        res.status(500).json({ error: 'Failed to request verification code' });
    }
});

// Public route to verify code - NO AUTH REQUIRED
router.post('/verify-code', async (req, res) => {
    // Set CORS headers for public access
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    try {
        const { shareToken, email, code } = req.body;

        if (!shareToken || !email || !code) {
            return res.status(400).json({ error: 'Share token, email, and code required' });
        }

        console.log('Verifying code for:', shareToken, email);

        // Verify the code
        const verification = emailService.verifyCode(email, code);
        
        if (!verification.valid) {
            return res.status(401).json({ error: verification.reason });
        }

        // Get share info with the shareId from verification
        const { data: share, error: shareError } = await supabase
            .from('shares')
            .select(`
                *,
                files:file_id (
                    id,
                    file_name,
                    original_file_name,
                    file_size,
                    file_type,
                    drive_file_id
                )
            `)
            .eq('id', verification.shareId)
            .single();

        if (shareError || !share) {
            console.log('Share not found:', shareError);
            return res.status(404).json({ error: 'Share not found' });
        }

        // Double-check email match
        if (share.target_email !== email.toLowerCase()) {
            return res.status(403).json({ error: 'Email mismatch' });
        }

        // Check expiration
        if (share.expires_at && new Date(share.expires_at) < new Date()) {
            return res.status(410).json({ error: 'Share has expired' });
        }

        // Update email_verified status
        await supabase
            .from('shares')
            .update({ email_verified: true })
            .eq('id', share.id);

        // Increment access count
        await supabase.rpc('increment_share_access', { share_id: share.id });

        // Get the wrapped key for this share
        const { data: keyData } = await supabase
            .from('share_keys')
            .select('wrapped_key')
            .eq('share_id', share.id)
            .single();

        res.json({
            success: true,
            share,
            wrappedKey: keyData?.wrapped_key
        });

    } catch (error) {
        console.error('Verify code error:', error);
        res.status(500).json({ error: 'Failed to verify code' });
    }
});

// Public route to get wrapped key - NO AUTH REQUIRED
router.get('/:shareId/key', async (req, res) => {
    // Set CORS headers for public access
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    try {
        const { shareId } = req.params;

        const { data: keyData, error } = await supabase
            .from('share_keys')
            .select('wrapped_key')
            .eq('share_id', shareId)
            .single();

        if (error || !keyData) {
            return res.status(404).json({ error: 'Key not found' });
        }

        res.json({
            success: true,
            wrappedKey: keyData.wrapped_key
        });

    } catch (error) {
        console.error('Get key error:', error);
        res.status(500).json({ error: 'Failed to get key' });
    }
});

// Delete share (protected)
router.delete('/:shareId', async (req, res) => {
    try {
        const { shareId } = req.params;
        const userId = req.session?.userId;

        // Verify ownership
        const { data: share, error: checkError } = await supabase
            .from('shares')
            .select('user_id')
            .eq('id', shareId)
            .single();

        if (checkError || !share) {
            return res.status(404).json({ error: 'Share not found' });
        }

        if (share.user_id !== userId) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { error } = await supabase
            .from('shares')
            .delete()
            .eq('id', shareId);

        if (error) throw error;

        res.json({ success: true });

    } catch (error) {
        console.error('Delete share error:', error);
        res.status(500).json({ error: 'Failed to delete share' });
    }
});

// Get user's shares (protected)
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const sessionUserId = req.session?.userId;

        if (!sessionUserId || sessionUserId !== userId) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const { data: shares, error } = await supabase
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

        if (error) throw error;

        res.json({
            success: true,
            shares
        });

    } catch (error) {
        console.error('Get user shares error:', error);
        res.status(500).json({ error: 'Failed to get shares' });
    }
});

module.exports = router;