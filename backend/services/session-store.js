// backend/services/session-store.js
const crypto = require('crypto');

class SessionStore {
    constructor() {
        // Store sessions with export keys for verification
        this.sessions = new Map();
        this.cleanupInterval = setInterval(() => this.cleanup(), 15 * 60 * 1000); // Cleanup every 15 minutes
    }

    /**
     * Create a new session with export key
     */
    createSession(userId, sessionToken, exportKey) {
        // Ensure exportKey is properly stored as a Buffer
        let exportKeyBuffer;
        if (Buffer.isBuffer(exportKey)) {
            exportKeyBuffer = exportKey;
        } else if (exportKey instanceof Uint8Array) {
            exportKeyBuffer = Buffer.from(exportKey);
        } else if (typeof exportKey === 'string') {
            try {
                exportKeyBuffer = Buffer.from(exportKey, 'base64');
            } catch (e) {
                exportKeyBuffer = Buffer.from(exportKey);
            }
        } else {
            exportKeyBuffer = Buffer.from(exportKey);
        }

        console.log('Creating session for user:', userId);
        console.log('Session token length:', sessionToken.length);
        console.log('Export key length:', exportKeyBuffer.length);

        const session = {
            userId: userId,
            sessionToken: sessionToken,
            exportKey: exportKeyBuffer,
            createdAt: Date.now(),
            lastActivity: Date.now(),
            expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
            requestCount: 0
        };

        // Store by session token
        this.sessions.set(sessionToken, session);
        
        // Also store by userId for quick lookup
        this.sessions.set(`user:${userId}`, sessionToken);
        
        console.log(`✅ Session created for user: ${userId}`);
        console.log(`Total sessions: ${this.sessions.size}`);
        
        return session;
    }

    /**
     * Get session by session token
     */
    getSession(sessionToken) {
        if (!sessionToken) return null;
        
        const session = this.sessions.get(sessionToken);
        
        if (!session) {
            console.log('❌ Session not found for token:', sessionToken.substring(0, 20) + '...');
            return null;
        }
        
        if (session.expiresAt < Date.now()) {
            console.log('❌ Session expired for user:', session.userId);
            this.deleteSession(sessionToken);
            return null;
        }
        
        // Update last activity
        session.lastActivity = Date.now();
        session.requestCount++;
        
        console.log('✅ Session retrieved for user:', session.userId);
        return session;
    }

    /**
     * Get session by user ID
     */
    getSessionByUserId(userId) {
        const sessionToken = this.sessions.get(`user:${userId}`);
        if (sessionToken) {
            return this.getSession(sessionToken);
        }
        return null;
    }

    /**
     * Get export key for session
     */
    getExportKey(sessionToken) {
        const session = this.getSession(sessionToken);
        return session ? session.exportKey : null;
    }

    /**
     * Delete session
     */
    deleteSession(sessionToken) {
        const session = this.sessions.get(sessionToken);
        if (session) {
            this.sessions.delete(sessionToken);
            this.sessions.delete(`user:${session.userId}`);
            console.log(`✅ Session deleted for user: ${session.userId}`);
        }
    }

    /**
     * Cleanup expired sessions
     */
    cleanup() {
        const now = Date.now();
        let expiredCount = 0;
        
        for (const [key, value] of this.sessions.entries()) {
            // Skip user indexes
            if (key.startsWith('user:')) continue;
            
            if (value.expiresAt < now) {
                this.deleteSession(key);
                expiredCount++;
            }
        }
        
        if (expiredCount > 0) {
            console.log(`🧹 Cleaned up ${expiredCount} expired sessions`);
        }
    }

    /**
     * Get session stats
     */
    getStats() {
        const activeSessions = [];
        for (const [key, value] of this.sessions.entries()) {
            if (!key.startsWith('user:')) {
                activeSessions.push({
                    userId: value.userId,
                    createdAt: value.createdAt,
                    lastActivity: value.lastActivity,
                    requestCount: value.requestCount
                });
            }
        }
        return activeSessions;
    }
}

module.exports = new SessionStore();