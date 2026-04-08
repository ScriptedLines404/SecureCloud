// frontend/src/hooks/useSecureStorage.js
// Enhanced secure storage for encryption keys with better persistence

import { useState, useEffect } from 'react';

class SecureStorage {
    constructor() {
        this.prefix = 'secure_';
        this.memoryStore = new Map();
        this.sessionStore = new Map();
    }

    // Store sensitive data in memory only (cleared on page refresh)
    setSecure(key, value) {
        this.memoryStore.set(key, value);
    }

    getSecure(key) {
        return this.memoryStore.get(key);
    }

    removeSecure(key) {
        this.memoryStore.delete(key);
    }

    // Store data in session storage (cleared when tab/window is closed)
    setSession(key, value) {
        const serialized = JSON.stringify({
            value,
            timestamp: Date.now()
        });
        sessionStorage.setItem(this.prefix + key, serialized);
        this.sessionStore.set(key, value);
    }

    getSession(key) {
        // Try memory first
        if (this.sessionStore.has(key)) {
            return this.sessionStore.get(key);
        }
        
        // Try sessionStorage
        const item = sessionStorage.getItem(this.prefix + key);
        if (item) {
            try {
                const parsed = JSON.parse(item);
                this.sessionStore.set(key, parsed.value);
                return parsed.value;
            } catch {
                return null;
            }
        }
        return null;
    }

    removeSession(key) {
        this.sessionStore.delete(key);
        sessionStorage.removeItem(this.prefix + key);
    }

    // Store non-sensitive data in localStorage with expiration
    setPersistent(key, value, ttlMinutes = null) {
        const item = {
            value,
            timestamp: Date.now(),
            ttl: ttlMinutes ? ttlMinutes * 60 * 1000 : null
        };
        localStorage.setItem(this.prefix + key, JSON.stringify(item));
    }

    getPersistent(key) {
        const item = localStorage.getItem(this.prefix + key);
        if (!item) return null;

        try {
            const parsed = JSON.parse(item);
            
            // Check expiration
            if (parsed.ttl && Date.now() - parsed.timestamp > parsed.ttl) {
                localStorage.removeItem(this.prefix + key);
                return null;
            }
            
            return parsed.value;
        } catch {
            return null;
        }
    }

    removePersistent(key) {
        localStorage.removeItem(this.prefix + key);
    }

    // Store encryption keys in localStorage (persists across browser restarts)
    // but they will be cleared on logout
    setEncryptionKey(keyId, keyData) {
        // Store in localStorage for persistence across browser sessions
        const keyString = JSON.stringify({
            id: keyId,
            data: Array.from(keyData),
            timestamp: Date.now(),
            userId: this.getCurrentUserId() // Associate with user
        });
        
        // Store in localStorage (persists even after browser close)
        localStorage.setItem(`enc_key_${keyId}`, keyString);
        
        // Also keep in memory for quick access
        if (!this.memoryStore.has('encryption_keys')) {
            this.memoryStore.set('encryption_keys', new Map());
        }
        const keysMap = this.memoryStore.get('encryption_keys');
        keysMap.set(keyId, keyData);
        
        // Store list of keys for this user to enable cleanup on logout
        this.addKeyToUserList(keyId);
    }

    getEncryptionKey(keyId) {
        // Try memory first (fastest)
        const keysMap = this.memoryStore.get('encryption_keys');
        if (keysMap && keysMap.has(keyId)) {
            return keysMap.get(keyId);
        }
        
        // Try localStorage
        const keyString = localStorage.getItem(`enc_key_${keyId}`);
        if (keyString) {
            try {
                const parsed = JSON.parse(keyString);
                
                // Verify this key belongs to the current user
                const currentUserId = this.getCurrentUserId();
                if (parsed.userId && parsed.userId !== currentUserId) {
                    console.warn('Key belongs to different user, ignoring');
                    return null;
                }
                
                const keyData = new Uint8Array(parsed.data);
                
                // Restore to memory
                if (!this.memoryStore.has('encryption_keys')) {
                    this.memoryStore.set('encryption_keys', new Map());
                }
                const keysMap = this.memoryStore.get('encryption_keys');
                keysMap.set(keyId, keyData);
                
                return keyData;
            } catch {
                return null;
            }
        }
        
        return null;
    }

    removeEncryptionKey(keyId) {
        // Remove from memory
        const keysMap = this.memoryStore.get('encryption_keys');
        if (keysMap) {
            keysMap.delete(keyId);
        }
        
        // Remove from localStorage
        localStorage.removeItem(`enc_key_${keyId}`);
        
        // Remove from user's key list
        this.removeKeyFromUserList(keyId);
    }

    // Helper to get current user ID
    getCurrentUserId() {
        return localStorage.getItem('userId') || 'anonymous';
    }

