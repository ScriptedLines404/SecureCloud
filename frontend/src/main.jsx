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

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { perfMetrics } from './utils/performanceMetrics';

// Make perfMetrics available globally for other modules
window.perfMetrics = perfMetrics;

// Log performance monitoring status
console.log('📊 Performance metrics monitoring enabled');
console.log(`   Session ID: ${perfMetrics.sessionId}`);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);