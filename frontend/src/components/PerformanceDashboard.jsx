// frontend/src/components/PerformanceDashboard.jsx - Customized for your test sizes
import React, { useState, useEffect } from 'react';
import { 
  FaChartLine, 
  FaDownload, 
  FaRedo, 
  FaTrash,
  FaLock,
  FaShieldAlt,
  FaClock,
  FaMemory,
  FaNetworkWired,
  FaTimes,
  FaTable,
  FaChartBar,
  FaFile
} from 'react-icons/fa';
import { perfMetrics } from '../utils/performanceMetrics';
import toast from 'react-hot-toast';

const PerformanceDashboard = ({ onClose }) => {
  const [metrics, setMetrics] = useState(null);
  const [stats, setStats] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('bySize'); // 'summary' or 'bySize'
  const [selectedMetric, setSelectedMetric] = useState('encryption');

  useEffect(() => {
    refreshData();
    
    if (autoRefresh) {
      const interval = setInterval(refreshData, 5000);
      setRefreshInterval(interval);
    }
    
    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [autoRefresh]);

  const refreshData = () => {
    try {
      setLoading(true);
      const exported = perfMetrics.exportMetrics();
      setMetrics(exported.rawMetrics);
      setStats(exported.statistics);
    } catch (error) {
      console.error('Failed to refresh metrics:', error);
      toast.error('Failed to load performance metrics');
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    try {
      const exported = perfMetrics.exportMetrics();
      const csvData = exported.csvData || {};
      
      if (Object.keys(csvData).length === 0) {
        toast.error('No data to export');
        return;
      }
      
      for (const [key, data] of Object.entries(csvData)) {
        const blob = new Blob([data.headers + '\n' + data.data], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `performance-${key}-${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      
      toast.success(`Exported ${Object.keys(csvData).length} CSV files`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export CSV');
    }
  };

  const exportJSON = () => {
    try {
      const exported = perfMetrics.exportMetrics();
      const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `performance-metrics-${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Metrics exported as JSON');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export JSON');
    }
  };

  const resetMetrics = () => {
    if (window.confirm('Reset all performance metrics?')) {
      perfMetrics.reset();
      refreshData();
      toast.success('Metrics reset');
    }
  };

  const formatDuration = (ms) => {
    if (!ms) return 'N/A';
    const num = parseFloat(ms);
    if (num < 0.001) return `${(num * 1000000).toFixed(2)} ns`;
    if (num < 1) return `${(num * 1000).toFixed(2)} µs`;
    if (num < 1000) return `${num.toFixed(2)} ms`;
    return `${(num / 1000).toFixed(2)} s`;
  };

  const formatThroughput = (mbps) => {
    if (!mbps) return 'N/A';
    return `${parseFloat(mbps).toFixed(2)} MB/s`;
  };

  const formatNumber = (num) => {
    if (num === undefined || num === null) return '0';
    return num.toString();
  };

  const renderEncryptionTable = () => {
    if (!stats?.encryption?.bySize) return null;
    
    const sizes = Object.keys(stats.encryption.bySize).sort((a, b) => {
      const aBytes = perfMetrics.sizeCategories[a]?.bytes || 0;
      const bBytes = perfMetrics.sizeCategories[b]?.bytes || 0;
      return aBytes - bBytes;
    });
    
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Test Size</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Trials</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Encrypt (ms)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Decrypt (ms)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Throughput</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">StdDev</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">P95</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sizes.map(size => {
              const data = stats.encryption.bySize[size];
              if (!data?.fileEncryption) return null;
              
              const encrypt = data.fileEncryption;
              const decrypt = data.fileDecryption;
              
              return (
                <tr key={size} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {size}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-500">
                    {encrypt.count}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-mono">
                    {formatDuration(encrypt.mean)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-mono">
                    {decrypt ? formatDuration(decrypt.mean) : 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-green-600">
                    {encrypt.throughput ? formatThroughput(encrypt.throughput.mean) : 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-500">
                    ±{encrypt.stdDev?.toFixed(2)}ms
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-500">
                    {formatDuration(encrypt.p95)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderNetworkTable = () => {
    if (!stats?.network?.bySize) return null;
    
    const sizes = Object.keys(stats.network.bySize).sort((a, b) => {
      const aBytes = perfMetrics.sizeCategories[a]?.bytes || 0;
      const bBytes = perfMetrics.sizeCategories[b]?.bytes || 0;
      return aBytes - bBytes;
    });
    
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Test Size</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Trials</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Upload (ms)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Download (ms)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Throughput</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">StdDev</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">P95</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sizes.map(size => {
              const data = stats.network.bySize[size];
              if (!data?.upload) return null;
              
              const upload = data.upload;
              const download = data.download;
              
              return (
                <tr key={size} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {size}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-500">
                    {upload.count}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-mono">
                    {formatDuration(upload.mean)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-mono">
                    {download ? formatDuration(download.mean) : 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-blue-600">
                    {upload.throughput ? formatThroughput(upload.throughput.mean) : 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-500">
                    ±{upload.stdDev?.toFixed(2)}ms
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-500">
                    {formatDuration(upload.p95)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  if (loading && !stats) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[90vh] overflow-auto">
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading performance metrics...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-800 flex items-center">
            <FaChartLine className="mr-2 text-blue-600" />
            Performance Metrics Dashboard
          </h2>
          <div className="flex items-center space-x-2">
            {/* Metric Toggle */}
            <div className="flex border border-gray-300 rounded-lg overflow-hidden mr-2">
              <button
                onClick={() => setSelectedMetric('encryption')}
                className={`px-3 py-1 text-sm ${
                  selectedMetric === 'encryption' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <FaLock className="inline mr-1" />
                Encryption
              </button>
              <button
                onClick={() => setSelectedMetric('network')}
                className={`px-3 py-1 text-sm ${
                  selectedMetric === 'network' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <FaNetworkWired className="inline mr-1" />
                Network
              </button>
            </div>
            
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1 rounded-lg text-sm ${
                autoRefresh 
                  ? 'bg-green-100 text-green-700 border border-green-300' 
                  : 'bg-gray-100 text-gray-700 border border-gray-300'
              }`}
            >
              {autoRefresh ? 'Auto-refresh On' : 'Auto-refresh Off'}
            </button>
            <button
              onClick={refreshData}
              className="p-2 text-gray-500 hover:text-blue-600 rounded-lg hover:bg-gray-100"
              title="Refresh"
            >
              <FaRedo />
            </button>
            <button
              onClick={exportCSV}
              className="p-2 text-gray-500 hover:text-green-600 rounded-lg hover:bg-gray-100"
              title="Export CSV"
            >
              <FaDownload />
            </button>
            <button
              onClick={exportJSON}
              className="p-2 text-gray-500 hover:text-purple-600 rounded-lg hover:bg-gray-100"
              title="Export JSON"
            >
              <FaDownload />
            </button>
            <button
              onClick={resetMetrics}
              className="p-2 text-gray-500 hover:text-red-600 rounded-lg hover:bg-gray-100"
              title="Reset"
            >
              <FaTrash />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
              title="Close"
            >
              <FaTimes />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {!stats ? (
            <div className="text-center py-8 text-gray-500">
              No performance data available yet. Perform some operations to see metrics.
            </div>
          ) : (
            <>
              {/* Session Info */}
              {stats.system && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-medium text-blue-800 mb-2 flex items-center">
                    <FaClock className="mr-2" />
                    Session Information
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Session ID:</span>
                      <div className="font-mono text-xs break-all mt-1">{stats.system.sessionId || 'N/A'}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Duration:</span>
                      <div className="font-medium">{stats.system.sessionDuration || 'N/A'}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Total Ops:</span>
                      <div className="font-medium">{formatNumber(stats.system.totalOperations)}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Error Rate:</span>
                      <div className="font-medium text-orange-600">{stats.system.errorRate || '0%'}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Test Files Status */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="font-medium text-gray-800 mb-2 flex items-center">
                  <FaFile className="mr-2 text-gray-600" />
                  Test Files Status
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {perfMetrics.testSizes.map(size => {
                    const encCount = metrics?.encryption?.bySize[size.name]?.length || 0;
                    const netCount = metrics?.network?.bySize[size.name]?.length || 0;
                    const total = encCount + netCount;
                    
                    return (
                      <div key={size.name} className="text-xs p-2 bg-white rounded border">
                        <span className="font-medium">{size.name}</span>
                        <span className={`ml-2 px-1.5 py-0.5 rounded ${
                          total > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {total} samples
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Selected Metric Table */}
              {selectedMetric === 'encryption' && (
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-medium text-gray-800 mb-3 flex items-center">
                    <FaLock className="mr-2 text-green-600" />
                    Encryption Performance by Test Size
                  </h3>
                  {renderEncryptionTable()}
                </div>
              )}

              {selectedMetric === 'network' && (
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-medium text-gray-800 mb-3 flex items-center">
                    <FaNetworkWired className="mr-2 text-blue-600" />
                    Google Drive Performance by Test Size
                  </h3>
                  {renderNetworkTable()}
                </div>
              )}

              {/* OPAQUE Summary */}
              {stats.opaque && Object.keys(stats.opaque).length > 0 && (
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-medium text-gray-800 mb-3 flex items-center">
                    <FaShieldAlt className="mr-2 text-purple-600" />
                    OPAQUE Authentication (RFC 9380)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {Object.entries(stats.opaque).map(([key, value]) => (
                      <div key={key} className="bg-gray-50 rounded p-3">
                        <div className="text-sm font-medium text-gray-700 capitalize mb-2">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </div>
                        <div className="space-y-1 text-xs">
                          <div><span className="text-gray-500">Trials:</span> <span className="ml-1 font-medium">{value.count}</span></div>
                          <div><span className="text-gray-500">Mean:</span> <span className="ml-1 font-medium">{formatDuration(value.mean)}</span></div>
                          <div><span className="text-gray-500">P95:</span> <span className="ml-1 font-medium">{formatDuration(value.p95)}</span></div>
                          <div><span className="text-gray-500">StdDev:</span> <span className="ml-1 font-medium">±{value.stdDev?.toFixed(2)}ms</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Research Summary */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="font-medium text-gray-800 mb-3">Research Summary</h3>
                <div className="text-sm text-gray-600 space-y-2">
                  <p>
                    <strong>OPAQUE Protocol (RFC 9380):</strong> Mean login: {
                      stats.opaque?.login?.mean ? formatDuration(stats.opaque.login.mean) : 'N/A'
                    }, P95: {
                      stats.opaque?.login?.p95 ? formatDuration(stats.opaque.login.p95) : 'N/A'
                    } ({stats.opaque?.login?.count || 0} trials)
                  </p>
                  <p>
                    <strong>File Encryption:</strong> Throughput ranges from {
                      stats.encryption?.bySize?.['1KB']?.fileEncryption?.throughput?.mean ? 
                      formatThroughput(stats.encryption.bySize['1KB'].fileEncryption.throughput.mean) : 'N/A'
                    } (1KB) to {
                      stats.encryption?.bySize?.['100MB']?.fileEncryption?.throughput?.mean ? 
                      formatThroughput(stats.encryption.bySize['100MB'].fileEncryption.throughput.mean) : 'N/A'
                    } (100MB)
                  </p>
                  <p>
                    <strong>Google Drive:</strong> Upload throughput: {
                      stats.network?.bySize?.['10MB']?.upload?.throughput?.mean ? 
                      formatThroughput(stats.network.bySize['10MB'].upload.throughput.mean) : 'N/A'
                    } (10MB test file)
                  </p>
                  <p>
                    <strong>Error Rate:</strong> {stats.system?.errorRate || '0%'} ({stats.system?.errorCount || 0} errors in {stats.system?.totalOperations || 0} operations)
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PerformanceDashboard;