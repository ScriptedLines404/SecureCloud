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

// frontend/src/components/BatchDownloadModal.jsx - Fixed for actual file download

import React, { useState, useEffect } from 'react';
import { FaTimes, FaDownload, FaFile, FaSpinner, FaSearch, FaPause, FaPlay, FaStop, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';
import { listUserFiles, downloadFromGoogleDrive } from '../services/googleDrive';
import { getUserFiles } from '../services/metadataService';
import { decryptFile } from '../utils/encryption';
import { getMasterKeyFromMemory } from '../services/keyManagementService';
import toast from 'react-hot-toast';
import JSZip from 'jszip';

const BatchDownloadModal = ({ onClose }) => {
    const [files, setFiles] = useState([]);
    const [filteredFiles, setFilteredFiles] = useState([]);
    const [selectedFiles, setSelectedFiles] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState(false);
    const [paused, setPaused] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0, currentFile: '', downloadedSize: 0, totalSize: 0 });
    const [selectAll, setSelectAll] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [fileCount, setFileCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(50);
    const [failedFiles, setFailedFiles] = useState([]);
    const [completedFiles, setCompletedFiles] = useState([]);
    const userId = localStorage.getItem('userId');

    useEffect(() => {
        loadFiles();
    }, []);

    useEffect(() => {
        const filtered = files.filter(file => 
            file.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
        setFilteredFiles(filtered);
        setCurrentPage(1);
    }, [searchTerm, files]);

    useEffect(() => {
        if (filteredFiles.length > 0) {
            const selectedCount = Array.from(selectedFiles).filter(id => 
                filteredFiles.some(f => f.id === id)
            ).length;
            setSelectAll(selectedCount === filteredFiles.length && filteredFiles.length > 0);
        }
    }, [selectedFiles, filteredFiles]);

    const loadFiles = async () => {
        try {
            setLoading(true);
            
            const masterKey = getMasterKeyFromMemory();
            if (!masterKey) {
                toast.error('Master key not available. Please derive it first.');
                onClose();
                return;
            }

            toast.loading('Fetching file list from Google Drive...', { id: 'load-files' });

            const driveFiles = await listUserFiles();
            console.log(`📊 Retrieved ${driveFiles.length} files from Google Drive`);
            
            let metadataMap = new Map();
            
            try {
                toast.loading('Loading file metadata...', { id: 'load-files' });
                const backendResult = await getUserFiles(userId);
                if (backendResult.success) {
                    backendResult.data.forEach(f => {
                        metadataMap.set(f.drive_file_id, f);
                    });
                }
            } catch (err) {
                console.log('Failed to fetch metadata:', err);
            }

            const mergedFiles = driveFiles
                .map(driveFile => {
                    const metadata = metadataMap.get(driveFile.id);
                    return {
                        id: driveFile.id,
                        name: metadata?.original_file_name || metadata?.file_name || driveFile.name,
                        driveFileName: driveFile.name,
                        size: parseInt(driveFile.size) || 0,
                        modifiedTime: driveFile.modifiedTime,
                        hasMetadata: !!metadata,
                        fileId: metadata?.id,
                        fileSize: metadata?.file_size || parseInt(driveFile.size) || 0
                    };
                })
                .filter(file => file.hasMetadata);

            console.log(`✅ Ready to download: ${mergedFiles.length} files`);
            setFiles(mergedFiles);
            setFilteredFiles(mergedFiles);
            setFileCount(mergedFiles.length);
            
            toast.success(`Found ${mergedFiles.length} encrypted files`, { id: 'load-files', duration: 2000 });
            
            const initialSelection = new Set(mergedFiles.slice(0, 100).map(f => f.id));
            setSelectedFiles(initialSelection);
            
            if (mergedFiles.length > 100) {
                toast(`Loaded ${mergedFiles.length} files. First 100 selected by default.`, { duration: 5000, icon: 'ℹ️' });
            }
            
        } catch (error) {
            console.error('Failed to load files:', error);
            toast.error('Failed to load file list: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const downloadFileWithRetry = async (file, retries = 3) => {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                console.log(`📥 Attempt ${attempt}/${retries} for ${file.name}`);
                
                const encryptedData = await downloadFromGoogleDrive(file.id);
                const decryptedData = await decryptFile(encryptedData, file.fileId);
                
                return new Blob([decryptedData], { type: 'application/octet-stream' });
                
            } catch (error) {
                console.error(`Attempt ${attempt} failed for ${file.name}:`, error.message);
                
                if (attempt === retries) {
                    throw error;
                }
                
                const waitTime = Math.pow(2, attempt) * 1000;
                console.log(`Waiting ${waitTime}ms before retry...`);
                await sleep(waitTime);
            }
        }
    };

    const downloadFilesAsZip = async (filesToZip, zipName, onProgress) => {
        const zip = new JSZip();
        
        for (let i = 0; i < filesToZip.length; i++) {
            const file = filesToZip[i];
            zip.file(file.name, file.blob);
            
            if (onProgress) {
                onProgress(i + 1, filesToZip.length, file.name);
            }
        }
        
        // Generate the zip file
        const zipBlob = await zip.generateAsync({ 
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        });
        
        // Trigger download
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = zipName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        return zipBlob;
    };

    const handleBatchDownload = async () => {
        const filesToDownload = files.filter(f => selectedFiles.has(f.id));
        
        if (filesToDownload.length === 0) {
            toast.error('No files selected');
            return;
        }

        if (filesToDownload.length > 50) {
            const totalSize = filesToDownload.reduce((sum, f) => sum + (f.fileSize || f.size), 0);
            const confirmed = window.confirm(
                `You are about to download ${filesToDownload.length} files (${formatFileSize(totalSize)}).\n\n` +
                `This may take 10-30 minutes depending on your connection.\n\n` +
                `Click OK to continue.`
            );
            if (!confirmed) return;
        }

        const masterKey = getMasterKeyFromMemory();
        if (!masterKey) {
            toast.error('Master key not available');
            return;
        }

        setDownloading(true);
        setPaused(false);
        setFailedFiles([]);
        setCompletedFiles([]);
        
        const downloadedFiles = [];
        let successCount = 0;
        let failCount = 0;
        let totalDownloadedSize = 0;
        const totalSize = filesToDownload.reduce((sum, f) => sum + (f.fileSize || f.size), 0);

        // Process files in smaller batches
        const BATCH_SIZE = 5;
        
        for (let i = 0; i < filesToDownload.length; i++) {
            if (paused) {
                toast('Download paused. Click resume to continue.', { icon: '⏸️', duration: 3000 });
                break;
            }
            
            const file = filesToDownload[i];
            const globalIndex = i + 1;
            
            setProgress({
                current: globalIndex,
                total: filesToDownload.length,
                currentFile: file.name,
                downloadedSize: formatFileSize(totalDownloadedSize),
                totalSize: formatFileSize(totalSize),
                percentage: totalSize > 0 ? Math.round((totalDownloadedSize / totalSize) * 100) : 0
            });

            try {
                console.log(`📥 Downloading ${globalIndex}/${filesToDownload.length}: ${file.name}`);
                
                const fileBlob = await downloadFileWithRetry(file, 3);
                
                totalDownloadedSize += fileBlob.size;
                downloadedFiles.push({
                    name: file.name,
                    blob: fileBlob
                });
                
                successCount++;
                setCompletedFiles(prev => [...prev, file.name]);
                
                toast.loading(
                    `Progress: ${globalIndex}/${filesToDownload.length} - ${Math.round((totalDownloadedSize / totalSize) * 100)}%`,
                    { id: 'batch-progress', duration: 1000 }
                );
                
                // Small delay between files
                await sleep(500);
                
            } catch (error) {
                console.error(`Failed to download ${file.name}:`, error);
                failCount++;
                setFailedFiles(prev => [...prev, { name: file.name, error: error.message }]);
                toast.error(`Failed: ${file.name} - ${error.message}`, { id: `error-${file.id}`, duration: 3000 });
            }
        }

        if (downloadedFiles.length > 0 && !paused) {
            try {
                setProgress(prev => ({ ...prev, currentFile: 'Creating ZIP archive...' }));
                toast.loading('Creating ZIP archive...', { id: 'batch-progress' });
                
                const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
                const zipName = `securecloud-backup-${timestamp} (${downloadedFiles.length} files).zip`;
                
                await downloadFilesAsZip(downloadedFiles, zipName, (completed, total, fileName) => {
                    setProgress(prev => ({
                        ...prev,
                        currentFile: `Zipping: ${fileName}`,
                        zipProgress: Math.round((completed / total) * 100)
                    }));
                });
                
                let summaryMessage = `✅ Downloaded ${successCount} files`;
                if (failCount > 0) {
                    summaryMessage += `, ❌ ${failCount} failed`;
                }
                
                toast.success(
                    <div>
                        <strong>Download Complete!</strong>
                        <div className="text-xs mt-1">
                            {summaryMessage} • {formatFileSize(totalDownloadedSize)}
                        </div>
                        {failedFiles.length > 0 && (
                            <div className="text-xs mt-2 text-red-600 max-h-32 overflow-auto">
                                Failed: {failedFiles.slice(0, 5).map(f => f.name).join(', ')}
                                {failedFiles.length > 5 && ` +${failedFiles.length - 5} more`}
                            </div>
                        )}
                    </div>,
                    { id: 'batch-progress', duration: 8000 }
                );
            } catch (zipError) {
                console.error('Failed to create ZIP:', zipError);
                toast.error('Failed to create ZIP archive', { id: 'batch-progress' });
            }
        } else if (downloadedFiles.length === 0 && !paused) {
            toast.error('No files were successfully downloaded. Please check your connection and try again.', { duration: 5000 });
        }

        setDownloading(false);
        setPaused(false);
        setProgress({ current: 0, total: 0, currentFile: '', downloadedSize: 0, totalSize: 0, percentage: 0 });
    };

    const togglePause = () => {
        setPaused(!paused);
        if (!paused) {
            toast('Download paused', { icon: '⏸️' });
        } else {
            toast('Download resumed', { icon: '▶️' });
            handleBatchDownload();
        }
    };

    const cancelDownload = () => {
        if (window.confirm('Cancel download? Progress will be lost.')) {
            setDownloading(false);
            setPaused(false);
            toast('Download cancelled', { icon: '❌' });
        }
    };

    const toggleFileSelection = (fileId) => {
        const newSelection = new Set(selectedFiles);
        if (newSelection.has(fileId)) {
            newSelection.delete(fileId);
        } else {
            newSelection.add(fileId);
        }
        setSelectedFiles(newSelection);
    };

    const toggleSelectAll = () => {
        if (selectAll) {
            setSelectedFiles(new Set());
        } else {
            const allSelected = new Set(filteredFiles.map(f => f.id));
            setSelectedFiles(allSelected);
        }
    };

    const formatFileSize = (bytes) => {
        if (!bytes || bytes === 0) return '0 B';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    };

    const getTotalSize = () => {
        const selected = files.filter(f => selectedFiles.has(f.id));
        const totalBytes = selected.reduce((sum, f) => sum + (f.fileSize || f.size), 0);
        return formatFileSize(totalBytes);
    };

    const getSelectedCount = () => {
        return files.filter(f => selectedFiles.has(f.id)).length;
    };

    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentFiles = filteredFiles.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredFiles.length / itemsPerPage);

    const paginate = (pageNumber) => setCurrentPage(pageNumber);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-800 flex items-center">
                        <FaDownload className="mr-2 text-blue-600" />
                        Batch Download
                        <span className="ml-3 text-sm font-normal text-gray-500">
                            {fileCount} files available
                        </span>
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                        disabled={downloading}
                    >
                        <FaTimes />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-auto p-6">
                    {loading ? (
                        <div className="text-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-4 text-gray-600">Loading your files from Google Drive...</p>
                        </div>
                    ) : files.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <FaFile className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                            <p>No encrypted files found</p>
                        </div>
                    ) : (
                        <>
                            {/* Search Bar */}
                            <div className="mb-4">
                                <div className="relative">
                                    <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Search files..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        disabled={downloading}
                                    />
                                </div>
                            </div>

                            {/* Selection Controls */}
                            <div className="mb-4 flex justify-between items-center flex-wrap gap-2">
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        checked={selectAll && filteredFiles.length > 0}
                                        onChange={toggleSelectAll}
                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        disabled={downloading || filteredFiles.length === 0}
                                    />
                                    <span className="text-sm text-gray-700">
                                        Select All ({filteredFiles.length} files)
                                    </span>
                                </label>
                                <div className="text-sm text-gray-500">
                                    Selected: {getSelectedCount()} files • Total size: {getTotalSize()}
                                </div>
                            </div>

                            {/* File List */}
                            <div className="space-y-2 max-h-[350px] overflow-auto border border-gray-200 rounded-lg p-2">
                                {currentFiles.map((file) => (
                                    <div
                                        key={file.id}
                                        className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                                            completedFiles.includes(file.name) 
                                                ? 'bg-green-50 border border-green-200' 
                                                : failedFiles.some(f => f.name === file.name)
                                                    ? 'bg-red-50 border border-red-200'
                                                    : 'bg-gray-50 hover:bg-gray-100'
                                        }`}
                                    >
                                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                                            <input
                                                type="checkbox"
                                                checked={selectedFiles.has(file.id)}
                                                onChange={() => toggleFileSelection(file.id)}
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                                                disabled={downloading}
                                            />
                                            {completedFiles.includes(file.name) ? (
                                                <FaCheckCircle className="text-green-500 flex-shrink-0" />
                                            ) : failedFiles.some(f => f.name === file.name) ? (
                                                <FaExclamationTriangle className="text-red-500 flex-shrink-0" />
                                            ) : (
                                                <FaFile className="text-gray-400 flex-shrink-0" />
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-800 truncate">
                                                    {file.name}
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    {formatFileSize(file.fileSize || file.size)} • 
                                                    {new Date(file.modifiedTime).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Pagination */}
                            {totalPages > 1 && !downloading && (
                                <div className="flex justify-center items-center space-x-2 mt-4">
                                    <button
                                        onClick={() => paginate(currentPage - 1)}
                                        disabled={currentPage === 1}
                                        className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                                    >
                                        Previous
                                    </button>
                                    <span className="text-sm text-gray-600">
                                        Page {currentPage} of {totalPages}
                                    </span>
                                    <button
                                        onClick={() => paginate(currentPage + 1)}
                                        disabled={currentPage === totalPages}
                                        className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                                    >
                                        Next
                                    </button>
                                </div>
                            )}

                            {/* Progress Section */}
                            {downloading && progress.total > 0 && (
                                <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                                    <div className="mb-2">
                                        <div className="flex justify-between text-sm text-gray-600 mb-1">
                                            <span className="truncate flex-1">📁 {progress.currentFile}</span>
                                            <span className="ml-2 font-medium">{progress.current}/{progress.total}</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                            <div
                                                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                                style={{ width: `${(progress.current / progress.total) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                    
                                    <div className="flex justify-between text-xs text-gray-500 mb-2">
                                        <span>Downloaded: {progress.downloadedSize || '0 B'}</span>
                                        <span>Total: {progress.totalSize || 'calculating...'}</span>
                                        <span>{progress.percentage || 0}%</span>
                                    </div>
                                    
                                    {/* Control buttons */}
                                    <div className="flex justify-center space-x-3 mt-3">
                                        <button
                                            onClick={togglePause}
                                            className="px-3 py-1 text-sm bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 flex items-center"
                                        >
                                            {paused ? <FaPlay className="mr-1" /> : <FaPause className="mr-1" />}
                                            {paused ? 'Resume' : 'Pause'}
                                        </button>
                                        <button
                                            onClick={cancelDownload}
                                            className="px-3 py-1 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center"
                                        >
                                            <FaStop className="mr-1" />
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Failed files list */}
                            {failedFiles.length > 0 && !downloading && (
                                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                                    <p className="text-sm font-medium text-red-700 mb-2">Failed downloads ({failedFiles.length}):</p>
                                    <div className="max-h-24 overflow-auto">
                                        {failedFiles.map((file, idx) => (
                                            <p key={idx} className="text-xs text-red-600 truncate">• {file.name}: {file.error}</p>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-between items-center p-6 border-t border-gray-200">
                    <div className="text-xs text-gray-500">
                        {!loading && files.length > 0 && !downloading && (
                            <span>💾 Files are downloaded in batches and saved as a ZIP archive</span>
                        )}
                    </div>
                    <div className="flex space-x-3">
                        <button
                            onClick={onClose}
                            disabled={downloading}
                            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleBatchDownload}
                            disabled={loading || downloading || getSelectedCount() === 0}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                        >
                            {downloading ? (
                                <>
                                    <FaSpinner className="animate-spin mr-2" />
                                    Downloading...
                                </>
                            ) : (
                                <>
                                    <FaDownload className="mr-2" />
                                    Download {getSelectedCount()} File(s)
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BatchDownloadModal;