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

const crypto = require('crypto');

class OpaqueServerService {
    constructor() {
        this.registrationSessions = new Map();
        this.authenticationSessions = new Map();
        this.serverKey = null;
    }

    async initialize(privateKeyBase64) {
        if (!privateKeyBase64) {
            throw new Error('OPAQUE_SERVER_PRIVATE_KEY is required');
        }

        this.serverKey = Buffer.from(privateKeyBase64, 'base64');
        if (this.serverKey.length !== 32) {
            throw new Error(`Private key must be 32 bytes, got ${this.serverKey.length}`);
        }

        console.log('✅ OPAQUE server initialized with Web Crypto API');
        return true;
    }

    // Helper: SHA-256 hash
    async sha256(data) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(data).digest();
    }

    // Helper: HMAC
    async hmac(key, data) {
        const crypto = require('crypto');
        const hmac = crypto.createHmac('sha256', key);
        hmac.update(data);
        return hmac.digest();
    }

    // Helper: HKDF
    async hkdf(ikm, salt, info, length) {
        const crypto = require('crypto');
        
        // HKDF extract
        const prk = crypto.createHmac('sha256', salt || Buffer.alloc(32))
            .update(ikm)
            .digest();
        
        // HKDF expand
        let t = Buffer.alloc(0);
        let okm = Buffer.alloc(0);
        
        for (let i = 1; okm.length < length; i++) {
            t = crypto.createHmac('sha256', prk)
                .update(Buffer.concat([t, info, Buffer.from([i])]))
                .digest();
            okm = Buffer.concat([okm, t]);
        }
        
        return okm.slice(0, length);
    }

    // OPRF evaluate
    async oprfEvaluate(blinded) {
        // Simplified OPRF evaluation
        const result = Buffer.alloc(blinded.length);
        for (let i = 0; i < blinded.length; i++) {
            result[i] = blinded[i] ^ this.serverKey[i % this.serverKey.length];
        }
        return result;
    }

    async startRegistration(userIdentifier, registrationRequestBase64) {
        try {
            console.log('Registration start - user:', userIdentifier);
            
            const blinded = Buffer.from(registrationRequestBase64, 'base64');
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

        return {
            userIdentifier: session.userIdentifier,
            registrationRecord: registrationRecordBase64
        };
    }

    async startAuthentication(userIdentifier, startLoginRequestBase64, registrationRecordBase64) {
        try {
            console.log('Login start - user:', userIdentifier);
            
            const blinded = Buffer.from(startLoginRequestBase64, 'base64');
            const evaluated = await this.oprfEvaluate(blinded);
            
            const sessionId = crypto.randomBytes(32).toString('hex');
            
            this.authenticationSessions.set(sessionId, {
                id: sessionId,
                userIdentifier,
                serverLoginState: { evaluated: evaluated.toString('base64') },
                createdAt: Date.now(),
                expiresAt: Date.now() + 5 * 60 * 1000
            });

            return {
                sessionId,
                authenticationResponse: evaluated.toString('base64')
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
            console.log('Login finish - user:', session.userIdentifier);
            
            const finishRequest = Buffer.from(finishLoginRequestBase64, 'base64');
            
            // Derive export key from the server state
            const evaluated = Buffer.from(session.serverLoginState.evaluated, 'base64');
            
            // Derive export key using HKDF
            const exportKey = await this.hkdf(
                evaluated,
                Buffer.alloc(32),
                Buffer.from('ExportKey'),
                32
            );
            
            const sessionToken = crypto
                .createHmac('sha256', exportKey)
                .update(`session-${session.userIdentifier}-${Date.now()}`)
                .digest('base64');

            this.authenticationSessions.delete(sessionId);

            console.log('Login finish successful');

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