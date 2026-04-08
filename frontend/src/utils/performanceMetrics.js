// frontend/src/utils/performanceMetrics.js - Customized for your test sizes
/**
 * Performance Measurement Service for IEEE Research Paper
 * Tracks cryptographic operations, network latency, file processing, and memory usage
 * Automatically categorizes metrics by specific test file sizes
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
            
            // Encryption metrics with your specific size categories
            encryption: {
                fileEncryption: [],
                fileDecryption: [],
                keyGeneration: [],
                keyWrapping: [],
                keyUnwrapping: [],
                // Auto-generated categories for your test sizes
                bySize: this.initializeSizeCategories()
            },
            
            // Network metrics with your specific size categories
            network: {
                apiCalls: [],
                googleDriveUpload: [],
                googleDriveDownload: [],
                shareLinkGeneration: [],
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
    
    /**
     * Categorize file size into your specific test size buckets
     */
    categorizeFileSize(bytes) {
        // Find the closest test size category
        for (const size of this.testSizes) {
            // Allow some tolerance (±5%) for size matching
            const tolerance = size.bytes * 0.05;
            if (Math.abs(bytes - size.bytes) <= tolerance) {
                return size.name;
            }
        }
        
        // If not an exact test size, find the appropriate range
        for (let i = 0; i < this.testSizes.length; i++) {
            const current = this.testSizes[i];
            const next = this.testSizes[i + 1];
            
            if (!next) {
                // Larger than largest test size
                if (bytes > current.bytes) {
                    return `${current.name}+`;
                }
            } else if (bytes >= current.bytes && bytes < next.bytes) {
                return `${current.name}-${next.name}`;
            }
        }
        
        return 'unknown';
    }
    
    /**
     * Get exact test size name if it matches one of your test sizes
     */
    getExactTestSize(bytes) {
        for (const size of this.testSizes) {
            const tolerance = size.bytes * 0.05; // 5% tolerance
            if (Math.abs(bytes - size.bytes) <= tolerance) {
                return size.name;
            }
        }
        return null;
    }
    
    /**
     * Get human-readable size category name
     */
    getSizeCategoryName(category) {
        if (this.sizeCategories[category]) {
            return this.sizeCategories[category].displayName;
        }
        return category;
    }
    
    /**
     * Format file size for display
     */
    formatFileSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    
    /**
     * Start timing an operation
     */
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
    
    /**
     * End timing and record metrics with automatic size categorization
     */
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
                
                // Add file size information if present
                if (metadata.fileSize) {
                    metric.formattedSize = this.formatFileSize(metadata.fileSize);
                    metric.sizeCategory = this.categorizeFileSize(metadata.fileSize);
                    metric.exactTestSize = this.getExactTestSize(metadata.fileSize);
                }
                
                // Ensure category and subCategory exist
                if (!this.metrics[category]) {
                    this.metrics[category] = {};
                }
                
                if (!this.metrics[category][subCategory]) {
                    this.metrics[category][subCategory] = [];
                }
                
                // Add to main category
                this.metrics[category][subCategory].push(metric);
                
                // Auto-categorize by exact test size if it matches
                if (metadata.fileSize && metric.exactTestSize && this.metrics[category].bySize) {
                    const sizeCat = metric.exactTestSize;
                    if (this.metrics[category].bySize[sizeCat]) {
                        this.metrics[category].bySize[sizeCat].push(metric);
                    }
                }
                
                this.totalOps++;
                
                // Keep only last 200 measurements per category
                if (this.metrics[category][subCategory].length > 200) {
                    this.metrics[category][subCategory] = this.metrics[category][subCategory].slice(-200);
                }
                
                // Keep only last 100 measurements per size category
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
     * Measure file encryption with your specific size categorization
     */
    measureFileEncryption(fileSize, startTime, endTime, algorithm = 'AES-GCM-256') {
        const duration = endTime - startTime;
        const throughput = fileSize / (duration / 1000); // bytes per second
        const sizeCategory = this.categorizeFileSize(fileSize);
        const exactTestSize = this.getExactTestSize(fileSize);
        
        const metric = {
            duration,
            fileSize,
            formattedSize: this.formatFileSize(fileSize),
            sizeCategory,
            exactTestSize,
            throughput,
            algorithm,
            timestamp: Date.now(),
            sessionId: this.sessionId
        };
        
        // Add to main array
        this.metrics.encryption.fileEncryption.push(metric);
        
        // Add to exact test size category if it matches
        if (exactTestSize && this.metrics.encryption.bySize[exactTestSize]) {
            this.metrics.encryption.bySize[exactTestSize].push(metric);
        }
        
        // Keep limits
        if (this.metrics.encryption.fileEncryption.length > 200) {
            this.metrics.encryption.fileEncryption = this.metrics.encryption.fileEncryption.slice(-200);
        }
        
        if (exactTestSize && this.metrics.encryption.bySize[exactTestSize] && 
            this.metrics.encryption.bySize[exactTestSize].length > 100) {
            this.metrics.encryption.bySize[exactTestSize] = this.metrics.encryption.bySize[exactTestSize].slice(-100);
        }
        
        this.totalOps++;
        
        return { duration, throughput, sizeCategory, exactTestSize };
    }
    
    /**
     * Measure file decryption with your specific size categorization
     */
    measureFileDecryption(fileSize, startTime, endTime, algorithm = 'AES-GCM-256') {
        const duration = endTime - startTime;
        const throughput = fileSize / (duration / 1000); // bytes per second
        const sizeCategory = this.categorizeFileSize(fileSize);
        const exactTestSize = this.getExactTestSize(fileSize);
        
        const metric = {
            duration,
            fileSize,
            formattedSize: this.formatFileSize(fileSize),
            sizeCategory,
            exactTestSize,
            throughput,
            algorithm,
            timestamp: Date.now(),
            sessionId: this.sessionId
        };
        
        // Add to main array
        this.metrics.encryption.fileDecryption.push(metric);
        
        // Add to exact test size category if it matches
        if (exactTestSize && this.metrics.encryption.bySize[exactTestSize]) {
            this.metrics.encryption.bySize[exactTestSize].push(metric);
        }
        
        // Keep limits
        if (this.metrics.encryption.fileDecryption.length > 200) {
            this.metrics.encryption.fileDecryption = this.metrics.encryption.fileDecryption.slice(-200);
        }
        
        if (exactTestSize && this.metrics.encryption.bySize[exactTestSize] && 
            this.metrics.encryption.bySize[exactTestSize].length > 100) {
            this.metrics.encryption.bySize[exactTestSize] = this.metrics.encryption.bySize[exactTestSize].slice(-100);
        }
        
        this.totalOps++;
        
        return { duration, throughput, sizeCategory, exactTestSize };
    }
    
    /**
     * Measure Google Drive upload with your specific size categorization
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
            status,
            timestamp: Date.now(),
            sessionId: this.sessionId,
            ...metadata
        };
        
        // Add to main array
        this.metrics.network.googleDriveUpload.push(metric);
        
        // Add to exact test size category if it matches
        if (exactTestSize && this.metrics.network.bySize[exactTestSize]) {
            this.metrics.network.bySize[exactTestSize].push(metric);
        }
        
        // Keep limits
        if (this.metrics.network.googleDriveUpload.length > 200) {
            this.metrics.network.googleDriveUpload = this.metrics.network.googleDriveUpload.slice(-200);
        }
        
        if (exactTestSize && this.metrics.network.bySize[exactTestSize] && 
            this.metrics.network.bySize[exactTestSize].length > 100) {
            this.metrics.network.bySize[exactTestSize] = this.metrics.network.bySize[exactTestSize].slice(-100);
        }
        
        this.totalOps++;
        
        return { duration, throughput, sizeCategory, exactTestSize };
    }
    
    /**
     * Measure Google Drive download with your specific size categorization
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
            status,
            timestamp: Date.now(),
            sessionId: this.sessionId,
            ...metadata
        };
        
        // Add to main array
        this.metrics.network.googleDriveDownload.push(metric);
        
        // Add to exact test size category if it matches
        if (exactTestSize && this.metrics.network.bySize[exactTestSize]) {
            this.metrics.network.bySize[exactTestSize].push(metric);
        }
        
        // Keep limits
        if (this.metrics.network.googleDriveDownload.length > 200) {
            this.metrics.network.googleDriveDownload = this.metrics.network.googleDriveDownload.slice(-200);
        }
        
        if (exactTestSize && this.metrics.network.bySize[exactTestSize] && 
            this.metrics.network.bySize[exactTestSize].length > 100) {
            this.metrics.network.bySize[exactTestSize] = this.metrics.network.bySize[exactTestSize].slice(-100);
        }
        
        this.totalOps++;
        
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
        
        // Standard deviation
        const squareDiffs = durations.map(value => {
            const diff = value - mean;
            return diff * diff;
        });
        const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / durations.length;
        const stdDev = Math.sqrt(avgSquareDiff);
        
        // Coefficient of variation (for comparing variability across sizes)
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
        
        // Add throughput if available
        const throughputs = data
            .map(m => m.throughput)
            .filter(t => t !== undefined && t !== null && !isNaN(t));
        
        if (throughputs.length > 0) {
            const throughputSum = throughputs.reduce((a, b) => a + b, 0);
            const throughputMean = throughputSum / throughputs.length;
            
            result.throughput = {
                mean: throughputMean / (1024 * 1024), // MB/s
                unit: 'MB/s',
                stdDev: this.calculateStdDev(throughputs) / (1024 * 1024)
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
            sharing: {},
            memory: {},
            system: {}
        };
        
        // Calculate overall statistics for encryption
        if (this.metrics.encryption.fileEncryption.length > 0) {
            stats.encryption.summary.fileEncryption = this.calculateStatisticsForDataset(this.metrics.encryption.fileEncryption);
        }
        if (this.metrics.encryption.fileDecryption.length > 0) {
            stats.encryption.summary.fileDecryption = this.calculateStatisticsForDataset(this.metrics.encryption.fileDecryption);
        }
        
        // Calculate statistics by your specific test sizes for encryption
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
        
        // Calculate overall statistics for network
        if (this.metrics.network.googleDriveUpload.length > 0) {
            stats.network.summary.googleDriveUpload = this.calculateStatisticsForDataset(this.metrics.network.googleDriveUpload);
        }
        if (this.metrics.network.googleDriveDownload.length > 0) {
            stats.network.summary.googleDriveDownload = this.calculateStatisticsForDataset(this.metrics.network.googleDriveDownload);
        }
        
        // Calculate statistics by your specific test sizes for network
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
        
        // Calculate OPAQUE statistics
        for (const [op, measurements] of Object.entries(this.metrics.opaque)) {
            if (measurements.length > 0) {
                stats.opaque[op] = this.calculateStatisticsForDataset(measurements);
            }
        }
        
        // Calculate sharing statistics
        for (const [shareType, measurements] of Object.entries(this.metrics.sharing)) {
            if (measurements.length > 0) {
                stats.sharing[shareType] = this.calculateStatisticsForDataset(measurements);
            }
        }
        
        // Calculate error rate
        stats.system = {
            totalOperations: this.totalOps,
            errorCount: this.errorCount,
            errorRate: this.totalOps > 0 ? ((this.errorCount / this.totalOps) * 100).toFixed(2) + '%' : '0%',
            sessionDuration: ((Date.now() - this.startTime) / 1000).toFixed(2) + 's',
            sessionId: this.sessionId
        };
        
        return stats;
    }
    
    /**
     * Generate size-categorized summary for research paper with your test sizes
     */
    generateSizeCategorizedSummary() {
        const summary = [];
        
        summary.push('\n📊 PERFORMANCE BY TEST FILE SIZE');
        summary.push('='.repeat(100));
        
        // Encryption by size
        summary.push('\n🔐 ENCRYPTION PERFORMANCE');
        summary.push('-'.repeat(100));
        summary.push('Test Size | Count | Encrypt (ms)    | Decrypt (ms)    | Throughput (MB/s) | StdDev');
        summary.push('----------|-------|-----------------|-----------------|-------------------|--------');
        
        // Sort test sizes by bytes
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
        
        // Network by size
        summary.push('\n🌐 GOOGLE DRIVE PERFORMANCE');
        summary.push('-'.repeat(100));
        summary.push('Test Size | Count | Upload (ms)    | Download (ms)  | Throughput (MB/s) | StdDev');
        summary.push('----------|-------|----------------|----------------|-------------------|--------');
        
        for (const size of sortedSizes) {
            const measurements = this.metrics.network.bySize[size.name];
            if (measurements && measurements.length > 0) {
                const uploadStats = this.calculateStatisticsForDataset(measurements);
                const downloadStats = this.calculateStatisticsForDataset(measurements);
                
                if (uploadStats) {
                    const name = size.name.padEnd(8);
                    const count = uploadStats.count.toString().padEnd(5);
                    const upload = uploadStats.mean.toFixed(2).padEnd(14);
                    const download = downloadStats ? downloadStats.mean.toFixed(2).padEnd(14) : 'N/A'.padEnd(14);
                    const throughput = uploadStats.throughput ? uploadStats.throughput.mean.toFixed(2).padEnd(17) : 'N/A'.padEnd(17);
                    const stdDev = uploadStats.stdDev ? `±${uploadStats.stdDev.toFixed(2)}` : 'N/A';
                    
                    summary.push(`${name} | ${count} | ${upload} | ${download} | ${throughput} | ${stdDev}`);
                }
            }
        }
        
        return summary.join('\n');
    }
    
    /**
     * Generate CSV data for research export
     */
    generateCSV() {
        const csvData = {};
        
        // Generate CSV for each test size
        for (const size of this.testSizes) {
            // Encryption CSV for this size
            const encMeasurements = this.metrics.encryption.bySize[size.name];
            if (encMeasurements && encMeasurements.length > 0) {
                const key = `encryption_${size.name}`;
                
                const fields = new Set(['timestamp', 'duration', 'fileSize', 'formattedSize', 'throughput', 'algorithm']);
                const headers = Array.from(fields);
                const rows = encMeasurements.map(m => 
                    headers.map(h => {
                        const val = m[h];
                        if (val === undefined || val === null) return '';
                        return val;
                    }).join(',')
                );
                
                csvData[key] = {
                    headers: headers.join(','),
                    data: rows.join('\n')
                };
            }
            
            // Network CSV for this size
            const netMeasurements = this.metrics.network.bySize[size.name];
            if (netMeasurements && netMeasurements.length > 0) {
                const key = `network_${size.name}`;
                
                const fields = new Set(['timestamp', 'duration', 'fileSize', 'formattedSize', 'throughput', 'status']);
                const headers = Array.from(fields);
                const rows = netMeasurements.map(m => 
                    headers.map(h => {
                        const val = m[h];
                        if (val === undefined || val === null) return '';
                        return val;
                    }).join(',')
                );
                
                csvData[key] = {
                    headers: headers.join(','),
                    data: rows.join('\n')
                };
            }
        }
        
        // Add OPAQUE CSV
        if (this.metrics.opaque.login.length > 0) {
            const fields = new Set(['timestamp', 'duration', 'email']);
            const headers = Array.from(fields);
            const rows = this.metrics.opaque.login.map(m => 
                headers.map(h => m[h] || '').join(',')
            );
            
            csvData['opaque_login'] = {
                headers: headers.join(','),
                data: rows.join('\n')
            };
        }
        
        return csvData;
    }
    
    /**
     * Export full metrics for research paper
     */
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
    
    /**
     * Reset metrics for new session
     */
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
    
    /**
     * Clean up resources
     */
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