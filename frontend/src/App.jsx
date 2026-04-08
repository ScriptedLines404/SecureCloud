// frontend/src/App.jsx - Complete with all routes
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import LoginOpaque from './components/LoginOpaque';
import SignupOpaque from './components/SignupOpaque';
import Dashboard from './components/Dashboard';
import SharedFileViewer from './components/SharedFileViewer';
import PrivateShareViewer from './components/PrivateShareViewer';
import './index.css';

// Protected Route component
const ProtectedRoute = ({ children }) => {
  const sessionToken = localStorage.getItem('sessionToken');
  const userId = localStorage.getItem('userId');
  
  if (!sessionToken || !userId) {
    return <Navigate to="/login-opaque" replace />;
  }
  
  return children;
};

function App() {
  return (
    <Router>
      <div className="App">
        <Toaster 
          position="top-right"
          toastOptions={{
            duration: 4000,
            success: { 
              duration: 3000,
              style: {
                background: '#10b981',
                color: '#white',
              },
            },
            error: { 
              duration: 4000,
              style: {
                background: '#ef4444',
                color: 'white',
              },
            },
          }}
        />
        
        <Routes>
          {/* Public Auth Routes */}
          <Route path="/login-opaque" element={<LoginOpaque />} />
          <Route path="/signup-opaque" element={<SignupOpaque />} />
          
          {/* Protected Dashboard */}
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } 
          />
          
          {/* Share Routes - Public Access */}
          <Route path="/shared/:shareToken" element={<SharedFileViewer />} />
          <Route path="/private/:shareToken" element={<PrivateShareViewer />} />
          
          {/* Default Routes */}
          <Route path="/" element={<Navigate to="/login-opaque" replace />} />
          <Route path="*" element={<Navigate to="/login-opaque" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;