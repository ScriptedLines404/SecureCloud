/**
 * SecureCloud - Test File Generator for Performance Testing
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
 * Generate test files of specific sizes for performance testing
 */
export function generateTestFile(sizeBytes, fileName = null) {
    const name = fileName || `test-${formatFileSize(sizeBytes)}.bin`;
    
    // For large files, generate in chunks to avoid memory issues
    if (sizeBytes > 50 * 1024 * 1024) {
        console.log(`⚠️ Generating large test file (${formatFileSize(sizeBytes)}) - this may take a moment...`);
    }
    
    const blob = new Blob([new Uint8Array(sizeBytes)], { type: 'application/octet-stream' });
    const file = new File([blob], name, { type: 'application/octet-stream' });
    
    console.log(`✅ Generated test file: ${name} (${formatFileSize(sizeBytes)})`);
    return file;
}

export function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)}MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

export const TEST_SIZES = [
    { name: '1KB', bytes: 1 * 1024 },
    { name: '50KB', bytes: 50 * 1024 },
    { name: '100KB', bytes: 100 * 1024 },
    { name: '200KB', bytes: 200 * 1024 },
    { name: '500KB', bytes: 500 * 1024 },
    { name: '1MB', bytes: 1024 * 1024 },
    { name: '5MB', bytes: 5 * 1024 * 1024 },
    { name: '10MB', bytes: 10 * 1024 * 1024 },
    { name: '20MB', bytes: 20 * 1024 * 1024 },
    { name: '50MB', bytes: 50 * 1024 * 1024 },
    { name: '100MB', bytes: 100 * 1024 * 1024 }
];

/**
 * Generate all test files (use with caution - will use significant memory)
 */
export function generateAllTestFiles() {
    return TEST_SIZES.map(size => generateTestFile(size.bytes, `test-${size.name}.bin`));
}

/**
 * Run a complete performance test suite
 */
export async function runPerformanceTestSuite(uploadCallback, downloadCallback) {
    const results = [];
    
    console.log('\n🚀 Starting Performance Test Suite');
    console.log('='.repeat(60));
    
    for (const size of TEST_SIZES) {
        console.log(`\n📊 Testing ${size.name}...`);
        
        const testFile = generateTestFile(size.bytes);
        
        // Test upload
        const uploadStart = performance.now();
        try {
            const uploadResult = await uploadCallback(testFile);
            const uploadDuration = performance.now() - uploadStart;
            const uploadThroughput = size.bytes / (uploadDuration / 1000);
            
            results.push({
                size: size.name,
                bytes: size.bytes,
                uploadMs: uploadDuration,
                uploadThroughputMBps: uploadThroughput / (1024 * 1024)
            });
            
            console.log(`   ✅ Upload: ${uploadDuration.toFixed(2)}ms (${(uploadThroughput / (1024 * 1024)).toFixed(2)} MB/s)`);
            
            // Test download if we have a file ID
            if (uploadResult && uploadResult.fileId) {
                const downloadStart = performance.now();
                await downloadCallback(uploadResult.fileId);
                const downloadDuration = performance.now() - downloadStart;
                const downloadThroughput = size.bytes / (downloadDuration / 1000);
                
                results[results.length - 1].downloadMs = downloadDuration;
                results[results.length - 1].downloadThroughputMBps = downloadThroughput / (1024 * 1024);
                
                console.log(`   ✅ Download: ${downloadDuration.toFixed(2)}ms (${(downloadThroughput / (1024 * 1024)).toFixed(2)} MB/s)`);
            }
        } catch (error) {
            console.error(`   ❌ Test failed for ${size.name}:`, error.message);
            results.push({
                size: size.name,
                bytes: size.bytes,
                error: error.message
            });
        }
    }
    
    console.log('\n📊 Performance Test Results:');
    console.table(results);
    
    return results;
}