    // Track all keys for a user to enable bulk cleanup
    getUserKeyListKey() {
        const userId = this.getCurrentUserId();
        return `user_keys_${userId}`;
    }

    addKeyToUserList(keyId) {
        const listKey = this.getUserKeyListKey();
        let keyList = [];
        
        try {
            const stored = localStorage.getItem(listKey);
            if (stored) {
                keyList = JSON.parse(stored);
            }
        } catch (e) {
            // Ignore parse errors
        }
        
        if (!keyList.includes(keyId)) {
            keyList.push(keyId);
            localStorage.setItem(listKey, JSON.stringify(keyList));
        }
    }

    removeKeyFromUserList(keyId) {
        const listKey = this.getUserKeyListKey();
        
        try {
            const stored = localStorage.getItem(listKey);
            if (stored) {
                let keyList = JSON.parse(stored);
                keyList = keyList.filter(id => id !== keyId);
                localStorage.setItem(listKey, JSON.stringify(keyList));
            }
        } catch (e) {
            // Ignore parse errors
        }
    }

    // Clear all encryption keys for the current user (on logout)
    clearAllEncryptionKeys() {
        const userId = this.getCurrentUserId();
        const listKey = `user_keys_${userId}`;
        
        // Get list of all keys for this user
        try {
            const stored = localStorage.getItem(listKey);
            if (stored) {
                const keyList = JSON.parse(stored);
                
                // Remove each key
                keyList.forEach(keyId => {
                    localStorage.removeItem(`enc_key_${keyId}`);
                });
                
                // Remove the list itself
                localStorage.removeItem(listKey);
            }
        } catch (e) {
            console.error('Error clearing encryption keys:', e);
        }
        
        // Also clear any keys that might be in memory
        const keysMap = this.memoryStore.get('encryption_keys');
        if (keysMap) {
            keysMap.clear();
        }
        
        // Clear from session storage too (just in case)
        const sessionKeysToRemove = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith('enc_key_')) {
                sessionKeysToRemove.push(key);
            }
        }
        sessionKeysToRemove.forEach(key => sessionStorage.removeItem(key));
        
        console.log(`✅ All encryption keys cleared for user: ${userId}`);
    }

    // Clear all secure data (on logout)
    clearAll() {
        // Clear encryption keys first
        this.clearAllEncryptionKeys();
        
        this.memoryStore.clear();
        this.sessionStore.clear();
        
        // Clear sessionStorage
        const sessionKeysToRemove = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith(this.prefix)) {
                sessionKeysToRemove.push(key);
            }
        }
        sessionKeysToRemove.forEach(key => sessionStorage.removeItem(key));
        
        // Clear localStorage (only our prefixed items, but NOT encryption keys - they were handled separately)
        const localKeysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this.prefix) && !key.startsWith('enc_key_') && !key.startsWith('user_keys_')) {
                localKeysToRemove.push(key);
            }
        }
        localKeysToRemove.forEach(key => localStorage.removeItem(key));
    }
}

export const secureStorage = new SecureStorage();

// React hook for secure storage
export function useSecureStorage(key, initialValue, options = {}) {
    const { persistent = false, ttl = null, session = false } = options;

    const [storedValue, setStoredValue] = useState(() => {
        try {
            if (persistent) {
                const item = secureStorage.getPersistent(key);
                return item !== null ? item : initialValue;
            } else if (session) {
                const item = secureStorage.getSession(key);
                return item !== null ? item : initialValue;
            } else {
                const item = secureStorage.getSecure(key);
                return item !== null ? item : initialValue;
            }
        } catch {
            return initialValue;
        }
    });

    useEffect(() => {
        try {
            if (persistent) {
                secureStorage.setPersistent(key, storedValue, ttl);
            } else if (session) {
                secureStorage.setSession(key, storedValue);
            } else {
                secureStorage.setSecure(key, storedValue);
            }
        } catch (error) {
            console.error('Error saving to secure storage:', error);
        }
    }, [key, storedValue, persistent, session, ttl]);

    return [storedValue, setStoredValue];
}

// Hook specifically for encryption keys
export function useEncryptionKey(fileId) {
    const [key, setKey] = useState(null);

    useEffect(() => {
        // Load key from storage on mount
        const storedKey = secureStorage.getEncryptionKey(fileId);
        if (storedKey) {
            setKey(storedKey);
        }
    }, [fileId]);

    const saveKey = (keyData) => {
        secureStorage.setEncryptionKey(fileId, keyData);
        setKey(keyData);
    };

    const removeKey = () => {
        secureStorage.removeEncryptionKey(fileId);
        setKey(null);
    };

    return [key, saveKey, removeKey];
}