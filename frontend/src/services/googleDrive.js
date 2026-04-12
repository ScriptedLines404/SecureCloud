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

import { perfMetrics } from '../utils/performanceMetrics';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata';

let tokenClient = null;
let accessToken = null;
let driveFolderId = null;
let gapiInited = false;
let gisInited = false;

// User-specific storage key prefixes
const TOKEN_STORAGE_KEY_PREFIX = 'google_drive_token_';
const TOKEN_EXPIRY_KEY_PREFIX = 'google_drive_token_expiry_';
const FOLDER_ID_KEY_PREFIX = 'google_drive_folder_id_';

/**
 * Get user-specific storage keys
 */
function getUserKeys() {
    const userId = localStorage.getItem('userId');
    if (!userId) throw new Error('No user logged in');
    return {
        tokenKey: TOKEN_STORAGE_KEY_PREFIX + userId,
        expiryKey: TOKEN_EXPIRY_KEY_PREFIX + userId,
        folderKey: FOLDER_ID_KEY_PREFIX + userId
    };
}

/**
 * Save token to localStorage with expiry
 */
function saveToken(token, expiresIn = 3600) {
    try {
        const { tokenKey, expiryKey } = getUserKeys();
        const expiryTime = Date.now() + (expiresIn * 1000);
        localStorage.setItem(tokenKey, token);
        localStorage.setItem(expiryKey, expiryTime.toString());
        accessToken = token;
        console.log('✅ Google Drive token saved, expires in', expiresIn, 'seconds');
    } catch (error) {
        console.error('Failed to save token:', error);
    }
}

/**
 * Get saved token if still valid
 */
function getSavedToken() {
    try {
        const { tokenKey, expiryKey } = getUserKeys();
        const token = localStorage.getItem(tokenKey);
        const expiry = localStorage.getItem(expiryKey);
        
        if (!token || !expiry) {
            return null;
        }
        
        if (Date.now() > parseInt(expiry) - 300000) {
            console.log('🔄 Saved Google Drive token expired');
            clearToken();
            return null;
        }
        
        console.log('✅ Using saved Google Drive token');
        accessToken = token;
        return token;
    } catch (error) {
        return null;
    }
}

/**
 * Clear saved token and folder ID for current user
 */
function clearToken() {
    try {
        const { tokenKey, expiryKey, folderKey } = getUserKeys();
        localStorage.removeItem(tokenKey);
        localStorage.removeItem(expiryKey);
        localStorage.removeItem(folderKey);
        accessToken = null;
        driveFolderId = null;
    } catch (error) {
        // No user logged in – nothing to clear
    }
}

/**
 * Generate a random filename for encrypted storage
 */
export function generateEncryptedFilename() {
    return crypto.randomUUID() + '.enc';
}

/**
 * Initialize Google API - Fixed version with proper error handling
 */
export async function initGoogleDrive() {
    return new Promise((resolve, reject) => {
        // Check if already initialized
        if (gapiInited && gisInited) {
            console.log('✅ Google Drive already initialized');
            resolve(true);
            return;
        }

        // Check if credentials are configured
        if (!GOOGLE_CLIENT_ID || !GOOGLE_API_KEY) {
            console.error('❌ Google Drive credentials not configured');
            console.error('Please set VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_API_KEY in .env');
            reject(new Error('Google Drive credentials not configured'));
            return;
        }

        console.log('🔧 Initializing Google Drive with Client ID:', GOOGLE_CLIENT_ID.substring(0, 20) + '...');

        // Load Google Identity Services script
        if (!document.querySelector('script[src="https://accounts.google.com/gsi/client"]')) {
            const gisScript = document.createElement('script');
            gisScript.src = 'https://accounts.google.com/gsi/client';
            gisScript.async = true;
            gisScript.defer = true;
            gisScript.onload = () => {
                console.log('✅ Google Identity Services loaded');
                gisInited = true;
                checkBothLoaded(resolve, reject);
            };
            gisScript.onerror = () => {
                console.error('❌ Failed to load Google Identity Services');
                reject(new Error('Failed to load Google Identity Services'));
            };
            document.body.appendChild(gisScript);
        } else {
            gisInited = true;
        }

        // Load Google API client script
        if (!document.querySelector('script[src="https://apis.google.com/js/api.js"]')) {
            const gapiScript = document.createElement('script');
            gapiScript.src = 'https://apis.google.com/js/api.js';
            gapiScript.async = true;
            gapiScript.defer = true;
            gapiScript.onload = () => {
                console.log('✅ Google API client loaded');
                initGapiClient(resolve, reject);
            };
            gapiScript.onerror = () => {
                console.error('❌ Failed to load Google API client');
                reject(new Error('Failed to load Google API client'));
            };
            document.body.appendChild(gapiScript);
        } else {
            initGapiClient(resolve, reject);
        }
    });
}

