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
import { 
  FaCloudDownloadAlt, 
  FaTrash, 
  FaFile, 
  FaImage, 
  FaVideo, 
  FaFilePdf, 
  FaFileWord, 
  FaFileExcel, 
  FaFilePowerpoint,
  FaFileArchive,
  FaFileAudio,
  FaSync,
  FaLock,
  FaLink,
  FaCopy,
  FaUserSecret,
  FaEnvelope,
  FaClock  // This was missing!
} from 'react-icons/fa';
import { listUserFiles, downloadFromGoogleDrive, deleteFromGoogleDrive, isGoogleDriveConnected } from '../services/googleDrive';
import { decryptFile } from '../utils/encryption';
import { getUserFiles, deleteFileMetadata } from '../services/metadataService';
import { getMasterKeyFromMemory } from '../services/keyManagementService';
import { createShare, createShareableLink, getUserShares, deleteShare } from '../services/shareService';
import { isValidEmail } from '../utils/security';
import toast from 'react-hot-toast';

const FileList = ({ refresh }) => {
    const [files, setFiles] = useState([]);
    const [shares, setShares] = useState([]);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState({});
    const [deleting, setDeleting] = useState({});
    const [sharing, setSharing] = useState({});
    const [showShares, setShowShares] = useState(false);
    const [error, setError] = useState(null);
    const [masterKeyReady, setMasterKeyReady] = useState(false);
    const [shareLink, setShareLink] = useState(null);
    const userId = localStorage.getItem('userId');

    useEffect(() => {
        setMasterKeyReady(!!getMasterKeyFromMemory());
        fetchFiles();
        fetchShares();
    }, [refresh]);

    const fetchFiles = async () => {
        try {
            setLoading(true);
            setError(null);
            
            if (!isGoogleDriveConnected()) {
                setFiles([]);
                setLoading(false);
                return;
            }

            if (!userId) {
                setError('No user logged in');
                setLoading(false);
                return;
            }
            
            // Get metadata from Supabase
            let backendFiles = [];
            let backendMap = new Map();
            
            try {
                const backendResult = await getUserFiles(userId);
                if (backendResult.success) {
                    backendFiles = backendResult.data || [];
                    backendFiles.forEach(f => {
                        backendMap.set(f.drive_file_id, f);
                    });
                }
            } catch (err) {
                console.log('Backend files fetch failed:', err.message);
            }
            
            // List files from Google Drive
            const driveFiles = await listUserFiles();
            
            // Merge files
            const mergedFiles = driveFiles.map(driveFile => {
                const backendFile = backendMap.get(driveFile.id);
                
                let originalName = driveFile.name;
                let fileId = null;
                
                if (backendFile) {
                    originalName = backendFile.file_name || backendFile.original_file_name || driveFile.name;
                    fileId = backendFile.id;
                } else {
                    originalName = driveFile.name + ' (encrypted)';
                }
                
                return {
                    id: driveFile.id,
                    driveFileName: driveFile.name,
                    originalName: originalName,
                    size: parseInt(driveFile.size) || 0,
                    createdTime: driveFile.createdTime,
                    modifiedTime: driveFile.modifiedTime,
                    mimeType: driveFile.mimeType,
                    hasMetadata: !!backendFile,
                    metadata: backendFile,
                    fileId: fileId,
                };
            });
            
            mergedFiles.sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime));
            setFiles(mergedFiles);
            
        } catch (error) {
            console.error('Failed to fetch files:', error);
            setError(error.message);
            toast.error('Failed to load files');
        } finally {
            setLoading(false);
        }
    };

    const fetchShares = async () => {
        try {
            if (!userId) return;
            
            const result = await getUserShares(userId);
            if (result.success) {
                setShares(result.shares);
            }
        } catch (error) {
            console.error('Failed to fetch shares:', error);
        }
    };

    const getFileIcon = (filename) => {
        const ext = filename.split('.').pop()?.toLowerCase();
        
        if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(ext)) {
            return <FaImage className="text-blue-500 text-xl" />;
        }
        if (['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv'].includes(ext)) {
            return <FaVideo className="text-purple-500 text-xl" />;
        }
        if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) {
            return <FaFileAudio className="text-green-500 text-xl" />;
        }
        if (ext === 'pdf') {
            return <FaFilePdf className="text-red-500 text-xl" />;
        }
        if (['doc', 'docx'].includes(ext)) {
            return <FaFileWord className="text-blue-600 text-xl" />;
        }
        if (['xls', 'xlsx', 'csv'].includes(ext)) {
            return <FaFileExcel className="text-green-600 text-xl" />;
        }
        if (['ppt', 'pptx'].includes(ext)) {
            return <FaFilePowerpoint className="text-orange-500 text-xl" />;
        }
        if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
            return <FaFileArchive className="text-yellow-600 text-xl" />;
        }
        return <FaFile className="text-gray-500 text-xl" />;
    };

    const handleDownload = async (file) => {
        if (!masterKeyReady) {
            toast.error('Master key not available. Please log in again.');
            return;
        }

        try {
            setDownloading(prev => ({ ...prev, [file.id]: true }));
            
            toast.loading('Downloading encrypted file...', { id: file.id });
            
            const encryptedData = await downloadFromGoogleDrive(file.id);
            
            toast.loading('Decrypting file...', { id: file.id });
            
            const fileIdForDecryption = file.fileId;
            
            if (!fileIdForDecryption) {
                throw new Error('Cannot decrypt: No file ID found in metadata.');
            }
            
            const decryptedData = await decryptFile(encryptedData, fileIdForDecryption);
            
            // Determine MIME type
            let mimeType = 'application/octet-stream';
            const ext = file.originalName.split('.').pop()?.toLowerCase();
            
            const mimeTypes = {
                'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 
                'gif': 'image/gif', 'bmp': 'image/bmp', 'webp': 'image/webp',
                'svg': 'image/svg+xml', 'mp4': 'video/mp4', 'webm': 'video/webm',
                'avi': 'video/x-msvideo', 'mov': 'video/quicktime', 'mkv': 'video/x-matroska',
                'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg',
                'm4a': 'audio/mp4', 'flac': 'audio/flac', 'pdf': 'application/pdf',
                'doc': 'application/msword', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'txt': 'text/plain', 'rtf': 'application/rtf', 'xls': 'application/vnd.ms-excel',
                'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'csv': 'text/csv', 'ppt': 'application/vnd.ms-powerpoint',
                'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'zip': 'application/zip', 'rar': 'application/x-rar-compressed',
                '7z': 'application/x-7z-compressed', 'tar': 'application/x-tar',
                'gz': 'application/gzip'
            };
            
            if (ext && mimeTypes[ext]) {
                mimeType = mimeTypes[ext];
            }
            
            const blob = new Blob([decryptedData], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.originalName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            toast.success(`Downloaded: ${file.originalName}`, { id: file.id });
            
        } catch (error) {
            console.error('Download failed:', error);
            toast.error(`Download failed: ${error.message}`, { id: file.id });
        } finally {
            setDownloading(prev => ({ ...prev, [file.id]: false }));
        }
    };

    const handleDelete = async (file) => {
        if (!confirm(`Delete "${file.originalName}"? This will also delete all shares.`)) return;
        
        try {
            setDeleting(prev => ({ ...prev, [file.id]: true }));
            toast.loading('Deleting...', { id: file.id });
            
            await deleteFromGoogleDrive(file.id);
            
            if (file.metadata?.id) {
                await deleteFileMetadata(file.metadata.id);
            }
            
            toast.success('File deleted', { id: file.id });
            setFiles(prev => prev.filter(f => f.id !== file.id));
            fetchShares(); // Refresh shares list
            
        } catch (error) {
            console.error('Delete failed:', error);
            toast.error(`Delete failed: ${error.message}`, { id: file.id });
        } finally {
            setDeleting(prev => ({ ...prev, [file.id]: false }));
        }
    };

    const handlePublicShare = async (file) => {
        if (!file.hasMetadata || !file.fileId) {
            toast.error('Cannot share: Missing file metadata');
            return;
        }

        try {
            setSharing(prev => ({ ...prev, [file.id]: true }));
            
            const userId = localStorage.getItem('userId');
            const result = await createShare(file.fileId, userId, 'public');
            
            if (!result.success) {
                throw new Error(result.error);
            }
            
            const link = createShareableLink(
                result.share.share_token, 
                file.fileId,
                result.share.share_key
            );
            
            await navigator.clipboard.writeText(link);
            
            toast.success(
                <div>
                    <p>Public share link copied!</p>
                    <p className="text-xs mt-1 opacity-75 break-all">{link}</p>
                </div>,
                { duration: 5000 }
            );
            
            fetchShares(); // Refresh shares list
            
        } catch (error) {
            console.error('Public share failed:', error);
            toast.error(`Share failed: ${error.message}`);
        } finally {
            setSharing(prev => ({ ...prev, [file.id]: false }));
        }
    };

    const handlePrivateShare = async (file) => {
        const email = prompt('Enter the email address to share with:');
        if (!email) return;
        
        if (!isValidEmail(email)) {
            toast.error('Please enter a valid email address');
            return;
        }

        if (!file.hasMetadata || !file.fileId) {
            toast.error('Cannot share: Missing file metadata');
            return;
        }

        try {
            setSharing(prev => ({ ...prev, [file.id]: true }));
            
            const userId = localStorage.getItem('userId');
            const result = await createShare(file.fileId, userId, 'private', email);
            
            if (!result.success) {
                throw new Error(result.error);
            }
            
            const link = createShareableLink(result.share.share_token, file.fileId);
            
            await navigator.clipboard.writeText(link);
            
            toast.success(
                <div>
                    <p>Private share link copied!</p>
                    <p className="text-xs mt-1 opacity-75">Recipient: {email}</p>
                    <p className="text-xs opacity-75">They will need to verify their email</p>
                </div>,
                { duration: 5000 }
            );
            
            fetchShares(); // Refresh shares list
            
        } catch (error) {
            console.error('Private share failed:', error);
            toast.error(`Share failed: ${error.message}`);
        } finally {
            setSharing(prev => ({ ...prev, [file.id]: false }));
        }
    };

    const handleCopyShareLink = async (share) => {
        const link = createShareableLink(share.share_token, share.file_id);
        await navigator.clipboard.writeText(link);
        toast.success('Share link copied to clipboard!');
    };

    const handleDeleteShare = async (shareId) => {
        if (!confirm('Delete this share? The link will no longer work.')) return;
        
        try {
            const result = await deleteShare(shareId);
            if (result.success) {
                toast.success('Share deleted');
                fetchShares();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            toast.error(`Failed to delete share: ${error.message}`);
        }
    };

    const formatFileSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffDays = Math.ceil(Math.abs(now - date) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric'
        });
    };

    if (loading) {
        return (
            <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading files...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-8">
                <div className="text-red-600 mb-4">Error: {error}</div>
                <button onClick={fetchFiles} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    <FaSync className="inline mr-2" /> Retry
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {!masterKeyReady && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-yellow-700">
                    ⚠️ Master key not loaded. Please log in again to decrypt files.
                </div>
            )}

            {/* Toggle between Files and Shares */}
            <div className="flex space-x-2 border-b border-gray-200 pb-2">
                <button
                    onClick={() => setShowShares(false)}
                    className={`px-4 py-2 font-medium rounded-t-lg ${
                        !showShares 
                            ? 'bg-blue-600 text-white' 
                            : 'text-gray-600 hover:text-gray-800'
                    }`}
                >
                    My Files ({files.length})
                </button>
                <button
                    onClick={() => setShowShares(true)}
                    className={`px-4 py-2 font-medium rounded-t-lg ${
                        showShares 
                            ? 'bg-blue-600 text-white' 
                            : 'text-gray-600 hover:text-gray-800'
                    }`}
                >
                    Shared Links ({shares.length})
                </button>
            </div>

            {!showShares ? (
                /* Files View */
                files.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        <span className="text-6xl mb-4 block">📁</span>
                        <p className="text-lg mb-2">No files found</p>
                        <p className="text-sm">Upload your first encrypted file</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {files.map((file) => (
                            <div key={file.id} className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200 hover:shadow-md">
                                <div className="flex items-center space-x-4 flex-1 min-w-0">
                                    <div className="flex-shrink-0">{getFileIcon(file.originalName)}</div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-gray-800 truncate flex items-center">
                                            {file.originalName}
                                            {file.hasMetadata && (
                                                <FaLock className="ml-2 text-green-500 text-xs" title="Filename encrypted in storage" />
                                            )}
                                            {!file.hasMetadata && (
                                                <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                                                    Missing metadata
                                                </span>
                                            )}
                                        </p>
                                        <p className="text-sm text-gray-500">
                                            {formatFileSize(file.size)} • {formatDate(file.modifiedTime)}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-2 ml-4">
                                    <button
                                        onClick={() => handleDownload(file)}
                                        disabled={downloading[file.id] || deleting[file.id] || !file.hasMetadata || !masterKeyReady}
                                        className={`p-2 transition-colors ${
                                            file.hasMetadata && masterKeyReady
                                                ? 'text-gray-500 hover:text-blue-600'
                                                : 'text-gray-300 cursor-not-allowed'
                                        }`}
                                        title="Download"
                                    >
                                        {downloading[file.id] ? (
                                            <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full" />
                                        ) : (
                                            <FaCloudDownloadAlt className="h-5 w-5" />
                                        )}
                                    </button>
                                    <button
                                        onClick={() => handlePublicShare(file)}
                                        disabled={sharing[file.id] || deleting[file.id] || !file.hasMetadata}
                                        className={`p-2 transition-colors ${
                                            file.hasMetadata
                                                ? 'text-gray-500 hover:text-green-600'
                                                : 'text-gray-300 cursor-not-allowed'
                                        }`}
                                        title="Create public share link"
                                    >
                                        {sharing[file.id] ? (
                                            <div className="animate-spin h-5 w-5 border-2 border-green-600 border-t-transparent rounded-full" />
                                        ) : (
                                            <FaLink className="h-5 w-5" />
                                        )}
                                    </button>
                                    <button
                                        onClick={() => handlePrivateShare(file)}
                                        disabled={sharing[file.id] || deleting[file.id] || !file.hasMetadata}
                                        className={`p-2 transition-colors ${
                                            file.hasMetadata
                                                ? 'text-gray-500 hover:text-purple-600'
                                                : 'text-gray-300 cursor-not-allowed'
                                        }`}
                                        title="Create private share (email verification)"
                                    >
                                        {sharing[file.id] ? (
                                            <div className="animate-spin h-5 w-5 border-2 border-purple-600 border-t-transparent rounded-full" />
                                        ) : (
                                            <FaUserSecret className="h-5 w-5" />
                                        )}
                                    </button>
                                    <button
                                        onClick={() => handleDelete(file)}
                                        disabled={deleting[file.id] || downloading[file.id]}
                                        className="p-2 text-gray-500 hover:text-red-600 disabled:opacity-50"
                                        title="Delete"
                                    >
                                        {deleting[file.id] ? (
                                            <div className="animate-spin h-5 w-5 border-2 border-red-600 border-t-transparent rounded-full" />
                                        ) : (
                                            <FaTrash className="h-5 w-5" />
                                        )}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            ) : (
                /* Shares View */
                shares.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        <span className="text-6xl mb-4 block">🔗</span>
                        <p className="text-lg mb-2">No shares created</p>
                        <p className="text-sm">Share a file to create a link</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {shares.map((share) => (
                            <div key={share.id} className="p-4 bg-white rounded-lg border border-gray-200">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center space-x-3">
                                        {share.share_type === 'public' ? (
                                            <FaLink className="text-green-500" />
                                        ) : (
                                            <FaUserSecret className="text-purple-500" />
                                        )}
                                        <div>
                                            <p className="font-medium text-gray-800">
                                                {share.files?.file_name || 'Unknown file'}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                {share.share_type === 'public' ? 'Public' : 'Private'} • 
                                                Created {formatDate(share.created_at)} • 
                                                {share.access_count || 0} accesses
                                            </p>
                                            {share.share_type === 'private' && share.target_email && (
                                                <p className="text-xs text-purple-600 flex items-center mt-1">
                                                    <FaEnvelope className="mr-1" />
                                                    Shared with: {share.target_email}
                                                </p>
                                            )}
                                            {share.expires_at && (
                                                <p className="text-xs text-orange-600 mt-1">
                                                    <FaClock className="inline mr-1" />
                                                    Expires {formatDate(share.expires_at)}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <button
                                            onClick={() => handleCopyShareLink(share)}
                                            className="p-2 text-gray-500 hover:text-blue-600"
                                            title="Copy link"
                                        >
                                            <FaCopy className="h-4 w-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteShare(share.id)}
                                            className="p-2 text-gray-500 hover:text-red-600"
                                            title="Delete share"
                                        >
                                            <FaTrash className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            )}
        </div>
    );
};

export default FileList;