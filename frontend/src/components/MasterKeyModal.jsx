// frontend/src/components/MasterKeyModal.jsx - Updated
import React, { useState, useEffect } from 'react';
import { FaLock, FaTimes, FaEye, FaEyeSlash } from 'react-icons/fa';
import { login as opaqueLogin } from '../utils/opaque';
import { loadMasterKey } from '../services/keyManagementService';
import toast from 'react-hot-toast';

const MasterKeyModal = ({ isOpen, onClose, onSuccess }) => {
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [attempts, setAttempts] = useState(0);
    const [blockedUntil, setBlockedUntil] = useState(null);

    useEffect(() => {
        if (isOpen) {
            setPassword('');
            setShowPassword(false);
        }
    }, [isOpen]);

    useEffect(() => {
        if (blockedUntil && blockedUntil > Date.now()) {
            const timer = setTimeout(() => {
                setBlockedUntil(null);
                setAttempts(0);
            }, blockedUntil - Date.now());
            return () => clearTimeout(timer);
        }
    }, [blockedUntil]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Check if blocked
        if (blockedUntil && blockedUntil > Date.now()) {
            const waitSeconds = Math.ceil((blockedUntil - Date.now()) / 1000);
            toast.error(`Too many attempts. Please wait ${waitSeconds} seconds.`);
            return;
        }

        if (!password) {
            toast.error('Please enter your password');
            return;
        }

        setLoading(true);

        try {
            const email = localStorage.getItem('userEmail');
            const userId = localStorage.getItem('userId');

            if (!email || !userId) {
                throw new Error('No user session found. Please log in again.');
            }

            console.log('🔄 Re-authenticating to derive master key...');
            
            // Step 1: Re-run OPAQUE login to get export key
            const loginResult = await opaqueLogin(email, password);
            
            if (!loginResult.success || !loginResult.exportKey) {
                throw new Error('Authentication failed');
            }

            console.log('✅ Re-authentication successful, deriving master key...');

            // Step 2: Derive master key from export key
            const masterKey = await loadMasterKey(userId, loginResult.exportKey);

            // Reset attempts on success
            setAttempts(0);
            setBlockedUntil(null);

            // Call success callback with master key
            onSuccess(masterKey);
            
            onClose();

        } catch (error) {
            console.error('❌ Failed to derive master key:', error);
            
            // Increment attempts
            const newAttempts = attempts + 1;
            setAttempts(newAttempts);

            // Block after 3 attempts
            if (newAttempts >= 3) {
                const blockTime = Date.now() + 5 * 60 * 1000; // 5 minutes
                setBlockedUntil(blockTime);
                toast.error('Too many failed attempts. Please try again in 5 minutes.');
            } else {
                toast.error(`Invalid password. ${3 - newAttempts} attempts remaining.`);
            }
        } finally {
            setLoading(false);
            setPassword('');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
                <div className="flex justify-between items-center p-6 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-800 flex items-center">
                        <FaLock className="mr-2 text-blue-600" />
                        Derive Master Key
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <FaTimes />
                    </button>
                </div>

                <div className="p-6">
                    <p className="text-gray-600 mb-4">
                        Enter your password to derive the master key. This key is required to encrypt and decrypt files.
                    </p>

                    <form onSubmit={handleSubmit}>
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                                    placeholder="Enter your password"
                                    disabled={loading || (blockedUntil && blockedUntil > Date.now())}
                                    autoFocus
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                                </button>
                            </div>
                        </div>

                        {blockedUntil && blockedUntil > Date.now() && (
                            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                                <p className="text-sm text-red-600">
                                    Too many failed attempts. Please try again in{' '}
                                    {Math.ceil((blockedUntil - Date.now()) / 1000)} seconds.
                                </p>
                            </div>
                        )}

                        <div className="flex space-x-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                                disabled={loading}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading || !password || (blockedUntil && blockedUntil > Date.now())}
                                className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                            >
                                {loading ? (
                                    <>
                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                                        Deriving...
                                    </>
                                ) : (
                                    'Derive Key'
                                )}
                            </button>
                        </div>
                    </form>

                    <div className="mt-4 text-xs text-gray-500">
                        <p>🔒 Master key is derived in memory and never stored on disk.</p>
                        <p className="mt-1">⏱️ Key auto-clears after 15 minutes of inactivity.</p>
                        <p className="mt-1">🔄 You can re-derive the key anytime with your password.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MasterKeyModal;