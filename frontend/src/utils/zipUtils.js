// frontend/src/utils/zipUtils.js
/**
 * SecureCloud - ZIP Utilities for Batch Download
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

/**
 * Create a ZIP file from multiple blobs
 * Uses JSZip library for ZIP compression
 */
export async function createZipFile(files, zipName = 'securecloud-backup.zip') {
    // Dynamic import of JSZip (load only when needed)
    const JSZip = (await import('https://cdn.skypack.dev/jszip')).default;
    
    const zip = new JSZip();
    
    for (const file of files) {
        // Add file to zip with original filename
        zip.file(file.name, file.blob);
    }
    
    // Generate the zip file
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    
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
}

/**
 * Download multiple files as a ZIP archive
 */
export async function downloadFilesAsZip(files, progressCallback = null) {
    const JSZip = (await import('https://cdn.skypack.dev/jszip')).default;
    const zip = new JSZip();
    
    let completed = 0;
    const total = files.length;
    
    for (const file of files) {
        zip.file(file.name, file.blob);
        completed++;
        
        if (progressCallback) {
            progressCallback(completed, total, file.name);
        }
    }
    
    // Generate zip with progress tracking
    const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
    });
    
    return zipBlob;
}