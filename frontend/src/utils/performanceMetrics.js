/**
 * SecureCloud - Zero-Knowledge Encrypted File Encryptor for Cloud Storage
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

class PerformanceMetrics {
    constructor() {
        // Your specific test sizes
        this.testSizes = [
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

        // Create size categories based on your test sizes
        this.sizeCategories = {};
        this.testSizes.forEach(size => {
            this.sizeCategories[size.name] = {
                bytes: size.bytes,
                name: size.name,
                displayName: size.name
            };
        });

        this.metrics = {
            // Authentication metrics
            opaque: {
                registration: [],
                login: [],
                keyDerivation: []
            },
            
            // Encryption metrics with separate upload/download tracking
            encryption: {
                fileEncryption: [],      // Time to encrypt file
                fileDecryption: [],      // Time to decrypt file
                keyGeneration: [],
                keyWrapping: [],
                keyUnwrapping: [],
                bySize: this.initializeSizeCategories()
            },
            
            // Network metrics with separate upload/download tracking
            network: {
                apiCalls: [],
                googleDriveUpload: [],    // Time to upload to Google Drive
                googleDriveDownload: [],  // Time to download from Google Drive
                shareLinkGeneration: [],
                bySize: this.initializeSizeCategories()
            },
            
            // Transfer metrics (combined view)
            transfer: {
                totalUpload: [],          // Encryption + Upload combined
                totalDownload: [],        // Download + Decryption combined
                bySize: this.initializeSizeCategories()
            },
            
            // Sharing metrics
            sharing: {
                publicShareCreation: [],
                privateShareCreation: [],
                shareVerification: [],
                shareAccess: []
            },
            
            // Memory metrics
            memory: {
                heapUsage: [],
                keyStorageSize: [],
                garbageCollection: []
            },
            
            // System metrics
            system: {
                totalOperations: 0,
                errorCount: 0,
                errors: []
            }
        };
        
        this.sessionId = this.generateSessionId();
        this.startTime = Date.now();
        this.errorCount = 0;
        this.totalOps = 0;
        this.memoryInterval = null;
        
        // Monitor memory if available
        this.startMemoryMonitoring();
    }
    
    initializeSizeCategories() {
        const categories = {};
        this.testSizes.forEach(size => {
            categories[size.name] = [];
        });
        return categories;
    }
    
    generateSessionId() {
        return `perf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    startMemoryMonitoring() {
        if (performance && performance.memory) {
            this.memoryInterval = setInterval(() => {
                try {
                    const memory = performance.memory;
                    this.metrics.memory.heapUsage.push({
                        usedJSHeapSize: memory.usedJSHeapSize,
                        totalJSHeapSize: memory.totalJSHeapSize,
                        jsHeapSizeLimit: memory.jsHeapSizeLimit,
                        timestamp: Date.now(),
                        sessionId: this.sessionId,
                        formattedUsed: this.formatFileSize(memory.usedJSHeapSize),
                        formattedTotal: this.formatFileSize(memory.totalJSHeapSize)
                    });
                    
                    if (this.metrics.memory.heapUsage.length > 100) {
                        this.metrics.memory.heapUsage = this.metrics.memory.heapUsage.slice(-100);
                    }
                } catch (error) {
                    // Silently fail if memory monitoring fails
                }
            }, 10000);
        }
    }
    
    categorizeFileSize(bytes) {
        for (const size of this.testSizes) {
            const tolerance = size.bytes * 0.05;
            if (Math.abs(bytes - size.bytes) <= tolerance) {
                return size.name;
            }
        }
        
        for (let i = 0; i < this.testSizes.length; i++) {
            const current = this.testSizes[i];
            const next = this.testSizes[i + 1];
            
            if (!next) {
                if (bytes > current.bytes) {
                    return `${current.name}+`;
                }
            } else if (bytes >= current.bytes && bytes < next.bytes) {
                return `${current.name}-${next.name}`;
            }
        }
        
        return 'unknown';
    }
    
    getExactTestSize(bytes) {
        for (const size of this.testSizes) {
            const tolerance = size.bytes * 0.05;
            if (Math.abs(bytes - size.bytes) <= tolerance) {
                return size.name;
            }
        }
        return null;
    }
    
    getSizeCategoryName(category) {
        if (this.sizeCategories[category]) {
            return this.sizeCategories[category].displayName;
        }
        return category;
    }
    
    formatFileSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    
    startTimer(operation) {
        const timerId = `${operation}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        if (performance && performance.mark) {
            try {
                performance.mark(`${timerId}-start`);
            } catch (error) {
                // Ignore performance mark errors
            }
        }
        return timerId;
    }
    
    endTimer(timerId, category, subCategory, metadata = {}) {
        try {
            let duration = null;
            
            if (performance && performance.mark && performance.measure && performance.getEntriesByName) {
                try {
                    performance.mark(`${timerId}-end`);
                    performance.measure(timerId, `${timerId}-start`, `${timerId}-end`);
                    
                    const entries = performance.getEntriesByName(timerId);
                    if (entries && entries.length > 0) {
                        duration = entries[0].duration;
                    }
                    
                    performance.clearMarks(`${timerId}-start`);
                    performance.clearMarks(`${timerId}-end`);
                    performance.clearMeasures(timerId);
                } catch (error) {
                    duration = metadata.fallbackDuration || null;
                }
            }
            
            if (duration !== null) {
                const metric = {
                    duration,
                    timestamp: Date.now(),
                    sessionId: this.sessionId,
                    ...metadata
                };
                
                if (metadata.fileSize) {
                    metric.formattedSize = this.formatFileSize(metadata.fileSize);
                    metric.sizeCategory = this.categorizeFileSize(metadata.fileSize);
                    metric.exactTestSize = this.getExactTestSize(metadata.fileSize);
                }
                
                if (!this.metrics[category]) {
                    this.metrics[category] = {};
                }
                
                if (!this.metrics[category][subCategory]) {
                    this.metrics[category][subCategory] = [];
                }
                
                this.metrics[category][subCategory].push(metric);
                
                if (metadata.fileSize && metric.exactTestSize && this.metrics[category].bySize) {
                    const sizeCat = metric.exactTestSize;
                    if (this.metrics[category].bySize[sizeCat]) {
                        this.metrics[category].bySize[sizeCat].push(metric);
                    }
                }
                
                this.totalOps++;
                
                if (this.metrics[category][subCategory].length > 200) {
                    this.metrics[category][subCategory] = this.metrics[category][subCategory].slice(-200);
                }
                
                if (metadata.fileSize && metric.exactTestSize && this.metrics[category].bySize) {
                    const sizeCat = metric.exactTestSize;
                    if (this.metrics[category].bySize[sizeCat] && 
                        this.metrics[category].bySize[sizeCat].length > 100) {
                        this.metrics[category].bySize[sizeCat] = this.metrics[category].bySize[sizeCat].slice(-100);
                    }
                }
                
                return duration;
            }
        } catch (error) {
            console.warn('Performance measurement error:', error);
        }
        return null;
    }
    
    /**
     * Measure file encryption - tracks encryption time only
     */
    measureFileEncryption(fileSize, startTime, endTime, algorithm = 'AES-GCM-256') {
        const duration = endTime - startTime;
        const throughput = fileSize / (duration / 1000);
        const sizeCategory = this.categorizeFileSize(fileSize);
        const exactTestSize = this.getExactTestSize(fileSize);
        
        const metric = {
            duration,
            fileSize,
            formattedSize: this.formatFileSize(fileSize),
            sizeCategory,
            exactTestSize,
            throughput,
            throughputMBps: throughput / (1024 * 1024),
            algorithm,
            operation: 'encrypt',
            timestamp: Date.now(),
            sessionId: this.sessionId
        };
        
        this.metrics.encryption.fileEncryption.push(metric);
        
        if (exactTestSize && this.metrics.encryption.bySize[exactTestSize]) {
            this.metrics.encryption.bySize[exactTestSize].push(metric);
        }
        
        if (this.metrics.encryption.fileEncryption.length > 200) {
            this.metrics.encryption.fileEncryption = this.metrics.encryption.fileEncryption.slice(-200);
        }
        
        if (exactTestSize && this.metrics.encryption.bySize[exactTestSize] && 
            this.metrics.encryption.bySize[exactTestSize].length > 100) {
            this.metrics.encryption.bySize[exactTestSize] = this.metrics.encryption.bySize[exactTestSize].slice(-100);
        }
        
        this.totalOps++;
        
        console.log(`🔐 ENCRYPT: ${(fileSize / (1024 * 1024)).toFixed(2)}MB in ${duration.toFixed(2)}ms @ ${(throughput / (1024 * 1024)).toFixed(2)} MB/s`);
        
        return { duration, throughput, sizeCategory, exactTestSize };
    }
    
    /**
     * Measure file decryption - tracks decryption time only
     */
    measureFileDecryption(fileSize, startTime, endTime, algorithm = 'AES-GCM-256') {
        const duration = endTime - startTime;
        const throughput = fileSize / (duration / 1000);
        const sizeCategory = this.categorizeFileSize(fileSize);
        const exactTestSize = this.getExactTestSize(fileSize);
        
        const metric = {
            duration,
            fileSize,
            formattedSize: this.formatFileSize(fileSize),
            sizeCategory,
            exactTestSize,
            throughput,
            throughputMBps: throughput / (1024 * 1024),
            algorithm,
            operation: 'decrypt',
            timestamp: Date.now(),
            sessionId: this.sessionId
        };
        
        this.metrics.encryption.fileDecryption.push(metric);
        
        if (exactTestSize && this.metrics.encryption.bySize[exactTestSize]) {
            this.metrics.encryption.bySize[exactTestSize].push(metric);
        }
        
        if (this.metrics.encryption.fileDecryption.length > 200) {
            this.metrics.encryption.fileDecryption = this.metrics.encryption.fileDecryption.slice(-200);
        }
        
        if (exactTestSize && this.metrics.encryption.bySize[exactTestSize] && 
            this.metrics.encryption.bySize[exactTestSize].length > 100) {
            this.metrics.encryption.bySize[exactTestSize] = this.metrics.encryption.bySize[exactTestSize].slice(-100);
        }
        
        this.totalOps++;
        
        console.log(`🔓 DECRYPT: ${(fileSize / (1024 * 1024)).toFixed(2)}MB in ${duration.toFixed(2)}ms @ ${(throughput / (1024 * 1024)).toFixed(2)} MB/s`);
        
        return { duration, throughput, sizeCategory, exactTestSize };
    }
    
    /**
     * Measure complete file upload - encryption + upload combined
     */
    measureCompleteUpload(fileSize, encryptDuration, uploadDuration, metadata = {}) {
        const totalDuration = encryptDuration + uploadDuration;
        const totalThroughput = fileSize / (totalDuration / 1000);
        const exactTestSize = this.getExactTestSize(fileSize);
        
        const metric = {
            fileSize,
            formattedSize: this.formatFileSize(fileSize),
            exactTestSize,
            encryptMs: encryptDuration,
            uploadMs: uploadDuration,
            totalMs: totalDuration,
            encryptThroughputMBps: (fileSize / (encryptDuration / 1000)) / (1024 * 1024),
            uploadThroughputMBps: (fileSize / (uploadDuration / 1000)) / (1024 * 1024),
            totalThroughputMBps: totalThroughput / (1024 * 1024),
            timestamp: Date.now(),
            sessionId: this.sessionId,
            ...metadata
        };
        
        if (!this.metrics.transfer.totalUpload) {
            this.metrics.transfer.totalUpload = [];
        }
        this.metrics.transfer.totalUpload.push(metric);
        
        if (exactTestSize && this.metrics.transfer.bySize[exactTestSize]) {
            this.metrics.transfer.bySize[exactTestSize].push(metric);
        }
        
        console.log(`📤 UPLOAD TOTAL: ${(fileSize / (1024 * 1024)).toFixed(2)}MB in ${totalDuration.toFixed(2)}ms`);
        console.log(`   - Encrypt: ${encryptDuration.toFixed(2)}ms (${metric.encryptThroughputMBps.toFixed(2)} MB/s)`);
        console.log(`   - Upload: ${uploadDuration.toFixed(2)}ms (${metric.uploadThroughputMBps.toFixed(2)} MB/s)`);
        
        return metric;
    }
    
    /**
     * Measure complete file download - download + decryption combined
     */
    measureCompleteDownload(fileSize, downloadDuration, decryptDuration, metadata = {}) {
        const totalDuration = downloadDuration + decryptDuration;
        const totalThroughput = fileSize / (totalDuration / 1000);
        const exactTestSize = this.getExactTestSize(fileSize);
        
        const metric = {
            fileSize,
            formattedSize: this.formatFileSize(fileSize),
            exactTestSize,
            downloadMs: downloadDuration,
            decryptMs: decryptDuration,
            totalMs: totalDuration,
            downloadThroughputMBps: (fileSize / (downloadDuration / 1000)) / (1024 * 1024),
            decryptThroughputMBps: (fileSize / (decryptDuration / 1000)) / (1024 * 1024),
            totalThroughputMBps: totalThroughput / (1024 * 1024),
            timestamp: Date.now(),
            sessionId: this.sessionId,
            ...metadata
        };
        
        if (!this.metrics.transfer.totalDownload) {
            this.metrics.transfer.totalDownload = [];
        }
        this.metrics.transfer.totalDownload.push(metric);
        
        if (exactTestSize && this.metrics.transfer.bySize[exactTestSize]) {
            this.metrics.transfer.bySize[exactTestSize].push(metric);
        }
        
        console.log(`📥 DOWNLOAD TOTAL: ${(fileSize / (1024 * 1024)).toFixed(2)}MB in ${totalDuration.toFixed(2)}ms`);
        console.log(`   - Download: ${downloadDuration.toFixed(2)}ms (${metric.downloadThroughputMBps.toFixed(2)} MB/s)`);
        console.log(`   - Decrypt: ${decryptDuration.toFixed(2)}ms (${metric.decryptThroughputMBps.toFixed(2)} MB/s)`);
        
        return metric;
    }
    
    /**
     * Measure Google Drive upload - tracks upload time only
     */
    measureGoogleDriveUpload(fileSize, duration, status, metadata = {}) {
        const throughput = fileSize / (duration / 1000);
        const sizeCategory = this.categorizeFileSize(fileSize);
        const exactTestSize = this.getExactTestSize(fileSize);
        
        const metric = {
            duration,
            fileSize,
            formattedSize: this.formatFileSize(fileSize),
            sizeCategory,
            exactTestSize,
            throughput,
            throughputMBps: throughput / (1024 * 1024),
            status,
            operation: 'upload',
            timestamp: Date.now(),
            sessionId: this.sessionId,
            ...metadata
        };
        
        this.metrics.network.googleDriveUpload.push(metric);
        
        if (exactTestSize && this.metrics.network.bySize[exactTestSize]) {
            this.metrics.network.bySize[exactTestSize].push(metric);
        }
        
        if (this.metrics.network.googleDriveUpload.length > 200) {
            this.metrics.network.googleDriveUpload = this.metrics.network.googleDriveUpload.slice(-200);
        }
        
        if (exactTestSize && this.metrics.network.bySize[exactTestSize] && 
            this.metrics.network.bySize[exactTestSize].length > 100) {
            this.metrics.network.bySize[exactTestSize] = this.metrics.network.bySize[exactTestSize].slice(-100);
        }
        
        this.totalOps++;
        
        console.log(`☁️ UPLOAD: ${(fileSize / (1024 * 1024)).toFixed(2)}MB in ${duration.toFixed(2)}ms @ ${(throughput / (1024 * 1024)).toFixed(2)} MB/s`);
        
        return { duration, throughput, sizeCategory, exactTestSize };
    }
    
    /**
     * Measure Google Drive download - tracks download time only
     */
    measureGoogleDriveDownload(fileSize, duration, status, metadata = {}) {
        const throughput = fileSize / (duration / 1000);
        const sizeCategory = this.categorizeFileSize(fileSize);
        const exactTestSize = this.getExactTestSize(fileSize);
        
        const metric = {
            duration,
            fileSize,
            formattedSize: this.formatFileSize(fileSize),
            sizeCategory,
            exactTestSize,
            throughput,
            throughputMBps: throughput / (1024 * 1024),
            status,
            operation: 'download',
            timestamp: Date.now(),
            sessionId: this.sessionId,
            ...metadata
        };
        
        this.metrics.network.googleDriveDownload.push(metric);
        
        if (exactTestSize && this.metrics.network.bySize[exactTestSize]) {
            this.metrics.network.bySize[exactTestSize].push(metric);
        }
        
        if (this.metrics.network.googleDriveDownload.length > 200) {
            this.metrics.network.googleDriveDownload = this.metrics.network.googleDriveDownload.slice(-200);
        }
        
        if (exactTestSize && this.metrics.network.bySize[exactTestSize] && 
            this.metrics.network.bySize[exactTestSize].length > 100) {
            this.metrics.network.bySize[exactTestSize] = this.metrics.network.bySize[exactTestSize].slice(-100);
        }
        
        this.totalOps++;
        
        console.log(`☁️ DOWNLOAD: ${(fileSize / (1024 * 1024)).toFixed(2)}MB in ${duration.toFixed(2)}ms @ ${(throughput / (1024 * 1024)).toFixed(2)} MB/s`);
        
        return { duration, throughput, sizeCategory, exactTestSize };
    }
    
    /**
     * Measure OPAQUE protocol steps
     */
    measureOpaqueOperation(operation, duration, metadata = {}) {
        if (!this.metrics.opaque[operation]) {
            this.metrics.opaque[operation] = [];
        }
        
        this.metrics.opaque[operation].push({
            duration,
            timestamp: Date.now(),
            sessionId: this.sessionId,
            ...metadata
        });
        
        if (this.metrics.opaque[operation].length > 100) {
            this.metrics.opaque[operation] = this.metrics.opaque[operation].slice(-100);
        }
        
        this.totalOps++;
    }
    
    /**
     * Measure network call
     */
    measureNetworkCall(endpoint, duration, status, payloadSize = 0) {
        const metric = {
            endpoint,
            duration,
            status,
            payloadSize,
            formattedSize: this.formatFileSize(payloadSize),
            timestamp: Date.now(),
            sessionId: this.sessionId
        };
        
        this.metrics.network.apiCalls.push(metric);
        
        if (this.metrics.network.apiCalls.length > 200) {
            this.metrics.network.apiCalls = this.metrics.network.apiCalls.slice(-200);
        }
        
        this.totalOps++;
    }
    
    /**
     * Track error for error rate calculation
     */
    trackError(operation, errorType) {
        this.errorCount++;
        this.metrics.system.errorCount = this.errorCount;
        
        if (!this.metrics.system.errors) {
            this.metrics.system.errors = [];
        }
        
        this.metrics.system.errors.push({
            operation,
            errorType,
            timestamp: Date.now(),
            sessionId: this.sessionId
        });
        
        if (this.metrics.system.errors.length > 50) {
            this.metrics.system.errors = this.metrics.system.errors.slice(-50);
        }
    }
    
    /**
     * Track key storage size
     */
    trackKeyStorage(keyType, keySize) {
        this.metrics.memory.keyStorageSize.push({
            keyType,
            keySize,
            formattedSize: this.formatFileSize(keySize),
            timestamp: Date.now(),
            sessionId: this.sessionId
        });
        
        if (this.metrics.memory.keyStorageSize.length > 50) {
            this.metrics.memory.keyStorageSize = this.metrics.memory.keyStorageSize.slice(-50);
        }
    }
    
    /**
     * Calculate statistical metrics for a specific dataset
     */
    calculateStatisticsForDataset(data) {
        if (!data || data.length === 0) return null;
        
        const durations = data
            .map(m => m.duration)
            .filter(d => d !== undefined && d !== null && !isNaN(d));
        
        if (durations.length === 0) return null;
        
        durations.sort((a, b) => a - b);
        
        const sum = durations.reduce((a, b) => a + b, 0);
        const mean = sum / durations.length;
        const median = durations[Math.floor(durations.length / 2)];
        const p95 = durations[Math.floor(durations.length * 0.95)];
        const p99 = durations[Math.floor(durations.length * 0.99)];
        const min = durations[0];
        const max = durations[durations.length - 1];
        
        const squareDiffs = durations.map(value => {
            const diff = value - mean;
            return diff * diff;
        });
        const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / durations.length;
        const stdDev = Math.sqrt(avgSquareDiff);
        const cv = (stdDev / mean) * 100;
        
        const result = {
            count: durations.length,
            mean,
            median,
            p95,
            p99,
            min,
            max,
            stdDev,
            cv,
            unit: 'ms'
        };
        
        const throughputs = data
            .map(m => m.throughputMBps || (m.throughput ? m.throughput / (1024 * 1024) : null))
            .filter(t => t !== undefined && t !== null && !isNaN(t));
        
        if (throughputs.length > 0) {
            const throughputSum = throughputs.reduce((a, b) => a + b, 0);
            const throughputMean = throughputSum / throughputs.length;
            
            result.throughput = {
                mean: throughputMean,
                unit: 'MB/s',
                stdDev: this.calculateStdDev(throughputs)
            };
        }
        
        return result;
    }
    
    calculateStdDev(values) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squareDiffs = values.map(v => Math.pow(v - mean, 2));
        const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
        return Math.sqrt(avgSquareDiff);
    }
    
    /**
     * Calculate statistical metrics for research paper
     */
    calculateStatistics() {
        const stats = {
            opaque: {},
            encryption: {
                bySize: {},
                summary: {}
            },
            network: {
                bySize: {},
                summary: {}
            },
            transfer: {
                bySize: {},
                summary: {}
            },
            sharing: {},
            memory: {},
            system: {}
        };
        
        // Encryption statistics
        if (this.metrics.encryption.fileEncryption.length > 0) {
            stats.encryption.summary.fileEncryption = this.calculateStatisticsForDataset(this.metrics.encryption.fileEncryption);
        }
        if (this.metrics.encryption.fileDecryption.length > 0) {
            stats.encryption.summary.fileDecryption = this.calculateStatisticsForDataset(this.metrics.encryption.fileDecryption);
        }
        
        // Encryption by size
        for (const [sizeCat, measurements] of Object.entries(this.metrics.encryption.bySize)) {
            if (measurements.length > 0) {
                const fileEncryption = this.calculateStatisticsForDataset(measurements);
                const fileDecryption = this.calculateStatisticsForDataset(measurements);
                
                stats.encryption.bySize[sizeCat] = {
                    name: sizeCat,
                    bytes: this.sizeCategories[sizeCat]?.bytes,
                    fileEncryption,
                    fileDecryption
                };
            }
        }
        
        // Network statistics
        if (this.metrics.network.googleDriveUpload.length > 0) {
            stats.network.summary.googleDriveUpload = this.calculateStatisticsForDataset(this.metrics.network.googleDriveUpload);
        }
        if (this.metrics.network.googleDriveDownload.length > 0) {
            stats.network.summary.googleDriveDownload = this.calculateStatisticsForDataset(this.metrics.network.googleDriveDownload);
        }
        
        // Network by size
        for (const [sizeCat, measurements] of Object.entries(this.metrics.network.bySize)) {
            if (measurements.length > 0) {
                const upload = this.calculateStatisticsForDataset(measurements);
                const download = this.calculateStatisticsForDataset(measurements);
                
                stats.network.bySize[sizeCat] = {
                    name: sizeCat,
                    bytes: this.sizeCategories[sizeCat]?.bytes,
                    upload,
                    download
                };
            }
        }
        
        // Transfer statistics (complete upload/download)
        if (this.metrics.transfer.totalUpload && this.metrics.transfer.totalUpload.length > 0) {
            stats.transfer.summary.totalUpload = this.calculateStatisticsForDataset(this.metrics.transfer.totalUpload);
        }
        if (this.metrics.transfer.totalDownload && this.metrics.transfer.totalDownload.length > 0) {
            stats.transfer.summary.totalDownload = this.calculateStatisticsForDataset(this.metrics.transfer.totalDownload);
        }
        
        // Transfer by size
        for (const [sizeCat, measurements] of Object.entries(this.metrics.transfer.bySize)) {
            if (measurements && measurements.length > 0) {
                const upload = this.calculateStatisticsForDataset(measurements);
                const download = this.calculateStatisticsForDataset(measurements);
                
                stats.transfer.bySize[sizeCat] = {
                    name: sizeCat,
                    bytes: this.sizeCategories[sizeCat]?.bytes,
                    upload,
                    download
                };
            }
        }
        
        // OPAQUE statistics
        for (const [op, measurements] of Object.entries(this.metrics.opaque)) {
            if (measurements.length > 0) {
                stats.opaque[op] = this.calculateStatisticsForDataset(measurements);
            }
        }
        
        // Sharing statistics
        for (const [shareType, measurements] of Object.entries(this.metrics.sharing)) {
            if (measurements.length > 0) {
                stats.sharing[shareType] = this.calculateStatisticsForDataset(measurements);
            }
        }
        
        // System statistics
        stats.system = {
            totalOperations: this.totalOps,
            errorCount: this.errorCount,
            errorRate: this.totalOps > 0 ? ((this.errorCount / this.totalOps) * 100).toFixed(2) + '%' : '0%',
            sessionDuration: ((Date.now() - this.startTime) / 1000).toFixed(2) + 's',
            sessionId: this.sessionId
        };
        
        return stats;
    }
    
    generateSizeCategorizedSummary() {
        const summary = [];
        
        summary.push('\n📊 PERFORMANCE BY TEST FILE SIZE');
        summary.push('='.repeat(100));
        
        // Encryption by size
        summary.push('\n🔐 ENCRYPTION PERFORMANCE');
        summary.push('-'.repeat(100));
        summary.push('Test Size | Count | Encrypt (ms)    | Decrypt (ms)    | Throughput (MB/s) | StdDev');
        summary.push('----------|-------|-----------------|-----------------|-------------------|--------');
        
        const sortedSizes = [...this.testSizes].sort((a, b) => a.bytes - b.bytes);
        
        for (const size of sortedSizes) {
            const measurements = this.metrics.encryption.bySize[size.name];
            if (measurements && measurements.length > 0) {
                const encryptStats = this.calculateStatisticsForDataset(measurements);
                const decryptStats = this.calculateStatisticsForDataset(measurements);
                
                if (encryptStats) {
                    const name = size.name.padEnd(8);
                    const count = encryptStats.count.toString().padEnd(5);
                    const encrypt = encryptStats.mean.toFixed(2).padEnd(15);
                    const decrypt = decryptStats ? decryptStats.mean.toFixed(2).padEnd(15) : 'N/A'.padEnd(15);
                    const throughput = encryptStats.throughput ? encryptStats.throughput.mean.toFixed(2).padEnd(17) : 'N/A'.padEnd(17);
                    const stdDev = encryptStats.stdDev ? `±${encryptStats.stdDev.toFixed(2)}` : 'N/A';
                    
                    summary.push(`${name} | ${count} | ${encrypt} | ${decrypt} | ${throughput} | ${stdDev}`);
                }
            }
        }
        
        // Network by size (separate upload/download)
        summary.push('\n🌐 GOOGLE DRIVE PERFORMANCE');
        summary.push('-'.repeat(100));
        summary.push('Test Size | Count | Upload (ms)    | Download (ms)  | Upload MB/s | Download MB/s');
        summary.push('----------|-------|----------------|----------------|-------------|---------------');
        
        for (const size of sortedSizes) {
            const uploadMeasurements = this.metrics.network.googleDriveUpload.filter(m => m.exactTestSize === size.name);
            const downloadMeasurements = this.metrics.network.googleDriveDownload.filter(m => m.exactTestSize === size.name);
            
            if (uploadMeasurements.length > 0 || downloadMeasurements.length > 0) {
                const uploadStats = this.calculateStatisticsForDataset(uploadMeasurements);
                const downloadStats = this.calculateStatisticsForDataset(downloadMeasurements);
                
                const name = size.name.padEnd(8);
                const count = (uploadStats?.count || downloadStats?.count || 0).toString().padEnd(5);
                const upload = uploadStats ? uploadStats.mean.toFixed(2).padEnd(14) : 'N/A'.padEnd(14);
                const download = downloadStats ? downloadStats.mean.toFixed(2).padEnd(14) : 'N/A'.padEnd(14);
                const uploadThroughput = uploadStats?.throughput ? uploadStats.throughput.mean.toFixed(2).padEnd(11) : 'N/A'.padEnd(11);
                const downloadThroughput = downloadStats?.throughput ? downloadStats.throughput.mean.toFixed(2).padEnd(13) : 'N/A'.padEnd(13);
                
                summary.push(`${name} | ${count} | ${upload} | ${download} | ${uploadThroughput} | ${downloadThroughput}`);
            }
        }
        
        // Total transfer (encrypt+upload and download+decrypt)
        summary.push('\n📦 TOTAL TRANSFER PERFORMANCE (Encrypt+Upload & Download+Decrypt)');
        summary.push('-'.repeat(100));
        summary.push('Test Size | Upload (ms) | Upload MB/s | Download (ms) | Download MB/s');
        summary.push('----------|-------------|-------------|---------------|---------------');
        
        for (const size of sortedSizes) {
            const uploadMeasurements = this.metrics.transfer.totalUpload?.filter(m => m.exactTestSize === size.name) || [];
            const downloadMeasurements = this.metrics.transfer.totalDownload?.filter(m => m.exactTestSize === size.name) || [];
            
            if (uploadMeasurements.length > 0 || downloadMeasurements.length > 0) {
                const uploadStats = this.calculateStatisticsForDataset(uploadMeasurements);
                const downloadStats = this.calculateStatisticsForDataset(downloadMeasurements);
                
                const name = size.name.padEnd(8);
                const uploadTime = uploadStats ? uploadStats.mean.toFixed(2).padEnd(11) : 'N/A'.padEnd(11);
                const uploadSpeed = uploadStats?.throughput ? uploadStats.throughput.mean.toFixed(2).padEnd(11) : 'N/A'.padEnd(11);
                const downloadTime = downloadStats ? downloadStats.mean.toFixed(2).padEnd(13) : 'N/A'.padEnd(13);
                const downloadSpeed = downloadStats?.throughput ? downloadStats.throughput.mean.toFixed(2).padEnd(13) : 'N/A'.padEnd(13);
                
                summary.push(`${name} | ${uploadTime} | ${uploadSpeed} | ${downloadTime} | ${downloadSpeed}`);
            }
        }
        
        return summary.join('\n');
    }
    
    generateCSV() {
        const csvData = {};
        
        // Encryption CSV
        if (this.metrics.encryption.fileEncryption.length > 0) {
            const encFields = ['timestamp', 'duration', 'fileSize', 'formattedSize', 'throughputMBps', 'algorithm', 'operation'];
            csvData['encryption'] = {
                headers: encFields.join(','),
                data: this.metrics.encryption.fileEncryption.map(m => 
                    encFields.map(h => m[h] !== undefined ? m[h] : '').join(',')
                ).join('\n')
            };
        }
        
        // Upload CSV
        if (this.metrics.network.googleDriveUpload.length > 0) {
            const uploadFields = ['timestamp', 'duration', 'fileSize', 'formattedSize', 'throughputMBps', 'status', 'operation'];
            csvData['upload'] = {
                headers: uploadFields.join(','),
                data: this.metrics.network.googleDriveUpload.map(m => 
                    uploadFields.map(h => m[h] !== undefined ? m[h] : '').join(',')
                ).join('\n')
            };
        }
        
        // Download CSV
        if (this.metrics.network.googleDriveDownload.length > 0) {
            const downloadFields = ['timestamp', 'duration', 'fileSize', 'formattedSize', 'throughputMBps', 'status', 'operation'];
            csvData['download'] = {
                headers: downloadFields.join(','),
                data: this.metrics.network.googleDriveDownload.map(m => 
                    downloadFields.map(h => m[h] !== undefined ? m[h] : '').join(',')
                ).join('\n')
            };
        }
        
        // Complete transfer CSV
        if (this.metrics.transfer.totalUpload && this.metrics.transfer.totalUpload.length > 0) {
            const transferFields = ['timestamp', 'fileSize', 'formattedSize', 'encryptMs', 'uploadMs', 'totalMs', 'encryptThroughputMBps', 'uploadThroughputMBps', 'totalThroughputMBps'];
            csvData['complete_upload'] = {
                headers: transferFields.join(','),
                data: this.metrics.transfer.totalUpload.map(m => 
                    transferFields.map(h => m[h] !== undefined ? m[h] : '').join(',')
                ).join('\n')
            };
        }
        
        if (this.metrics.transfer.totalDownload && this.metrics.transfer.totalDownload.length > 0) {
            const transferFields = ['timestamp', 'fileSize', 'formattedSize', 'downloadMs', 'decryptMs', 'totalMs', 'downloadThroughputMBps', 'decryptThroughputMBps', 'totalThroughputMBps'];
            csvData['complete_download'] = {
                headers: transferFields.join(','),
                data: this.metrics.transfer.totalDownload.map(m => 
                    transferFields.map(h => m[h] !== undefined ? m[h] : '').join(',')
                ).join('\n')
            };
        }
        
        return csvData;
    }
    
    exportMetrics() {
        return {
            sessionInfo: {
                sessionId: this.sessionId,
                startTime: new Date(this.startTime).toISOString(),
                endTime: new Date().toISOString(),
                duration: Date.now() - this.startTime,
                userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
                platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
                hardware: {
                    cores: typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 'unknown',
                    memory: performance && performance.memory ? performance.memory.jsHeapSizeLimit : 'unknown'
                }
            },
            testSizes: this.testSizes,
            rawMetrics: this.metrics,
            statistics: this.calculateStatistics(),
            csvData: this.generateCSV(),
            sizeCategorizedSummary: this.generateSizeCategorizedSummary()
        };
    }
    
    reset() {
        this.metrics = {
            opaque: { registration: [], login: [], keyDerivation: [] },
            encryption: { 
                fileEncryption: [], 
                fileDecryption: [], 
                keyGeneration: [], 
                keyWrapping: [], 
                keyUnwrapping: [],
                bySize: this.initializeSizeCategories()
            },
            network: { 
                apiCalls: [], 
                googleDriveUpload: [], 
                googleDriveDownload: [], 
                shareLinkGeneration: [],
                bySize: this.initializeSizeCategories()
            },
            transfer: {
                totalUpload: [],
                totalDownload: [],
                bySize: this.initializeSizeCategories()
            },
            sharing: { publicShareCreation: [], privateShareCreation: [], shareVerification: [], shareAccess: [] },
            memory: { heapUsage: [], keyStorageSize: [], garbageCollection: [] },
            system: { totalOperations: 0, errorCount: 0, errors: [] }
        };
        
        this.startTime = Date.now();
        this.errorCount = 0;
        this.totalOps = 0;
        this.sessionId = this.generateSessionId();
        
        this.startMemoryMonitoring();
    }
    
    destroy() {
        if (this.memoryInterval) {
            clearInterval(this.memoryInterval);
            this.memoryInterval = null;
        }
        
        if (performance && performance.clearMarks && performance.clearMeasures) {
            try {
                performance.clearMarks();
                performance.clearMeasures();
            } catch (error) {
                // Ignore cleanup errors
            }
        }
    }
}

// Singleton instance
export const perfMetrics = new PerformanceMetrics();

// React hook for performance monitoring
export function usePerformanceMetrics() {
    return perfMetrics;
}