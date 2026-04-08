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

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FaEnvelope, FaLock, FaUserPlus, FaShieldAlt } from 'react-icons/fa';
import { register } from '../utils/opaque';
import toast from 'react-hot-toast';
import { isSecureContext, isValidEmail, isStrongPassword } from '../utils/security';

const SignupOpaque = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        confirmPassword: ''
    });
    const [loading, setLoading] = useState(false);
    const [passwordStrength, setPasswordStrength] = useState('');

    useEffect(() => {
        if (!isSecureContext() && process.env.NODE_ENV === 'production') {
            toast.error('HTTPS is required for secure registration');
        }
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));

        if (name === 'password') {
            if (value.length < 8) {
                setPasswordStrength('weak');
            } else if (isStrongPassword(value)) {
                setPasswordStrength('strong');
            } else {
                setPasswordStrength('medium');
            }
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!isValidEmail(formData.email)) {
            toast.error('Please enter a valid email address');
            return;
        }

        if (formData.password !== formData.confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }

        if (!isStrongPassword(formData.password)) {
            toast.error('Password must be at least 8 characters with numbers and letters');
            return;
        }

        setLoading(true);
        
        try {
            const result = await register(formData.email, formData.password);
            
            setFormData({
                email: '',
                password: '',
                confirmPassword: ''
            });
            
            toast.success('Account created successfully!');
            
            // Small delay before redirect
            setTimeout(() => navigate('/login-opaque'), 100);
            
        } catch (err) {
            console.error('Registration error:', err);
            toast.error(err.message || 'Registration failed. Please try again.');
            
            setFormData(prev => ({
                ...prev,
                password: '',
                confirmPassword: ''
            }));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        return () => {
            setFormData({ email: '', password: '', confirmPassword: '' });
        };
    }, []);

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
            <div className="card w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <FaShieldAlt className="w-8 h-8 text-blue-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                        Create Secure Account
                    </h1>
                    <p className="text-gray-600">
                        RFC 9380 OPAQUE Protocol - Zero Knowledge Authentication
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Email Address
                        </label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <FaEnvelope className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                className="input-field pl-10"
                                placeholder="you@example.com"
                                required
                                disabled={loading}
                                autoComplete="email"
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck="false"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Password
                        </label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <FaLock className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                                type="password"
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                className={`input-field pl-10 ${
                                    passwordStrength === 'weak' ? 'border-red-300' :
                                    passwordStrength === 'medium' ? 'border-yellow-300' :
                                    passwordStrength === 'strong' ? 'border-green-300' : ''
                                }`}
                                placeholder="••••••••"
                                required
                                minLength="8"
                                disabled={loading}
                                autoComplete="new-password"
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck="false"
                            />
                        </div>
                        {formData.password && (
                            <p className={`mt-2 text-sm ${
                                passwordStrength === 'weak' ? 'text-red-600' :
                                passwordStrength === 'medium' ? 'text-yellow-600' :
                                passwordStrength === 'strong' ? 'text-green-600' : 'text-gray-500'
                            }`}>
                                Password strength: {passwordStrength}
                                {passwordStrength === 'weak' && ' (min 8 chars, include numbers)'}
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Confirm Password
                        </label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <FaLock className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                                type="password"
                                name="confirmPassword"
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                className={`input-field pl-10 ${
                                    formData.confirmPassword && 
                                    formData.password !== formData.confirmPassword ? 'border-red-300' : ''
                                }`}
                                placeholder="••••••••"
                                required
                                disabled={loading}
                                autoComplete="new-password"
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck="false"
                            />
                        </div>
                        {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                            <p className="mt-2 text-sm text-red-600">
                                Passwords do not match
                            </p>
                        )}
                    </div>

                    <button
                        type="submit"
                        className="btn-primary w-full py-3 flex items-center justify-center"
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Creating Account...
                            </>
                        ) : (
                            <>
                                <FaUserPlus className="mr-2" />
                                Create Account
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <p className="text-gray-600">
                        Already have an account?{' '}
                        <Link to="/login-opaque" className="text-blue-600 hover:text-blue-700 font-medium">
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default SignupOpaque;