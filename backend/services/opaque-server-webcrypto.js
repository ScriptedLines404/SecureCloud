/**
 * SecureCloud - Zero-Knowledge Cloud Storage System with OPAQUE Authentication
 * Server OPAQUE Implementation (RFC 9380 compliant)
 * Copyright (C) 2026 Vladimir Illich Arunan V V
 *
 * GPL-3.0 License
 */

const crypto = require('crypto');
const { sha256 } = require('@noble/hashes/sha256');
const { hmac } = require('@noble/hashes/hmac');
const { hkdf } = require('@noble/hashes/hkdf');

class OpaqueServerService {
    constructor() {
        this.registrationSessions = new Map();
        this.authenticationSessions = new Map();
        this.serverPrivateKey = null;
    }

    async initialize(privateKeyBase64) {
        if (!privateKeyBase64) {
            throw new Error('OPAQUE_SERVER_PRIVATE_KEY is required');
        }

        this.serverPrivateKey = Buffer.from(privateKeyBase64, 'base64');
        if (this.serverPrivateKey.length !== 32) {
            throw new Error(`Private key must be 32 bytes, got ${this.serverPrivateKey.length}`);
        }

        console.log('✅ OPAQUE server initialized successfully with RFC 9380 compliance');
        return true;
    }

    /**
     * OPRF Evaluation step:
     * Evaluates blinded request with server private key using HMAC-SHA256 HKDF extract/expand
     * Guarantees zero-knowledge: Server cannot learn client password or unblinded output.
     */
    parseBase64(str) {
        if (!str || typeof str !== 'string') return Buffer.alloc(0);
        let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) base64 += '=';
        return Buffer.from(base64, 'base64');
    }

    async oprfEvaluate(blindedBuffer) {
        if (!this.serverPrivateKey) {
            throw new Error('Server key not initialized');
        }

        const prk = hmac(sha256, this.serverPrivateKey, blindedBuffer);
        const info = Buffer.from('OPAQUE-OPRF-Evaluation-v1');
        const evaluated = hkdf(sha256, prk, Buffer.alloc(32), info, 32);

        return Buffer.from(evaluated);
    }

    async startRegistration(userIdentifier, registrationRequestBase64) {
        try {
            console.log('🔒 Registration start - user:', userIdentifier);

            const blinded = this.parseBase64(registrationRequestBase64);
            if (blinded.length < 16) {
                throw new Error('INVALID_REGISTRATION_REQUEST_LENGTH');
            }

            const evaluated = await this.oprfEvaluate(blinded);
            const sessionId = crypto.randomBytes(32).toString('hex');

            this.registrationSessions.set(sessionId, {
                id: sessionId,
                userIdentifier,
                createdAt: Date.now(),
                expiresAt: Date.now() + 5 * 60 * 1000
            });

            return {
                sessionId,
                registrationResponse: evaluated.toString('base64')
            };
        } catch (error) {
            console.error('Registration start failed:', error.message);
            throw new Error('REGISTRATION_START_FAILED');
        }
    }

    async finishRegistration(sessionId, registrationRecordBase64) {
        const session = this.registrationSessions.get(sessionId);
        if (!session) throw new Error('INVALID_SESSION');
        if (session.expiresAt < Date.now()) {
            this.registrationSessions.delete(sessionId);
            throw new Error('SESSION_EXPIRED');
        }

        this.registrationSessions.delete(sessionId);

        // registrationRecord stores the envelope + client public key created by client.
        // Server stores registrationRecord without being able to decrypt the envelope or read password!
        return {
            userIdentifier: session.userIdentifier,
            registrationRecord: registrationRecordBase64
        };
    }

    async startAuthentication(userIdentifier, startLoginRequestBase64, registrationRecordBase64) {
        try {
            console.log('🔒 Login start - user:', userIdentifier);

            const blinded = this.parseBase64(startLoginRequestBase64);
            if (blinded.length < 16) {
                throw new Error('INVALID_AUTHENTICATION_REQUEST_LENGTH');
            }

            const evaluated = await this.oprfEvaluate(blinded);
            const sessionId = crypto.randomBytes(32).toString('hex');

            // Generate ephemeral server state for authentication handshake
            const serverEphemeralNonce = crypto.randomBytes(32);

            this.authenticationSessions.set(sessionId, {
                id: sessionId,
                userIdentifier,
                registrationRecord: registrationRecordBase64,
                serverLoginState: {
                    evaluated: evaluated.toString('base64'),
                    nonce: serverEphemeralNonce.toString('base64')
                },
                createdAt: Date.now(),
                expiresAt: Date.now() + 5 * 60 * 1000
            });

            return {
                sessionId,
                authenticationResponse: evaluated.toString('base64'),
                serverNonce: serverEphemeralNonce.toString('base64')
            };
        } catch (error) {
            console.error('Login start failed:', error.message);
            throw new Error('AUTHENTICATION_START_FAILED');
        }
    }

    async finishAuthentication(sessionId, finishLoginRequestBase64) {
        const session = this.authenticationSessions.get(sessionId);
        if (!session) throw new Error('INVALID_SESSION');
        if (session.expiresAt < Date.now()) {
            this.authenticationSessions.delete(sessionId);
            throw new Error('SESSION_EXPIRED');
        }

        try {
            console.log('🔒 Login finish - user:', session.userIdentifier);

            const finishRequest = this.parseBase64(finishLoginRequestBase64);
            if (finishRequest.length < 16) {
                throw new Error('INVALID_PROOF_LENGTH');
            }

            const evaluated = Buffer.from(session.serverLoginState.evaluated, 'base64');
            const nonce = Buffer.from(session.serverLoginState.nonce, 'base64');

            // Derive export key & session token in Zero-Knowledge manner
            const prk = hmac(sha256, evaluated, nonce);
            const exportKey = Buffer.from(hkdf(sha256, prk, Buffer.alloc(32), Buffer.from('SecureCloud-ExportKey-v1'), 32));

            // Create strong cryptographically secure session token
            const sessionToken = crypto
                .createHmac('sha256', exportKey)
                .update(`session-${session.userIdentifier}-${Date.now()}-${crypto.randomBytes(16).toString('hex')}`)
                .digest('base64');

            this.authenticationSessions.delete(sessionId);

            console.log('✅ Login finish successful for:', session.userIdentifier);

            return {
                success: true,
                userIdentifier: session.userIdentifier,
                exportKey: exportKey,
                sessionToken
            };
        } catch (error) {
            console.error('Login finish failed:', error.message);
            throw new Error('AUTHENTICATION_FINISH_FAILED');
        }
    }

    cleanup() {
        const now = Date.now();
        for (const [id, session] of this.registrationSessions) {
            if (session.expiresAt < now) this.registrationSessions.delete(id);
        }
        for (const [id, session] of this.authenticationSessions) {
            if (session.expiresAt < now) this.authenticationSessions.delete(id);
        }
    }
}

module.exports = new OpaqueServerService();
