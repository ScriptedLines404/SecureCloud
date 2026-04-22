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

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FaEnvelope, FaLock, FaShieldAlt } from 'react-icons/fa';
import { login } from '../utils/opaque';
import { initializeMasterKey, loadMasterKey, clearMasterKeyFromMemory } from '../services/keyManagementService';
import toast from 'react-hot-toast';
import { isValidEmail } from '../utils/security';
import { useSecureStorage } from '../hooks/useSecureStorage';
import { perfMetrics } from '../utils/performanceMetrics';

const LoginOpaque = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [loading, setLoading] = useState(false);
    const [attempts, setAttempts] = useSecureStorage('login_attempts', 0, { persistent: true, ttl: 60 });
    const [loginStarted, setLoginStarted] = useState(false);

    useEffect(() => {
        const userId = localStorage.getItem('userId');
        if (userId) {
            clearMasterKeyFromMemory(userId);
        }
        
        const token = localStorage.getItem('sessionToken');
        if (token) navigate('/dashboard', { replace: true });
        
        return () => {
            if (loginStarted) {
                perfMetrics.cancelLoginAttempt();
            }
        };
    }, [navigate]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (loading || loginStarted) {
            console.log('Login already in progress, ignoring duplicate click');
            return;
        }
        
        if (!formData.email || !formData.password) {
            toast.error('Please enter both email and password');
            return;
        }

        if (!isValidEmail(formData.email)) {
            toast.error('Invalid email format');
            return;
        }

        if (attempts >= 5) {
            toast.error('Too many attempts. Please try again later.');
            return;
        }

        const trackingStarted = perfMetrics.startLoginAttempt(formData.email);
        if (!trackingStarted) {
            console.log('Login tracking already in progress');
            return;
        }
        
        setLoginStarted(true);
        setLoading(true);
        
        const stepStartTime = performance.now();
        
        try {
            console.log('Step 1: OPAQUE authentication...');
            const result = await login(formData.email, formData.password);
            
            perfMetrics.trackLoginStep('opaque_authentication', performance.now() - stepStartTime);
            
            console.log('Step 2: OPAQUE success, export key length:', result.exportKey?.length);
            console.log('Step 2 details:', { 
                userId: result.userId, 
                hasSessionToken: !!result.sessionToken
            });
            
            const keyStepStart = performance.now();
            
            clearMasterKeyFromMemory(result.userId);
            
            let masterKey;
            try {
                masterKey = await loadMasterKey(result.userId, result.exportKey);
                console.log('Step 3: Existing master key loaded');
                toast.success('Master key loaded');
            } catch (loadError) {
                console.log('No existing key, creating new:', loadError.message);
                masterKey = await initializeMasterKey(result.userId, result.exportKey);
                console.log('Step 3: New master key created and saved');
                toast.success('Master key created');
            }

            if (!masterKey) throw new Error('Failed to establish master key');
            
            perfMetrics.trackLoginStep('master_key_derivation', performance.now() - keyStepStart);

            setAttempts(0);
            setFormData({ email: '', password: '' });
            
            perfMetrics.finishLoginAttempt(true);
            setLoginStarted(false);
            
            toast.success('Login successful!');
            
            setTimeout(() => navigate('/dashboard', { replace: true }), 100);

        } catch (err) {
            console.error('Login error:', err);
            
            perfMetrics.finishLoginAttempt(false, err.message);
            setLoginStarted(false);
            
            setAttempts(prev => prev + 1);
            toast.error(err.message || 'Login failed');
            setFormData(prev => ({ ...prev, password: '' }));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
            <div className="card w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <FaShieldAlt className="w-8 h-8 text-blue-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                        Secure OPAQUE Login
                    </h1>
                    <p className="text-gray-600">
                        Zero-Knowledge • Master Key Protected
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Email Address
                        </label>
                        <div className="relative">
                            <FaEnvelope className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="you@example.com"
                                required
                                disabled={loading || attempts >= 5}
                                autoComplete="email"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Password
                        </label>
                        <div className="relative">
                            <FaLock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                            <input
                                type="password"
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="••••••••"
                                required
                                disabled={loading || attempts >= 5}
                                autoComplete="current-password"
                            />
                        </div>
                    </div>

                    {attempts > 0 && (
                        <p className="text-sm text-orange-600 text-center">
                            Failed attempts: {attempts}/5
                        </p>
                    )}

                    <button
                        type="submit"
                        className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                        disabled={loading || attempts >= 5}
                    >
                        {loading ? (
                            <span className="flex items-center justify-center">
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Authenticating...
                            </span>
                        ) : (
                            'Sign In'
                        )}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <p className="text-gray-600">
                        Don't have an account?{' '}
                        <Link to="/signup-opaque" className="text-blue-600 hover:text-blue-700 font-medium">
                            Create account
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default LoginOpaque;