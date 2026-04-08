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

import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { FaUpload, FaFile, FaTimes, FaGoogleDrive, FaCheckCircle, FaExclamationCircle } from 'react-icons/fa';
import { encryptFile, generateFileId } from '../utils/encryption';
import { initGoogleDrive, authenticateGoogleDrive, uploadToGoogleDrive, isGoogleDriveConnected } from '../services/googleDrive';
import { saveFileMetadata } from '../services/metadataService';
import { getMasterKeyFromMemory } from '../services/keyManagementService';
import toast from 'react-hot-toast';

const FileUpload = ({ onUploadComplete }) => {
    const [files, setFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [driveConnected, setDriveConnected] = useState(false);
    const [progress, setProgress] = useState({});
    const [initializing, setInitializing] = useState(true);
    const [masterKeyReady, setMasterKeyReady] = useState(false);

    // Check master key and Google Drive connection
    useEffect(() => {
        const checkSetup = async () => {
            try {
                const masterKey = getMasterKeyFromMemory();
                setMasterKeyReady(!!masterKey);
                
                await initGoogleDrive();
                const connected = isGoogleDriveConnected();
                setDriveConnected(connected);
                
                if (connected) {
                    console.log('✅ Restored Google Drive connection');
                }
            } catch (error) {
                console.error('Setup check failed:', error);
            } finally {
                setInitializing(false);
            }
        };
        
        checkSetup();
    }, []);

    const onDrop = useCallback((acceptedFiles) => {
        setFiles(prev => [
            ...prev,
            ...acceptedFiles.map(file => ({
                file,
                id: generateFileId(),
                status: 'pending',
                progress: 0,
                error: null
            }))
        ]);
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        multiple: true,
        accept: {
            'image/*': [],
            'video/*': [],
            'audio/*': [],
            'application/pdf': [],
            'application/msword': [],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [],
            'application/vnd.ms-excel': [],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [],
            'application/vnd.ms-powerpoint': [],
            'application/vnd.openxmlformats-officedocument.presentationml.presentation': [],
            'text/plain': [],
            'application/zip': [],
            'application/x-rar-compressed': [],
            'application/json': [],
            'text/csv': []
        }
    });

    const connectGoogleDrive = async () => {
        try {
            toast.loading('Connecting to Google Drive...', { id: 'drive-connect' });
            await initGoogleDrive();
            await authenticateGoogleDrive();
            setDriveConnected(true);
            toast.success('Google Drive connected!', { id: 'drive-connect' });
        } catch (error) {
            console.error('Failed to connect to Google Drive:', error);
            toast.error('Failed to connect to Google Drive', { id: 'drive-connect' });
        }
    };

    const uploadFiles = async () => {
        if (!driveConnected) {
            toast.error('Please connect to Google Drive first');
            return;
        }

        if (!masterKeyReady) {
            toast.error('Master key not available. Please log in again.');
            return;
        }

        const userId = localStorage.getItem('userId');
        if (!userId) {
            toast.error('No user ID found. Please log in again.');
            return;
        }

        setUploading(true);
        let successCount = 0;
        let errorCount = 0;

        for (const fileItem of files) {
            if (fileItem.status === 'complete' || fileItem.status === 'error') continue;
            
            const toastId = fileItem.id;
            
            try {
                setFiles(prev => prev.map(f => 
                    f.id === fileItem.id ? { ...f, status: 'uploading', error: null } : f
                ));
                
                setProgress(prev => ({ ...prev, [fileItem.id]: 5 }));
                
                toast.loading(`Encrypting ${fileItem.file.name}...`, { id: toastId });

                // Encrypt file using master key
                const encryptedData = await encryptFile(fileItem.file, fileItem.id);
                
                setProgress(prev => ({ ...prev, [fileItem.id]: 60 }));

                // Upload to Google Drive with encrypted filename
                toast.loading(`Uploading to Google Drive...`, { id: toastId });
                
                const driveFile = await uploadToGoogleDrive(
                    encryptedData,
                    fileItem.file.name,
                    'application/octet-stream'
                );

                setProgress(prev => ({ ...prev, [fileItem.id]: 90 }));

                // Save metadata with original filename and encrypted Drive filename
                const metadata = {
                    fileId: fileItem.id,
                    userId: userId,
                    fileName: fileItem.file.name,
                    originalName: fileItem.file.name,
                    fileSize: fileItem.file.size,
                    fileType: fileItem.file.type || 'application/octet-stream',
                    driveFileId: driveFile.id,
                    driveFileName: driveFile.encryptedFileName,
                    driveFileUrl: `https://drive.google.com/file/d/${driveFile.id}/view`
                };
                
                console.log('📝 Saving metadata:', metadata);
                
                const saveResult = await saveFileMetadata(metadata);
                
                if (saveResult.success) {
                    setProgress(prev => ({ ...prev, [fileItem.id]: 100 }));
                    setFiles(prev => prev.map(f => 
                        f.id === fileItem.id ? { ...f, status: 'complete' } : f
                    ));
                    toast.success(`${fileItem.file.name} uploaded securely!`, { id: toastId });
                    successCount++;
                } else {
                    console.error('Metadata save failed:', saveResult);
                    throw new Error(saveResult.error || 'Failed to save metadata');
                }

            } catch (error) {
                console.error(`❌ Upload failed:`, error);
                setFiles(prev => prev.map(f => 
                    f.id === fileItem.id ? { ...f, status: 'error', error: error.message } : f
                ));
                toast.error(`Upload failed: ${error.message}`, { id: toastId });
                errorCount++;
            }
        }

        setUploading(false);
        
        if (successCount > 0) {
            toast.success(`${successCount} file(s) uploaded securely!`);
            if (onUploadComplete) {
                setTimeout(() => onUploadComplete(), 500);
            }
        } else if (errorCount > 0) {
            toast.error(`Failed to upload ${errorCount} file(s)`);
        }
    };

    const removeFile = (fileId) => {
        setFiles(prev => prev.filter(f => f.id !== fileId));
        setProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[fileId];
            return newProgress;
        });
    };

    if (initializing) {
        return (
            <div className="text-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-600">Initializing...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Master Key Status */}
            {!masterKeyReady && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700">
                    ⚠️ Master key not available. Please log in again.
                </div>
            )}

            {/* Google Drive Connection */}
            {!driveConnected ? (
                <button
                    onClick={connectGoogleDrive}
                    className="w-full flex items-center justify-center px-4 py-3 bg-white border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                >
                    <FaGoogleDrive className="mr-2" />
                    Connect to Google Drive
                </button>
            ) : (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 flex items-center justify-between">
                    <div className="flex items-center">
                        <FaGoogleDrive className="mr-2" />
                        Connected to Google Drive
                    </div>
                    <span className="text-xs bg-green-200 px-2 py-1 rounded">
                        Ready
                    </span>
                </div>
            )}

            {/* Dropzone */}
            <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                    isDragActive
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                } ${!driveConnected || !masterKeyReady ? 'opacity-50 pointer-events-none' : ''}`}
            >
                <input {...getInputProps()} disabled={!driveConnected || !masterKeyReady} />
                <FaUpload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                {isDragActive ? (
                    <p className="text-blue-600">Drop files here...</p>
                ) : (
                    <div>
                        <p className="text-gray-700 mb-2">
                            {driveConnected && masterKeyReady
                                ? 'Drag & drop any files here, or click to select'
                                : 'Complete setup first'}
                        </p>
                        <p className="text-sm text-gray-500">
                            Files encrypted with Master Key • Filenames encrypted • AES-256-GCM
                        </p>
                    </div>
                )}
            </div>

            {/* File List */}
            {files.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 divide-y">
                    {files.map((fileItem) => (
                        <div key={fileItem.id} className="p-4">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center space-x-3 flex-1">
                                    {fileItem.status === 'complete' ? (
                                        <FaCheckCircle className="text-green-500" />
                                    ) : fileItem.status === 'error' ? (
                                        <FaExclamationCircle className="text-red-500" />
                                    ) : (
                                        <FaFile className="text-gray-400" />
                                    )}
                                    <div className="flex-1">
                                        <p className="font-medium text-gray-800">
                                            {fileItem.file.name}
                                        </p>
                                        <p className="text-sm text-gray-500">
                                            {(fileItem.file.size / 1024).toFixed(1)} KB
                                            {fileItem.status === 'complete' && ' • Uploaded securely'}
                                            {fileItem.status === 'error' && ' • Failed'}
                                        </p>
                                    </div>
                                </div>
                                {fileItem.status !== 'uploading' && (
                                    <button
                                        onClick={() => removeFile(fileItem.id)}
                                        className="text-gray-400 hover:text-red-500 ml-2"
                                    >
                                        <FaTimes />
                                    </button>
                                )}
                            </div>

                            {/* Progress bar */}
                            {fileItem.status === 'uploading' && progress[fileItem.id] !== undefined && (
                                <div className="relative pt-1">
                                    <div className="overflow-hidden h-2 text-xs flex rounded bg-blue-200">
                                        <div
                                            style={{ width: `${progress[fileItem.id]}%` }}
                                            className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500 transition-all duration-300"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    
                    {/* Action buttons */}
                    {files.filter(f => f.status === 'complete').length > 0 && (
                        <div className="p-4 bg-gray-50 flex justify-end">
                            <button
                                onClick={() => setFiles(prev => prev.filter(f => f.status !== 'complete'))}
                                className="text-sm text-gray-600 hover:text-gray-800"
                            >
                                Clear completed
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Upload Button */}
            {files.filter(f => f.status !== 'complete').length > 0 && !uploading && (
                <button
                    onClick={uploadFiles}
                    disabled={!driveConnected || !masterKeyReady}
                    className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Upload {files.filter(f => f.status !== 'complete').length} file(s) securely
                </button>
            )}

            {uploading && (
                <div className="text-center text-gray-600">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    Uploading files securely... Please wait.
                </div>
            )}
        </div>
    );
};

export default FileUpload;