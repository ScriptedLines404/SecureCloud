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

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const opaqueServer = require('../services/opaque-server-webcrypto');
const crypto = require('crypto');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Session store
const sessionStore = {
    sessions: new Map(),
    
    getSession(token) {
        return this.sessions.get(token);
    },
    
    setSession(token, sessionData) {
        this.sessions.set(token, sessionData);
    },
    
    deleteSession(token) {
        this.sessions.delete(token);
    },
    
    createSession(userId, sessionToken, exportKey) {
        this.sessions.set(sessionToken, {
            userId,
            exportKey,
            createdAt: Date.now(),
            expiresAt: Date.now() + 24 * 60 * 60 * 1000
        });
    },
    
    cleanup() {
        const now = Date.now();
        for (const [token, session] of this.sessions.entries()) {
            if (session.expiresAt < now) {
                this.sessions.delete(token);
            }
        }
    }
};

setInterval(() => {
    sessionStore.cleanup();
}, 15 * 60 * 1000);

// Registration: Step 1
router.post('/register/start', async (req, res) => {
    try {
        const { email, registrationRequest } = req.body;
        
        console.log('📝 /register/start - Email:', email);
        console.log('registrationRequest length:', registrationRequest?.length);
        
        if (!email || !registrationRequest) {
            return res.status(400).json({ 
                error: 'Invalid credentials',
                code: 'REGISTRATION_FAILED'
            });
        }

        // Check if user exists
        const { data: existing, error: checkError } = await supabase
            .from('users')
            .select('email')
            .eq('email', email.toLowerCase())
            .maybeSingle();

        if (existing) {
            console.log('User already exists:', email);
            return res.status(400).json({ 
                error: 'Invalid credentials',
                code: 'REGISTRATION_FAILED'
            });
        }

        // Start OPAQUE registration
        const result = await opaqueServer.startRegistration(
            email.toLowerCase(),
            registrationRequest
        );

        res.json({ 
            success: true,
            sessionId: result.sessionId, 
            registrationResponse: result.registrationResponse
        });

    } catch (error) {
        console.error('Registration start error:', error.message);
        res.status(400).json({ 
            error: 'Invalid credentials',
            code: 'REGISTRATION_FAILED'
        });
    }
});

// Registration: Step 2
router.post('/register/finish', async (req, res) => {
    try {
        const { email, sessionId, registrationRecord } = req.body;
        
        if (!email || !sessionId || !registrationRecord) {
            return res.status(400).json({ 
                error: 'Invalid credentials',
                code: 'REGISTRATION_FAILED'
            });
        }

        console.log('📝 /register/finish - Email:', email);

        const result = await opaqueServer.finishRegistration(sessionId, registrationRecord);

        // Insert user
        const { data: user, error: insertError } = await supabase
            .from('users')
            .insert({
                email: email.toLowerCase(),
                registration_record: registrationRecord,
                failed_attempts: 0
            })
            .select('id')
            .single();

        if (insertError) {
            console.error('User creation error:', insertError);
            return res.status(500).json({ 
                error: 'Server error',
                code: 'SERVER_ERROR'
            });
        }

        // Create empty key entry
        await supabase
            .from('user_keys')
            .insert({
                user_id: user.id,
                wrapped_mek: ''
            });

        res.json({ 
            success: true,
            message: 'Registration complete',
            userId: user.id
        });

    } catch (error) {
        console.error('Registration finish error:', error.message);
        res.status(400).json({ 
            error: 'Invalid credentials',
            code: 'REGISTRATION_FAILED'
        });
    }
});

// Login: Step 1
router.post('/login/start', async (req, res) => {
    try {
        const { email, authenticationRequest } = req.body;
        
        if (!email || !authenticationRequest) {
            return res.status(400).json({ 
                error: 'Invalid credentials',
                code: 'AUTHENTICATION_FAILED'
            });
        }

        console.log('📝 /login/start - Email:', email);

        const { data: user, error: fetchError } = await supabase
            .from('users')
            .select('registration_record, failed_attempts, locked_until')
            .eq('email', email.toLowerCase())
            .single();

        if (fetchError || !user) {
            await new Promise(resolve => setTimeout(resolve, 100));
            return res.status(400).json({ 
                error: 'Invalid credentials',
                code: 'AUTHENTICATION_FAILED'
            });
        }

        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            return res.status(423).json({ 
                error: 'Account temporarily locked',
                code: 'ACCOUNT_LOCKED'
            });
        }

        const result = await opaqueServer.startAuthentication(
            email.toLowerCase(),
            authenticationRequest,
            user.registration_record
        );

        res.json({ 
            success: true,
            sessionId: result.sessionId,
            authenticationResponse: result.authenticationResponse
        });

    } catch (error) {
        console.error('Login start error:', error.message);
        res.status(400).json({ 
            error: 'Invalid credentials',
            code: 'AUTHENTICATION_FAILED'
        });
    }
});

// Login: Step 2
router.post('/login/finish', async (req, res) => {
    try {
        const { email, sessionId, authenticationFinal } = req.body;
        
        if (!email || !sessionId || !authenticationFinal) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        console.log('📝 /login/finish - Email:', email);

        const { data: user, error: fetchError } = await supabase
            .from('users')
            .select('id, failed_attempts, locked_until')
            .eq('email', email.toLowerCase())
            .single();

        if (fetchError || !user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        try {
            const result = await opaqueServer.finishAuthentication(sessionId, authenticationFinal);
            
            sessionStore.createSession(user.id, result.sessionToken, result.exportKey);

            await supabase
                .from('users')
                .update({
                    failed_attempts: 0,
                    locked_until: null,
                    last_login: new Date().toISOString()
                })
                .eq('id', user.id);

            const { data: existingKey } = await supabase
                .from('user_keys')
                .select('wrapped_mek')
                .eq('user_id', user.id)
                .maybeSingle();

            const isFirstLogin = !existingKey || !existingKey.wrapped_mek;

            res.json({
                success: true,
                userId: user.id,
                sessionToken: result.sessionToken,
                isFirstLogin
            });

        } catch (authError) {
            console.error('Authentication failed:', authError.message);
            
            const newFailedAttempts = (user.failed_attempts || 0) + 1;
            const updates = { failed_attempts: newFailedAttempts };

            if (newFailedAttempts >= 10) {
                updates.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
            }

            await supabase
                .from('users')
                .update(updates)
                .eq('id', user.id);

            res.status(400).json({ error: 'Invalid credentials' });
        }

    } catch (error) {
        console.error('Login finish error:', error.message);
        res.status(400).json({ error: 'Invalid credentials' });
    }
});

// Logout
router.post('/logout', async (req, res) => {
    try {
        const sessionToken = req.headers.authorization?.replace('Bearer ', '');
        if (sessionToken) {
            sessionStore.deleteSession(sessionToken);
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Logout error:', error.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// Session stats
router.get('/session-stats', async (req, res) => {
    try {
        const activeSessions = [];
        for (const [token, session] of sessionStore.sessions.entries()) {
            if (session.expiresAt > Date.now()) {
                activeSessions.push({
                    userId: session.userId,
                    createdAt: new Date(session.createdAt).toISOString(),
                    expiresAt: new Date(session.expiresAt).toISOString()
                });
            }
        }
        
        res.json({
            totalSessions: sessionStore.sessions.size,
            activeSessions: activeSessions.length,
            sessions: activeSessions.slice(0, 10)
        });
    } catch (error) {
        console.error('Session stats error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;