function initGapiClient(resolve, reject) {
    window.gapi.load('client', async () => {
        try {
            await window.gapi.client.init({
                apiKey: GOOGLE_API_KEY,
                discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
            });
            
            // Initialize token client
            tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CLIENT_ID,
                scope: SCOPES,
                callback: (response) => {
                    if (response.access_token) {
                        saveToken(response.access_token, response.expires_in || 3600);
                        window.gapi.client.setToken({ access_token: response.access_token });
                        console.log('✅ Google Drive authenticated');
                        resolve(true);
                    } else {
                        console.error('❌ Failed to get access token');
                        reject(new Error('Failed to get access token'));
                    }
                },
            });
            
            gapiInited = true;
            console.log('✅ GAPI client initialized');
            
            // Try to restore saved token
            const savedToken = getSavedToken();
            if (savedToken) {
                window.gapi.client.setToken({ access_token: savedToken });
                console.log('✅ Restored saved Google Drive token');
                resolve(true);
            }
            
            checkBothLoaded(resolve, reject);
        } catch (error) {
            console.error('❌ GAPI client init error:', error);
            reject(error);
        }
    });
}

function checkBothLoaded(resolve, reject) {
    if (gapiInited && gisInited) {
        console.log('✅ Both Google APIs loaded');
        resolve(true);
    }
}

/**
 * Get or create app folder in Google Drive
 */
async function getOrCreateAppFolder() {
    try {
        const { folderKey } = getUserKeys();
        
        const savedFolderId = localStorage.getItem(folderKey);
        if (savedFolderId) {
            try {
                await window.gapi.client.drive.files.get({
                    fileId: savedFolderId,
                    fields: 'id,name'
                });
                driveFolderId = savedFolderId;
                return savedFolderId;
            } catch (e) {
                console.log('Saved folder not found, creating new one');
                localStorage.removeItem(folderKey);
            }
        }

        const response = await window.gapi.client.drive.files.list({
            q: "name='SecureCloudStorage' and mimeType='application/vnd.google-apps.folder' and trashed=false",
            fields: 'files(id,name)',
            spaces: 'drive'
        });

        if (response.result.files && response.result.files.length > 0) {
            driveFolderId = response.result.files[0].id;
        } else {
            const folderMetadata = {
                name: 'SecureCloudStorage',
                mimeType: 'application/vnd.google-apps.folder'
            };
            
            const folderResponse = await window.gapi.client.drive.files.create({
                resource: folderMetadata,
                fields: 'id'
            });
            
            driveFolderId = folderResponse.result.id;
        }

        localStorage.setItem(folderKey, driveFolderId);
        console.log('📁 Using Google Drive folder:', driveFolderId);
        return driveFolderId;
        
    } catch (error) {
        console.error('Failed to get/create app folder:', error);
        throw error;
    }
}

/**
 * Authenticate with Google Drive
 */
