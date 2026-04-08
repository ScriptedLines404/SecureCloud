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
import { useParams, useNavigate } from 'react-router-dom';
import { 
    FaLock, 
    FaFile, 
    FaDownload, 
    FaExclamationTriangle,
    FaEnvelope,
    FaPaperPlane,
    FaCheckCircle,
    FaArrowLeft
} from 'react-icons/fa';
import { getShareByToken, requestVerificationCode, verifyCode, getWrappedKeyForShare } from '../services/shareService';
import { downloadFromGoogleDrive } from '../services/googleDrive';
import toast from 'react-hot-toast';
import { isValidEmail } from '../utils/security';

const PrivateShareViewer = () => {
    const { shareToken } = useParams();
    const navigate = useNavigate();
    
    const [step, setStep] = useState('loading'); // loading, email, code, access
    const [share, setShare] = useState(null);
    const [file, setFile] = useState(null);
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [downloading, setDownloading] = useState(false);
    const [masterKey, setMasterKey] = useState(null);
    const [wrappedKey, setWrappedKey] = useState(null);
    const [countdown, setCountdown] = useState(0);

    useEffect(() => {
        loadShareInfo();
    }, [shareToken]);

    useEffect(() => {
        if (countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [countdown]);

    const loadShareInfo = async () => {
        try {
            setLoading(true);
            setError(null);
            
            console.log('Loading private share:', shareToken);
            
            const result = await getShareByToken(shareToken);
            
            console.log('Share info result:', result);
            
            if (!result.success) {
                setError(result.error || 'Share not found');
                setStep('error');
                setLoading(false);
                return;
            }
            
            setShare(result.share);
            
            if (result.share.requiresVerification) {
                setStep('email');
            } else if (result.share.share_type === 'public') {
                navigate(`/shared/${shareToken}`, { replace: true });
            } else {
                setStep('access');
                setFile(result.share.files);
                if (result.share.id) {
                    const keyResult = await getWrappedKeyForShare(result.share.id);
                    if (keyResult.success) {
                        setWrappedKey(keyResult.data);
                    }
                }
            }
            
        } catch (error) {
            console.error('Failed to load share:', error);
            setError('Failed to load share');
            setStep('error');
        } finally {
            setLoading(false);
        }
    };

    const handleRequestCode = async () => {
        if (!isValidEmail(email)) {
            toast.error('Please enter a valid email address');
            return;
        }

        try {
            setLoading(true);
            
            console.log('Requesting code for:', shareToken, email);
            
            const result = await requestVerificationCode(shareToken, email);
            
            if (result.success) {
                setStep('code');
                setCountdown(60);
                toast.success('Verification code sent to your email');
            } else {
                toast.error(result.error || 'Failed to send code');
            }
            
        } catch (error) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyCode = async () => {
        if (!code || code.length !== 6) {
            toast.error('Please enter a valid 6-digit code');
            return;
        }

        try {
            setLoading(true);
            
            console.log('Verifying code for:', shareToken, email, code);
            
            const result = await verifyCode(shareToken, email, code);
            
            if (result.success) {
                setShare(result.share);
                setFile(result.share.files);
                setWrappedKey(result.wrappedKey);
                setStep('access');
                toast.success('Verification successful!');
            } else {
                toast.error(result.error || 'Invalid code');
            }
            
        } catch (error) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleResendCode = () => {
        if (countdown > 0) {
            toast.error(`Please wait ${countdown} seconds before resending`);
            return;
        }
        handleRequestCode();
    };

    const handleDownload = async () => {
        if (!file || !wrappedKey) {
            toast.error('Decryption key not available');
            return;
        }

        const driveFileId = file.drive_file_id;
        
        if (!driveFileId) {
            toast.error('Google Drive file ID not found');
            console.error('File object:', file);
            return;
        }
        
        try {
            setDownloading(true);
            
            toast.loading('Downloading encrypted file...', { id: 'private-download' });
            
            const encryptedData = await downloadFromGoogleDrive(driveFileId);
            
            toast.loading('Decrypting file...', { id: 'private-download' });
            
            // Log the wrapped key for debugging
            console.log('Wrapped key (base64):', wrappedKey);
            console.log('Wrapped key length:', wrappedKey.length);
            
            // Decode base64 to check format
            try {
                const decoded = atob(wrappedKey);
                console.log('Decoded length:', decoded.length);
                console.log('First 20 bytes:', Array.from(decoded.substring(0, 20)).map(c => c.charCodeAt(0)));
            } catch (e) {
                console.error('Base64 decode failed:', e);
            }
            
            const masterKey = await unwrapMasterKeyFromShare(wrappedKey, email, share.id);
            
            const fileKey = await deriveFileKey(masterKey, file.id);
            
            const decryptedData = await decryptWithFileKey(encryptedData, fileKey);
            
            let mimeType = file.file_type || 'application/octet-stream';
            
            const blob = new Blob([decryptedData], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.original_file_name || file.file_name || 'download';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            toast.success('File downloaded and decrypted successfully!', { id: 'private-download' });
            
        } catch (error) {
            console.error('Download failed:', error);
            toast.error(`Download failed: ${error.message}`, { id: 'private-download' });
        } finally {
            setDownloading(false);
        }
    };

    const formatFileSize = (bytes) => {
        if (!bytes) return '0 B';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    };

    if (step === 'loading') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading secure share...</p>
                </div>
            </div>
        );
    }

    if (step === 'error') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
                    <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <FaExclamationTriangle className="w-10 h-10 text-red-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Share Not Found</h1>
                    <p className="text-gray-600 mb-6">{error || 'This share link is invalid or has expired.'}</p>
                    <button
                        onClick={() => navigate('/')}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        Go to Home
                    </button>
                </div>
            </div>
        );
    }

    if (step === 'email') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center text-gray-600 hover:text-gray-800 mb-6"
                    >
                        <FaArrowLeft className="mr-2" /> Back to Home
                    </button>

                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <FaLock className="w-8 h-8 text-blue-600" />
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 mb-2">Private Share</h1>
                        <p className="text-gray-600">
                            This file is privately shared. Verify your email to access it.
                        </p>
                    </div>

                    {share && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                            <p className="text-sm text-blue-800">
                                <strong>File:</strong> {share?.file_name}
                            </p>
                            <p className="text-sm text-blue-800 mt-1">
                                <strong>Size:</strong> {formatFileSize(share?.file_size)}
                            </p>
                        </div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Your Email Address
                            </label>
                            <div className="relative">
                                <FaEnvelope className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleRequestCode}
                            disabled={loading || !email}
                            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                        >
                            {loading ? (
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                            ) : (
                                <FaPaperPlane className="mr-2" />
                            )}
                            Send Verification Code
                        </button>
                    </div>

                    <p className="text-xs text-gray-500 text-center mt-6">
                        We'll send a 6-digit code to this email address.
                        The code expires in 10 minutes.
                    </p>
                </div>
            </div>
        );
    }

    if (step === 'code') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
                    <button
                        onClick={() => setStep('email')}
                        className="flex items-center text-gray-600 hover:text-gray-800 mb-6"
                    >
                        <FaArrowLeft className="mr-2" /> Back
                    </button>

                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <FaCheckCircle className="w-8 h-8 text-green-600" />
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 mb-2">Check Your Email</h1>
                        <p className="text-gray-600">
                            We've sent a 6-digit verification code to<br />
                            <strong className="text-blue-600">{email}</strong>
                        </p>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Verification Code
                            </label>
                            <input
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder="000000"
                                className="w-full px-4 py-3 text-center text-2xl tracking-widest border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                maxLength="6"
                                disabled={loading}
                            />
                        </div>

                        <button
                            onClick={handleVerifyCode}
                            disabled={loading || code.length !== 6}
                            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <div className="flex items-center justify-center">
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                                    Verifying...
                                </div>
                            ) : (
                                'Verify Code'
                            )}
                        </button>

                        <div className="text-center">
                            <button
                                onClick={handleResendCode}
                                disabled={loading || countdown > 0}
                                className="text-blue-600 hover:text-blue-700 text-sm disabled:opacity-50"
                            >
                                {countdown > 0 ? `Resend code in ${countdown}s` : 'Resend code'}
                            </button>
                        </div>
                    </div>

                    <p className="text-xs text-gray-500 text-center mt-6">
                        The code expires in 10 minutes. Don't share it with anyone.
                    </p>
                </div>
            </div>
        );
    }

    if (step === 'access') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
                <div className="max-w-2xl mx-auto px-4 py-12">
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center text-gray-600 hover:text-gray-800 mb-6"
                    >
                        <FaArrowLeft className="mr-2" /> Back to Home
                    </button>

                    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                        <div className="bg-gradient-to-r from-green-600 to-teal-600 px-6 py-8 text-white">
                            <div className="flex items-center justify-center mb-4">
                                <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                                    <FaCheckCircle className="w-8 h-8" />
                                </div>
                            </div>
                            <h1 className="text-2xl font-bold text-center mb-2">
                                Access Granted
                            </h1>
                            <p className="text-center text-green-100">
                                You now have access to this private file
                            </p>
                        </div>

                        <div className="p-6">
                            {file && (
                                <div className="flex items-center space-x-4 mb-6">
                                    <div className="p-3 bg-blue-100 rounded-lg">
                                        <FaFile className="w-6 h-6 text-blue-600" />
                                    </div>
                                    <div className="flex-1">
                                        <h2 className="text-xl font-semibold text-gray-800 break-all">
                                            {file?.original_file_name || file?.file_name}
                                        </h2>
                                        <p className="text-sm text-gray-500 mt-1">
                                            {formatFileSize(file?.file_size)}
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                                <p className="text-sm text-green-700">
                                    <FaLock className="inline mr-1" />
                                    End-to-end encrypted • Decrypted in your browser
                                </p>
                            </div>

                            <button
                                onClick={handleDownload}
                                disabled={downloading}
                                className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            >
                                {downloading ? (
                                    <>
                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                                        Downloading & Decrypting...
                                    </>
                                ) : (
                                    <>
                                        <FaDownload className="mr-2" />
                                        Download File
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return null;
};

// Derive file-specific key from master key
async function deriveFileKey(masterKey, fileId) {
    try {
        console.log('Deriving file key for file ID:', fileId);
        
        const masterKeyRaw = await crypto.subtle.exportKey('raw', masterKey);
        console.log('Master key raw length:', masterKeyRaw.byteLength);
        
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            masterKeyRaw,
            { name: 'HKDF' },
            false,
            ['deriveKey']
        );

        const fileKey = await crypto.subtle.deriveKey(
            {
                name: 'HKDF',
                hash: 'SHA-256',
                salt: new TextEncoder().encode('SecureCloud-File-v2'),
                info: new TextEncoder().encode(`file-${fileId}`)
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
        );
        
        console.log('✅ File key derived successfully');
        return fileKey;
    } catch (error) {
        console.error('❌ File key derivation failed:', error);
        throw error;
    }
}

// Decrypt file with file-specific key
async function decryptWithFileKey(encryptedData, fileKey) {
    try {
        const iv = encryptedData.slice(0, 12);
        const data = encryptedData.slice(12);
        
        console.log('Decrypting with file key...');
        console.log('IV length:', iv.length);
        console.log('Data length:', data.length);

        const decryptedBuffer = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv,
                tagLength: 128
            },
            fileKey,
            data
        );

        console.log('✅ File decrypted successfully, size:', decryptedBuffer.byteLength);
        return decryptedBuffer;
    } catch (error) {
        console.error('❌ Decryption failed:', error);
        throw error;
    }
}

// Unwrap master key from wrapped key for private shares - COMPLETE REWRITE
async function unwrapMasterKeyFromShare(wrappedData, email, shareId) {
    try {
        console.log('Unwrapping master key for private share...');
        console.log('Share ID:', shareId);
        console.log('Email:', email);
        
        // Step 1: Decode base64 to get the raw wrapped data
        console.log('Decoding base64...');
        const binaryString = atob(wrappedData);
        console.log('Binary string length:', binaryString.length);
        
        const wrappedBuffer = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            wrappedBuffer[i] = binaryString.charCodeAt(i);
        }
        console.log('Wrapped buffer length:', wrappedBuffer.length);
        
        // Step 2: Extract IV and wrapped key
        const iv = wrappedBuffer.slice(0, 12);
        const wrappedKey = wrappedBuffer.slice(12);
        
        console.log('IV length:', iv.length);
        console.log('Wrapped key length:', wrappedKey.length);
        
        // Step 3: Derive the share key from email and shareId
        console.log('Deriving share key from:', `${email}:${shareId}`);
        const keyMaterial = `${email.toLowerCase()}:${shareId}`;
        const keyBytes = new TextEncoder().encode(keyMaterial);
        const hashBuffer = await crypto.subtle.digest('SHA-256', keyBytes);
        
        // Step 4: Import as CryptoKey with proper permissions
        const shareKey = await crypto.subtle.importKey(
            'raw',
            hashBuffer,
            { name: 'AES-GCM' },
            false,
            ['unwrapKey']
        );
        console.log('Share key imported successfully');
        
        // Step 5: Prepare wrapped key as ArrayBuffer
        const wrappedKeyBuffer = wrappedKey.buffer.slice(
            wrappedKey.byteOffset,
            wrappedKey.byteOffset + wrappedKey.byteLength
        );
        
        // Step 6: Unwrap the master key
        console.log('Attempting to unwrap master key...');
        const masterKey = await crypto.subtle.unwrapKey(
            'raw',
            wrappedKeyBuffer,
            shareKey,
            { 
                name: 'AES-GCM', 
                iv: iv, 
                tagLength: 128 
            },
            { 
                name: 'AES-GCM', 
                length: 256 
            },
            true,
            ['encrypt', 'decrypt']
        );
        
        console.log('✅ Master key unwrapped successfully');
        return masterKey;
    } catch (error) {
        console.error('❌ Failed to unwrap master key:');
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        throw error;
    }
}

export default PrivateShareViewer;