// frontend/src/components/SharedFileViewer.jsx - COMPLETE FIXED
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    FaLock, 
    FaFile, 
    FaDownload, 
    FaEye,
    FaExclamationTriangle,
    FaClock,
    FaUserSecret,
    FaCopy
} from 'react-icons/fa';
import { getShareByToken, incrementShareAccess, getWrappedKeyForShare, extractShareParamsFromHash } from '../services/shareService';
import { downloadFromGoogleDrive } from '../services/googleDrive';
import toast from 'react-hot-toast';

const SharedFileViewer = () => {
    const { shareToken } = useParams();
    const navigate = useNavigate();
    
    const [loading, setLoading] = useState(true);
    const [share, setShare] = useState(null);
    const [file, setFile] = useState(null);
    const [error, setError] = useState(null);
    const [downloading, setDownloading] = useState(false);
    const [previewing, setPreviewing] = useState(false);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [shareKey, setShareKey] = useState(null);
    const [wrappedKey, setWrappedKey] = useState(null);
    const [masterKey, setMasterKey] = useState(null);
    const [decryptionReady, setDecryptionReady] = useState(false);

    useEffect(() => {
        loadSharedFile();
    }, [shareToken]);

    const loadSharedFile = async () => {
        let wrappedResult = null;
        
        try {
            setLoading(true);
            setError(null);
            setDecryptionReady(false);
            
            console.log('Loading shared file for token:', shareToken);
            
            // Get share info
            const result = await getShareByToken(shareToken);
            
            console.log('Share info result:', result);
            console.log('Share files structure:', result.share?.files);
            
            if (!result.success) {
                setError(result.error || 'Share not found');
                setLoading(false);
                return;
            }
            
            setShare(result.share);
            
            // Extract parameters from URL hash
            const { fileId, shareKey: keyFromHash } = extractShareParamsFromHash();
            console.log('URL params:', { fileId, shareKey: keyFromHash ? 'present' : 'missing' });
            
            if (!fileId || fileId !== result.share.file_id) {
                setError('Invalid share link - file ID mismatch');
                setLoading(false);
                return;
            }

            if (!keyFromHash) {
                setError('Invalid share link - missing encryption key');
                setLoading(false);
                return;
            }
            
            // Set the file object
            const fileData = result.share.files;
            console.log('File data:', fileData);
            console.log('File object available fields:', Object.keys(fileData));
            console.log('Drive file ID:', fileData.drive_file_id);
            setFile(fileData);
            
            // Import the share key from the URL hash
            try {
                console.log('Importing share key from hash, length:', keyFromHash.length);
                
                // Decode base64 to bytes
                const keyBytes = Uint8Array.from(atob(keyFromHash), c => c.charCodeAt(0));
                console.log('Key bytes length:', keyBytes.length);
                
                // Import with unwrapKey permission only
                const key = await crypto.subtle.importKey(
                    'raw',
                    keyBytes,
                    { name: 'AES-GCM' },
                    false,
                    ['unwrapKey']
                );
                setShareKey(key);
                console.log('✅ Share key imported successfully');
                
                // Get the wrapped master key from the database
                console.log('Getting wrapped key for share:', result.share.id);
                wrappedResult = await getWrappedKeyForShare(result.share.id);
                
                if (wrappedResult.success) {
                    console.log('✅ Wrapped key retrieved, type:', typeof wrappedResult.data);
                    console.log('Wrapped key length:', wrappedResult.data.length);
                    setWrappedKey(wrappedResult.data);
                    
                    console.log('Attempting to unwrap with share key');
                    console.log('Share key algorithm:', key.algorithm);
                    console.log('Share key usages:', key.usages);
                    console.log('Share key extractable:', key.extractable);
                    
                    // Unwrap the master key using the share key
                    const unwrappedMasterKey = await unwrapMasterKey(wrappedResult.data, key);
                    setMasterKey(unwrappedMasterKey);
                    setDecryptionReady(true);
                    console.log('✅ Master key unwrapped successfully');
                    console.log('Master key usages:', unwrappedMasterKey.usages);
                    console.log('Master key extractable:', unwrappedMasterKey.extractable);
                } else {
                    console.error('Failed to get wrapped key:', wrappedResult.error);
                    setError('Failed to retrieve decryption key');
                }
                
            } catch (keyError) {
                console.error('Failed to process share key:', keyError);
                
                // Try to diagnose the issue
                if (wrappedResult && wrappedResult.data) {
                    console.log('Wrapped key sample:', wrappedResult.data.substring(0, 20) + '...');
                    console.log('Wrapped key length:', wrappedResult.data.length);
                    
                    try {
                        const decoded = atob(wrappedResult.data);
                        console.log('Decoded wrapped key length:', decoded.length);
                        console.log('First few bytes:', Array.from(decoded.substring(0, 12)).map(c => c.charCodeAt(0)));
                    } catch (e) {
                        console.log('Not valid base64?', e.message);
                    }
                }
                
                setError('Invalid or corrupted share link');
                setLoading(false);
                return;
            }
            
            // Increment access count (async, don't wait)
            incrementShareAccess(result.share.id).catch(console.error);
            
        } catch (error) {
            console.error('Failed to load shared file:', error);
            setError('Failed to load shared file');
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = async () => {
        if (!file || !masterKey) {
            toast.error('Decryption key not available');
            return;
        }
        
        // Get the drive file ID - it should be in file.drive_file_id
        const driveFileId = file.drive_file_id;
        
        if (!driveFileId) {
            toast.error('Google Drive file ID not found in metadata');
            console.error('File object missing drive_file_id. Available fields:', Object.keys(file));
            console.error('Full file object:', file);
            return;
        }
        
        console.log('Downloading file with drive ID:', driveFileId);
        
        try {
            setDownloading(true);
            
            toast.loading('Downloading encrypted file...', { id: 'share-download' });
            
            // Download encrypted file from Google Drive
            const encryptedData = await downloadFromGoogleDrive(driveFileId);
            
            toast.loading('Decrypting file...', { id: 'share-download' });
            
            // Derive file-specific key from master key using the file's database ID
            const fileKey = await deriveFileKey(masterKey, file.id);
            
            // Decrypt using the file-specific key
            const decryptedData = await decryptWithFileKey(encryptedData, fileKey);
            
            // Determine MIME type
            let mimeType = file.file_type || 'application/octet-stream';
            
            // Create download
            const blob = new Blob([decryptedData], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.original_file_name || file.file_name || 'download';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            toast.success('File downloaded successfully!', { id: 'share-download' });
            
        } catch (error) {
            console.error('Download failed:', error);
            toast.error(`Download failed: ${error.message}`, { id: 'share-download' });
        } finally {
            setDownloading(false);
        }
    };

    const handlePreview = async () => {
        if (!file || !masterKey) return;
        
        // Get the drive file ID
        const driveFileId = file.drive_file_id;
        
        if (!driveFileId) {
            toast.error('Google Drive file ID not found in metadata');
            return;
        }
        
        // Check if file type is previewable
        const previewableTypes = [
            'image/', 'video/', 'audio/', 
            'application/pdf', 'text/plain'
        ];
        
        const canPreview = previewableTypes.some(type => 
            file.file_type?.startsWith(type)
        );
        
        if (!canPreview) {
            toast.error('This file type cannot be previewed');
            return;
        }
        
        try {
            setPreviewing(true);
            
            toast.loading('Preparing preview...', { id: 'share-preview' });
            
            // Download encrypted file
            const encryptedData = await downloadFromGoogleDrive(driveFileId);
            
            // Derive file-specific key from master key
            const fileKey = await deriveFileKey(masterKey, file.id);
            
            // Decrypt using file-specific key
            const decryptedData = await decryptWithFileKey(encryptedData, fileKey);
            
            // Create preview URL
            const blob = new Blob([decryptedData], { type: file.file_type });
            const url = URL.createObjectURL(blob);
            setPreviewUrl(url);
            
            toast.success('Preview ready', { id: 'share-preview' });
            
        } catch (error) {
            console.error('Preview failed:', error);
            toast.error(`Preview failed: ${error.message}`, { id: 'share-preview' });
        } finally {
            setPreviewing(false);
        }
    };

    const handleCopyLink = () => {
        navigator.clipboard.writeText(window.location.href);
        toast.success('Link copied to clipboard!');
    };

    const closePreview = () => {
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
        }
    };

    const formatFileSize = (bytes) => {
        if (!bytes) return '0 B';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading shared file...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
                    <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <FaExclamationTriangle className="w-10 h-10 text-red-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Share Not Found</h1>
                    <p className="text-gray-600 mb-6">{error}</p>
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

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
            {/* Preview Modal */}
            {previewUrl && (
                <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
                        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                            <h3 className="font-semibold text-gray-800">File Preview</h3>
                            <button
                                onClick={closePreview}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="p-4 overflow-auto max-h-[calc(90vh-80px)]">
                            {file?.file_type?.startsWith('image/') ? (
                                <img src={previewUrl} alt="Preview" className="max-w-full mx-auto" />
                            ) : file?.file_type?.startsWith('video/') ? (
                                <video src={previewUrl} controls className="max-w-full mx-auto" />
                            ) : file?.file_type?.startsWith('audio/') ? (
                                <audio src={previewUrl} controls className="w-full" />
                            ) : file?.file_type === 'application/pdf' ? (
                                <iframe src={previewUrl} className="w-full h-[70vh]" title="PDF Preview" />
                            ) : file?.file_type === 'text/plain' ? (
                                <pre className="bg-gray-50 p-4 rounded overflow-auto">
                                    {atob(previewUrl.split(',')[1])}
                                </pre>
                            ) : (
                                <p>Preview not available for this file type</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="max-w-2xl mx-auto px-4 py-12">
                <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-8 text-white">
                        <div className="flex items-center justify-center mb-4">
                            <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                                <FaUserSecret className="w-8 h-8" />
                            </div>
                        </div>
                        <h1 className="text-2xl font-bold text-center mb-2">
                            Shared File
                        </h1>
                        <p className="text-center text-blue-100">
                            This file has been shared with you securely
                        </p>
                    </div>

                    {/* File Info */}
                    <div className="p-6">
                        <div className="flex items-center space-x-4 mb-6">
                            <div className="p-3 bg-blue-100 rounded-lg">
                                <FaFile className="w-6 h-6 text-blue-600" />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-xl font-semibold text-gray-800 break-all">
                                    {file?.original_file_name || file?.file_name}
                                </h2>
                                <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                                    <span>{formatFileSize(file?.file_size)}</span>
                                    <span>•</span>
                                    <span>Shared {formatDate(share?.created_at)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Share Info */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                            <div className="flex items-center text-blue-700 mb-2">
                                <FaLock className="mr-2" />
                                <span className="font-medium">Public Share</span>
                            </div>
                            <p className="text-sm text-blue-600">
                                Anyone with this link can view and download the file.
                                {share?.expires_at && (
                                    <span className="block mt-1">
                                        <FaClock className="inline mr-1" />
                                        Expires {formatDate(share.expires_at)}
                                    </span>
                                )}
                            </p>
                            {!decryptionReady && (
                                <p className="text-sm text-yellow-600 mt-2">
                                    ⚠️ Decryption key not ready. Please refresh the page.
                                </p>
                            )}
                        </div>

                        {/* Action Buttons */}
                        {file && (
                            <div className="space-y-3">
                                <div className="flex space-x-3">
                                    {(file.file_type?.startsWith('image/') ||
                                      file.file_type?.startsWith('video/') ||
                                      file.file_type?.startsWith('audio/') ||
                                      file.file_type === 'application/pdf' ||
                                      file.file_type === 'text/plain') && (
                                        <button
                                            onClick={handlePreview}
                                            disabled={previewing || !decryptionReady}
                                            className="flex-1 flex items-center justify-center px-4 py-3 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-50 transition-colors"
                                        >
                                            {previewing ? (
                                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2"></div>
                                            ) : (
                                                <FaEye className="mr-2" />
                                            )}
                                            Preview
                                        </button>
                                    )}
                                    
                                    <button
                                        onClick={handleDownload}
                                        disabled={downloading || !decryptionReady}
                                        className="flex-1 flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                    >
                                        {downloading ? (
                                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                                        ) : (
                                            <FaDownload className="mr-2" />
                                        )}
                                        Download
                                    </button>
                                </div>

                                {/* Copy Link Button */}
                                <button
                                    onClick={handleCopyLink}
                                    className="w-full flex items-center justify-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                                >
                                    <FaCopy className="mr-2" />
                                    Copy Share Link
                                </button>
                            </div>
                        )}

                        {/* Security Notice */}
                        <div className="mt-6 pt-4 border-t border-gray-200">
                            <p className="text-xs text-gray-500 text-center">
                                End-to-end encrypted • File decrypted in your browser
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Unwrap master key using share key
async function unwrapMasterKey(wrappedData, shareKey) {
    let iv = null;
    let wrappedKey = null;
    let wrappedBuffer = null;
    
    try {
        console.log('🔑 Unwrapping master key...');
        console.log('Wrapped data type:', typeof wrappedData);
        console.log('Share key algorithm:', shareKey.algorithm);
        console.log('Share key usages:', shareKey.usages);
        
        if (typeof wrappedData === 'string') {
            console.log('Converting base64 string to Uint8Array');
            try {
                const binaryString = atob(wrappedData);
                console.log('Binary string length:', binaryString.length);
                
                wrappedBuffer = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    wrappedBuffer[i] = binaryString.charCodeAt(i);
                }
                console.log('Wrapped buffer created, length:', wrappedBuffer.length);
            } catch (e) {
                console.error('Base64 decode failed:', e);
                throw new Error('Invalid base64 encoded wrapped key');
            }
        } else if (wrappedData instanceof Uint8Array) {
            wrappedBuffer = wrappedData;
        } else if (wrappedData instanceof ArrayBuffer) {
            wrappedBuffer = new Uint8Array(wrappedData);
        } else {
            throw new Error(`Unexpected wrapped data type: ${typeof wrappedData}`);
        }
        
        if (wrappedBuffer.length < 13) {
            throw new Error(`Wrapped key too short: ${wrappedBuffer.length} bytes`);
        }
        
        iv = wrappedBuffer.slice(0, 12);
        wrappedKey = wrappedBuffer.slice(12);
        
        console.log('IV length:', iv.length, 'IV (hex):', Array.from(iv).map(b => b.toString(16).padStart(2,'0')).join(''));
        console.log('Wrapped key length:', wrappedKey.length);

        if (!shareKey.usages.includes('unwrapKey')) {
            console.error('Share key missing unwrapKey permission. Usages:', shareKey.usages);
            throw new Error('Share key missing unwrapKey permission');
        }

        const wrappedKeyBuffer = wrappedKey.buffer.slice(
            wrappedKey.byteOffset,
            wrappedKey.byteOffset + wrappedKey.byteLength
        );

        console.log('Attempting to unwrap key...');
        
        const masterKey = await crypto.subtle.unwrapKey(
            'raw',
            wrappedKeyBuffer,
            shareKey,
            { name: 'AES-GCM', iv: iv, tagLength: 128 },
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
        );
        
        console.log('✅ Master key unwrapped successfully');
        console.log('Master key algorithm:', masterKey.algorithm);
        console.log('Master key usages:', masterKey.usages);
        console.log('Master key extractable:', masterKey.extractable);
        
        return masterKey;
    } catch (error) {
        console.error('❌ Failed to unwrap master key:');
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        
        console.error('Debug info:');
        console.error('  - Share key algorithm:', shareKey.algorithm);
        console.error('  - Share key usages:', shareKey.usages);
        if (iv) {
            console.error('  - IV length:', iv.length);
            console.error('  - IV hex:', Array.from(iv).map(b => b.toString(16).padStart(2,'0')).join(''));
        }
        if (wrappedKey) {
            console.error('  - Wrapped key length:', wrappedKey.length);
        }
        if (wrappedBuffer) {
            console.error('  - Wrapped buffer length:', wrappedBuffer.length);
        }
        
        if (typeof wrappedData === 'string') {
            try {
                const testDecode = atob(wrappedData);
                console.error('  - Base64 decode successful, length:', testDecode.length);
            } catch (e) {
                console.error('  - Base64 decode failed:', e.message);
            }
        }
        
        throw error;
    }
}

// Derive file-specific key from master key
async function deriveFileKey(masterKey, fileId) {
    try {
        console.log('Deriving file key for file ID:', fileId);
        console.log('Master key extractable:', masterKey.extractable);
        
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
        console.log('File key usages:', fileKey.usages);
        
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
        console.log('File key usages:', fileKey.usages);

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

export default SharedFileViewer;