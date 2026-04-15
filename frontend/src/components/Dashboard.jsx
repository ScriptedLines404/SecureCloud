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

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FaSignOutAlt,
  FaLock,
  FaSync,
  FaUpload,
  FaKey,
  FaChartLine,
  FaDownload,
  FaSpinner
} from 'react-icons/fa';
import FileUpload from './FileUpload';
import FileList from './FileList';
import MasterKeyModal from './MasterKeyModal';
import PerformanceDashboard from './PerformanceDashboard';
import BatchDownloadModal from './BatchDownloadModal';
import { logout as opaqueLogout } from '../utils/opaque';
import { getMasterKeyFromMemory, clearMasterKeyFromMemory } from '../services/keyManagementService';
import { isGoogleDriveConnected } from '../services/googleDrive';
import { getUserStats } from '../services/metadataService';
import { perfMetrics } from '../utils/performanceMetrics';
import toast from 'react-hot-toast';

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    fileCount: 0,
    storageUsed: '0 MB'
  });
  const [showUpload, setShowUpload] = useState(false);
  const [refreshFiles, setRefreshFiles] = useState(0);
  const [driveConnected, setDriveConnected] = useState(false);
  const [masterKey, setMasterKey] = useState(null);
  const [showMasterKeyModal, setShowMasterKeyModal] = useState(false);
  const [showPerformanceDashboard, setShowPerformanceDashboard] = useState(false);
  const [showBatchDownload, setShowBatchDownload] = useState(false);
  const [inactivityTimer, setInactivityTimer] = useState(null);

  useEffect(() => {
    // Check for authentication
    const token = localStorage.getItem('sessionToken');
    const userId = localStorage.getItem('userId');
    const email = localStorage.getItem('userEmail');
    
    console.log('Dashboard check - token:', !!token, 'userId:', userId);
    
    if (!token || !userId) {
      console.log('No token or userId found, redirecting to login');
      navigate('/login-opaque');
      return;
    }
    
    setUser({
      id: userId,
      email: email || 'user@example.com'
    });
    
    setDriveConnected(isGoogleDriveConnected());
    
    // Check if master key is already in memory (from login)
    const existingKey = getMasterKeyFromMemory(userId);
    if (existingKey) {
      console.log('✅ Master key found in memory from login');
      setMasterKey(existingKey);
    } else {
      console.log('⚠️ No master key in memory - user needs to derive it');
    }
    
    // Load stats
    const loadStats = async () => {
      try {
        const result = await getUserStats(userId);
        if (result?.success) {
          setStats({
            fileCount: result.fileCount || 0,
            storageUsed: result.storageUsed || '0 MB'
          });
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadStats();

    // Set up inactivity timer if master key exists
    if (existingKey) {
      setupInactivityTimer();
    }

    // Add event listeners for user activity
    window.addEventListener('mousemove', resetInactivityTimer);
    window.addEventListener('keydown', resetInactivityTimer);
    window.addEventListener('click', resetInactivityTimer);

    // Clean up on unmount
    return () => {
      clearInactivityTimer();
      window.removeEventListener('mousemove', resetInactivityTimer);
      window.removeEventListener('keydown', resetInactivityTimer);
      window.removeEventListener('click', resetInactivityTimer);
      perfMetrics.destroy(); // Clean up performance metrics
    };
  }, [navigate]);

  // Clear master key on tab close
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (masterKey) {
        for (let i = 0; i < masterKey.length; i++) masterKey[i] = 0;
      }
      clearMasterKeyFromMemory(user?.id);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [masterKey, user?.id]);

  const setupInactivityTimer = () => {
    clearInactivityTimer();
    const timer = setTimeout(() => {
      if (masterKey) {
        console.log('⏰ Inactivity timeout - clearing master key');
        for (let i = 0; i < masterKey.length; i++) masterKey[i] = 0;
        clearMasterKeyFromMemory(user?.id);
        setMasterKey(null);
        toast('Master key cleared due to inactivity. Click "Get Master Key" to re-derive.', {
          icon: '⏰',
          duration: 5000
        });
      }
    }, 15 * 60 * 1000);
    setInactivityTimer(timer);
  };

  const clearInactivityTimer = () => {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      setInactivityTimer(null);
    }
  };

  const resetInactivityTimer = () => {
    if (masterKey) {
      clearInactivityTimer();
      setupInactivityTimer();
    }
  };

  const handleLogout = () => {
    if (masterKey) {
      for (let i = 0; i < masterKey.length; i++) masterKey[i] = 0;
    }
    clearMasterKeyFromMemory(user?.id);
    opaqueLogout();
    navigate('/login-opaque');
  };

  const handleUploadComplete = () => {
    setShowUpload(false);
    const userId = localStorage.getItem('userId');
    if (userId) {
      getUserStats(userId).then(result => {
        if (result?.success) {
          setStats({
            fileCount: result.fileCount || 0,
            storageUsed: result.storageUsed || '0 MB'
          });
        }
      }).catch(console.error);
    }
    setRefreshFiles(prev => prev + 1);
    toast.success('Files uploaded successfully!');
  };

  const refreshFileList = () => {
    setRefreshFiles(prev => prev + 1);
    toast.success('File list refreshed');
  };

  const handleMasterKeySuccess = (key) => {
    setMasterKey(key);
    setupInactivityTimer();
    toast.success('Master key derived successfully!');
  };

  const handleClearMasterKey = () => {
    if (masterKey) {
      for (let i = 0; i < masterKey.length; i++) masterKey[i] = 0;
    }
    clearMasterKeyFromMemory(user?.id);
    setMasterKey(null);
    clearInactivityTimer();
    toast.info('Master key cleared from memory');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your secure dashboard...</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
          <button 
            onClick={handleLogout}
            className="mt-2 px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <MasterKeyModal
        isOpen={showMasterKeyModal}
        onClose={() => setShowMasterKeyModal(false)}
        onSuccess={handleMasterKeySuccess}
      />
      
      {/* Performance Dashboard Modal */}
      {showPerformanceDashboard && (
        <PerformanceDashboard onClose={() => setShowPerformanceDashboard(false)} />
      )}

      {/* Batch Download Modal */}
      {showBatchDownload && (
        <BatchDownloadModal onClose={() => setShowBatchDownload(false)} />
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold text-gray-800">SecureCloud</h1>
              <p className="text-sm text-gray-500 mt-1">Zero-Knowledge Encrypted Storage</p>
            </div>
            <div className="flex items-center space-x-4">
              {/* Batch Download Button */}
              <button
                onClick={() => {
                  if (!masterKey) {
                    toast.error('Please derive master key first');
                    setShowMasterKeyModal(true);
                    return;
                  }
                  setShowBatchDownload(true);
                }}
                className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                title="Download All Files"
              >
                <FaDownload className="mr-2 text-blue-600" />
                Download All
              </button>
              
              {/* Performance Dashboard Button */}
              <button
                onClick={() => setShowPerformanceDashboard(true)}
                className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                title="Performance Metrics"
              >
                <FaChartLine className="mr-2 text-green-600" />
                Performance
              </button>
              
              <div className="text-right">
                <p className="text-sm font-medium text-gray-700">
                  Welcome back, {user?.email?.split('@')[0] || 'User'}!
                </p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <FaSignOutAlt className="mr-2" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Master Key Status */}
        <div className="mb-6">
          {masterKey ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex justify-between items-center">
              <div className="flex items-center text-green-700">
                <FaLock className="mr-2" />
                <span className="font-medium">✓ Master key active in memory</span>
                <span className="text-xs ml-2 bg-green-200 px-2 py-1 rounded">
                  Auto-clears after 15 min inactivity
                </span>
              </div>
              <button
                onClick={handleClearMasterKey}
                className="text-xs text-green-600 hover:text-green-800 underline"
              >
                Clear Key
              </button>
            </div>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center text-yellow-700">
                  <FaLock className="mr-2 text-yellow-600" />
                  <span>🔑 Master key not in memory. Derive it to encrypt/decrypt files.</span>
                </div>
                <button
                  onClick={() => setShowMasterKeyModal(true)}
                  className="flex items-center px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
                >
                  <FaKey className="mr-2" />
                  Get Master Key
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Storage Overview */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Your Secure Storage</h2>
            <p className="text-4xl font-bold text-blue-600 mb-1">{stats.fileCount} files</p>
            <p className="text-gray-500">{stats.storageUsed} used • End-to-end encrypted</p>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <button
              onClick={() => {
                if (!masterKey) {
                  toast.error('Please derive master key first');
                  setShowMasterKeyModal(true);
                  return;
                }
                setShowUpload(!showUpload);
              }}
              className={`flex flex-col items-center justify-center p-4 border rounded-xl transition-colors ${
                masterKey 
                  ? 'border-gray-200 hover:bg-gray-50 hover:border-blue-300' 
                  : 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-50'
              }`}
              disabled={!masterKey}
              title={!masterKey ? 'Get master key first' : 'Upload Files'}
            >
              <FaUpload className={`text-2xl mb-2 ${masterKey ? 'text-blue-600' : 'text-gray-400'}`} />
              <span className="text-sm font-medium text-gray-700">Upload Files</span>
            </button>
            
            <button 
              onClick={refreshFileList}
              className="flex flex-col items-center justify-center p-4 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-blue-300 transition-colors"
            >
              <FaSync className="text-2xl mb-2 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">Refresh</span>
            </button>

            <button
              onClick={() => setShowMasterKeyModal(true)}
              className={`flex flex-col items-center justify-center p-4 border rounded-xl transition-colors ${
                masterKey 
                  ? 'border-green-200 bg-green-50 hover:bg-green-100' 
                  : 'border-gray-200 hover:bg-gray-50 hover:border-blue-300'
              }`}
              title={masterKey ? 'Master key already loaded' : 'Get master key'}
            >
              <FaKey className={`text-2xl mb-2 ${masterKey ? 'text-green-600' : 'text-blue-600'}`} />
              <span className="text-sm font-medium text-gray-700">
                {masterKey ? 'Key Loaded' : 'Get Master Key'}
              </span>
            </button>

            {/* Performance Button */}
            <button
              onClick={() => setShowPerformanceDashboard(true)}
              className="flex flex-col items-center justify-center p-4 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-purple-300 transition-colors"
            >
              <FaChartLine className="text-2xl mb-2 text-purple-600" />
              <span className="text-sm font-medium text-gray-700">Performance</span>
            </button>

            {/* Batch Download Button */}
            <button
              onClick={() => {
                if (!masterKey) {
                  toast.error('Please derive master key first');
                  setShowMasterKeyModal(true);
                  return;
                }
                setShowBatchDownload(true);
              }}
              disabled={!masterKey}
              className={`flex flex-col items-center justify-center p-4 border rounded-xl transition-colors ${
                masterKey 
                  ? 'border-gray-200 hover:bg-gray-50 hover:border-blue-300' 
                  : 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-50'
              }`}
              title={!masterKey ? 'Get master key first' : 'Download all files as ZIP'}
            >
              <FaDownload className={`text-2xl mb-2 ${masterKey ? 'text-blue-600' : 'text-gray-400'}`} />
              <span className="text-sm font-medium text-gray-700">Download All</span>
            </button>
          </div>

          {/* Upload Section */}
          {showUpload && (
            <div className="mb-8">
              <FileUpload onUploadComplete={handleUploadComplete} />
            </div>
          )}

          {/* Google Drive Connection Status */}
          {!driveConnected && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700">
              ⚠️ Google Drive not connected. Click "Upload Files" to connect.
            </div>
          )}

          {/* Files List */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Your Files</h3>
              <span className="text-sm text-gray-500">{stats.fileCount} total</span>
            </div>
            <FileList refresh={refreshFiles} />
          </div>
        </div>

        {/* Security Notice */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
          <FaLock className="inline-block text-blue-600 mr-2" />
          <span className="text-blue-800">
            Master key stored only in memory • Auto-clears after 15 minutes of inactivity
          </span>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;