export async function authenticateGoogleDrive() {
    return new Promise((resolve, reject) => {
        if (!tokenClient) {
            console.error('Token client not initialized');
            reject(new Error('Google Drive not initialized. Please refresh the page.'));
            return;
        }

        const savedToken = getSavedToken();
        if (savedToken) {
            window.gapi.client.setToken({ access_token: savedToken });
            console.log('✅ Using saved token');
            resolve(true);
            return;
        }

        console.log('🔐 Requesting Google Drive access...');
        tokenClient.callback = async (response) => {
            if (response.access_token) {
                saveToken(response.access_token, response.expires_in || 3600);
                window.gapi.client.setToken({ access_token: response.access_token });
                
                try {
                    await getOrCreateAppFolder();
                } catch (folderError) {
                    console.warn('Folder setup warning:', folderError);
                }
                
                console.log('✅ Google Drive authentication successful');
                resolve(true);
            } else {
                console.error('❌ Authentication failed:', response);
                reject(new Error(response.error || 'Authentication failed'));
            }
        };

        tokenClient.requestAccessToken({ prompt: 'consent' });
    });
}

/**
 * Upload encrypted file to Google Drive with timing measurement
 */
export async function uploadToGoogleDrive(encryptedFileData, originalFileName, mimeType = 'application/octet-stream') {
    const startTime = performance.now();
    const fileSize = encryptedFileData.byteLength;
    
    console.log(`📤 Uploading encrypted file to Google Drive (${(fileSize / (1024 * 1024)).toFixed(2)} MB)`);
    
    try {
        const savedToken = getSavedToken();
        if (!savedToken) {
            await authenticateGoogleDrive();
        } else if (!accessToken) {
            accessToken = savedToken;
            window.gapi.client.setToken({ access_token: accessToken });
        }

        const folderId = await getOrCreateAppFolder();

        const encryptedFileName = generateEncryptedFilename();
        console.log(`🔐 Original filename: ${originalFileName}`);
        console.log(`🔒 Encrypted filename: ${encryptedFileName}`);

        const fileMetadata = {
            name: encryptedFileName,
            mimeType: mimeType,
            parents: [folderId]
        };

        const boundary = '-------' + crypto.randomUUID();
        const delimiter = "\r\n--" + boundary + "\r\n";
        const closeDelim = "\r\n--" + boundary + "--";

        const multipartRequestBody =
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            JSON.stringify(fileMetadata) +
            delimiter +
            'Content-Type: ' + mimeType + '\r\n' +
            'Content-Transfer-Encoding: base64\r\n\r\n' +
            arrayBufferToBase64(encryptedFileData) +
            closeDelim;

        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`
            },
            body: multipartRequestBody
        });

        const result = await response.json();
        const duration = performance.now() - startTime;

        if (response.ok) {
            const throughput = fileSize / (duration / 1000);
            
            console.log(`✅ File uploaded successfully in ${duration.toFixed(2)}ms`);
            console.log(`📊 Upload throughput: ${(throughput / (1024 * 1024)).toFixed(2)} MB/s`);
            
            // Track performance metrics
            if (window.perfMetrics) {
                window.perfMetrics.measureGoogleDriveUpload(fileSize, duration, 'success', {
                    fileName: originalFileName,
                    throughput: throughput / (1024 * 1024)
                });
            }
            
            return {
                ...result,
                encryptedFileName: encryptedFileName,
                originalFileName: originalFileName,
                performance: { duration, throughput, fileSize }
            };
        } else {
            if (response.status === 401) {
                console.log('🔄 Token expired, re-authenticating...');
                clearToken();
                return await uploadToGoogleDrive(encryptedFileData, originalFileName, mimeType);
            }
            
            console.error('❌ Upload failed:', result);
            throw new Error(result.error?.message || 'Upload failed');
        }
    } catch (error) {
        const duration = performance.now() - startTime;
        console.error(`❌ Google Drive upload error after ${duration.toFixed(2)}ms:`, error);
        
        if (window.perfMetrics) {
            window.perfMetrics.measureGoogleDriveUpload(fileSize, duration, 'error', {
                error: error.message
            });
            window.perfMetrics.trackError('googleDriveUpload', error.message);
        }
        throw error;
    }
}

/**
 * Download encrypted file from Google Drive with timing measurement
 */
export async function downloadFromGoogleDrive(fileId) {
    const startTime = performance.now();
    
    try {
        console.log(`📥 Downloading from Google Drive: ${fileId}`);

        const savedToken = getSavedToken();
        if (!savedToken) {
            await authenticateGoogleDrive();
        } else if (!accessToken) {
            accessToken = savedToken;
            window.gapi.client.setToken({ access_token: accessToken });
        }

        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                console.log('🔄 Token expired, re-authenticating...');
                clearToken();
                return await downloadFromGoogleDrive(fileId);
            }
            throw new Error(`Download failed: ${response.status}`);
        }

        const encryptedData = await response.arrayBuffer();
        const duration = performance.now() - startTime;
        const fileSize = encryptedData.byteLength;
        const throughput = fileSize / (duration / 1000);
        
        console.log(`✅ File downloaded successfully in ${duration.toFixed(2)}ms`);
        console.log(`📊 Download throughput: ${(throughput / (1024 * 1024)).toFixed(2)} MB/s`);
        
        // Track performance metrics
        if (window.perfMetrics) {
            window.perfMetrics.measureGoogleDriveDownload(fileSize, duration, 'success', {
                fileId,
                throughput: throughput / (1024 * 1024)
            });
        }
        
        return new Uint8Array(encryptedData);
    } catch (error) {
        const duration = performance.now() - startTime;
        console.error(`❌ Google Drive download error after ${duration.toFixed(2)}ms:`, error);
        
        if (window.perfMetrics) {
            window.perfMetrics.measureGoogleDriveDownload(0, duration, 'error', {
                fileId,
                error: error.message
            });
            window.perfMetrics.trackError('googleDriveDownload', error.message);
        }
        throw error;
    }
}

/**
 * List user's encrypted files
 */
export async function listUserFiles() {
    try {
        const savedToken = getSavedToken();
        if (!savedToken) {
            await authenticateGoogleDrive();
        } else if (!accessToken) {
            accessToken = savedToken;
            window.gapi.client.setToken({ access_token: accessToken });
        }

        const folderId = await getOrCreateAppFolder();

        const response = await window.gapi.client.drive.files.list({
            q: `'${folderId}' in parents and trashed=false`,
            pageSize: 100,
            fields: 'files(id, name, size, createdTime, modifiedTime, mimeType)',
            orderBy: 'modifiedTime desc',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
        });

        return response.result.files || [];
    } catch (error) {
        console.error('❌ Failed to list files:', error);
        throw error;
    }
}

/**
 * Delete file from Google Drive
 */
export async function deleteFromGoogleDrive(fileId) {
    try {
        const savedToken = getSavedToken();
        if (!savedToken) {
            await authenticateGoogleDrive();
        } else if (!accessToken) {
            accessToken = savedToken;
            window.gapi.client.setToken({ access_token: accessToken });
        }

        await window.gapi.client.drive.files.delete({
            fileId: fileId,
            supportsAllDrives: true
        });

        console.log(`✅ File deleted successfully: ${fileId}`);
        return true;
    } catch (error) {
        console.error('❌ Failed to delete file:', error);
        throw error;
    }
}

/**
 * Check if user is connected to Google Drive
 */
export function isGoogleDriveConnected() {
    return !!getSavedToken();
}

/**
 * Disconnect from Google Drive
 */
export function disconnectGoogleDrive() {
    clearToken();
    if (window.gapi?.client) {
        window.gapi.client.setToken(null);
    }
}

// Helper function to convert ArrayBuffer to base64
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}