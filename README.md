# SecureCloud v1.0.0 - Zero-Knowledge File Encryptor for Cloud Storage

## 🚀 Overview

SecureCloud acts as an intermediate layer between the user and the cloud storage provider, enabling users to encrypt their files before they ever reach the cloud provider. It is a zero-knowledge, end-to-end encrypted file encryptor that ensures your data remains protected even if the cloud storage provider is compromised.

The application provides two distinct sharing mechanisms: public link sharing (similar to Google Drive's "anyone with the link can view" functionality) and secure person-specific sharing (requiring email OTP verification). Both methods ensure that encryption keys never touch the server—keys are either embedded in the URL fragment (public shares) or derived from the recipient's verified email address (private shares).

## 🔐 Security Features

- **OPAQUE Protocol (RFC 9380)** - Password-authenticated key exchange with zero-knowledge proofs
- **End-to-End Encryption** - Files encrypted with AES-256-GCM before upload
- **Master Key Architecture** - Single master key derived from your password, never stored on server
- **Per-File Encryption Keys** - Each file has its own derived key for cryptographic isolation
- **Secure Key Wrapping** - Master key wrapped with KEK derived from OPAQUE export key
- **Web Crypto API Only** - No external crypto libraries, uses browser's native cryptographic functions
- **Constant-Time Comparisons** - Prevents timing attacks on sensitive operations
- **Rate Limiting & Account Lockout** - Protection against brute force attacks

## 📁 File Management

- **Secure Upload/Download** - Files encrypted client-side, stored encrypted on Google Drive
- **File Name Encryption** - Original filenames are never exposed to the server
- **Metadata Separation** - File metadata stored separately from encrypted content
- **Google Drive Integration** - Leverages Google Drive as secure encrypted storage backend

## 🔗 Secure Sharing

- **Public Shares** - Anyone with the link can access (includes encryption key in URL fragment)
- **Private Shares** - Email verification required, key derived from recipient's email
- **Expiring Links** - Configurable expiration dates for shares
- **Access Tracking** - Monitor how many times a share has been accessed

## 📊 Performance Monitoring

- **Built-in Performance Dashboard** - Track encryption/decryption speeds
- **Throughput Metrics** - Measure MB/s for different file sizes
- **Size-Based Categorization** - Performance data organized by test file sizes (1KB to 100MB)
- **CSV/JSON Export** - Export metrics for research or analysis

## 🛠️ Technical Stack

### Frontend
- React 18 with Vite
- Tailwind CSS for styling
- Web Crypto API for all cryptographic operations
- Supabase SDK for metadata storage

### Backend
- Node.js with Express
- Supabase (PostgreSQL) for user metadata
- Web Crypto API for OPAQUE server implementation
- Nodemailer for email verification

## 🚦 Getting Started

### Prerequisites
- Node.js 18+
- Supabase account
- Google Cloud Console account (for Drive API)

### Quick Start

1. **Clone the repository**
```bash
git clone https://github.com/ScriptedLines404/SecureCloud.git
cd securecloud
```

2. **Set up environment variables**
backend/.env
```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPAQUE_SERVER_PRIVATE_KEY=your_generated_key
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
````

frontend/.env
```
VITE_GOOGLE_CLIENT_ID=your_google_client_id
VITE_GOOGLE_API_KEY=your_google_api_key
```

3. **Generate OPAQUE server key**
```
cd backend
npm run generate-server-key.js
```

4. **Initialize database**
```
npm run init-db
```

5. **Install dependencies & run**
```
# Backend
cd backend
npm install
npm run dev

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```
## 📋 Database Schema

Run the SQL script in your Supabase SQL editor to create:

- **users** - User accounts with OPAQUE registration records
- **user_keys** - Wrapped master encryption keys
- **files** - File metadata mapping to Google Drive
- **shares** - Share links with access controls
- **share_keys** - Wrapped keys for shared access
```
-- =====================================================
-- SecureCloud Database Schema
-- Zero-Knowledge Encrypted Cloud Storage
-- =====================================================

-- Drop existing tables if they exist (in correct order due to foreign keys)
DROP TABLE IF EXISTS share_keys CASCADE;
DROP TABLE IF EXISTS shares CASCADE;
DROP TABLE IF EXISTS files CASCADE;
DROP TABLE IF EXISTS user_keys CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- =====================================================
-- USERS TABLE
-- Stores user accounts with OPAQUE registration records
-- =====================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    registration_record TEXT NOT NULL,
    failed_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT failed_attempts_range CHECK (failed_attempts >= 0)
);

-- =====================================================
-- USER_KEYS TABLE
-- Stores wrapped master encryption keys for each user
-- =====================================================
CREATE TABLE user_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wrapped_mek TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    key_version INTEGER DEFAULT 1,
    
    -- Constraints
    UNIQUE(user_id)
);

-- =====================================================
-- FILES TABLE
-- Stores file metadata mapping to Google Drive
-- =====================================================
CREATE TABLE files (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    file_type TEXT,
    drive_file_id TEXT NOT NULL,
    drive_file_url TEXT,
    encrypted BOOLEAN DEFAULT TRUE,
    encryption_version TEXT DEFAULT 'AES-GCM-256',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    drive_file_name TEXT,
    original_file_name TEXT,
    folder_id UUID,
    
    -- Constraints
    CONSTRAINT file_size_positive CHECK (file_size >= 0)
);

-- =====================================================
-- SHARES TABLE
-- Stores share links with access controls
-- =====================================================
CREATE TABLE shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    share_token TEXT NOT NULL UNIQUE,
    share_type TEXT NOT NULL,
    target_email TEXT,
    access_count INTEGER DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    email_verified BOOLEAN DEFAULT FALSE,
    
    -- Constraints
    CONSTRAINT share_type_check CHECK (share_type IN ('public', 'private')),
    CONSTRAINT valid_email CHECK (target_email IS NULL OR target_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- =====================================================
-- SHARE_KEYS TABLE
-- Stores wrapped keys for shared access
-- =====================================================
CREATE TABLE share_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    share_id UUID REFERENCES shares(id) ON DELETE CASCADE,
    wrapped_key TEXT NOT NULL,
    key_version TEXT DEFAULT '1.0',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Users table indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_locked_until ON users(locked_until) WHERE locked_until IS NOT NULL;

-- Files table indexes
CREATE INDEX idx_files_user_id ON files(user_id);
CREATE INDEX idx_files_drive_file_id ON files(drive_file_id);
CREATE INDEX idx_files_created_at ON files(created_at DESC);
CREATE INDEX idx_files_deleted_at ON files(deleted_at) WHERE deleted_at IS NOT NULL;

-- Shares table indexes
CREATE INDEX idx_shares_share_token ON shares(share_token);
CREATE INDEX idx_shares_user_id ON shares(user_id);
CREATE INDEX idx_shares_file_id ON shares(file_id);
CREATE INDEX idx_shares_expires_at ON shares(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_shares_target_email ON shares(target_email) WHERE target_email IS NOT NULL;
CREATE INDEX idx_shares_share_type ON shares(share_type);

-- Share keys table indexes
CREATE INDEX idx_share_keys_file_id ON share_keys(file_id);
CREATE INDEX idx_share_keys_share_id ON share_keys(share_id);

-- User keys table indexes
CREATE INDEX idx_user_keys_user_id ON user_keys(user_id);

-- =====================================================
-- TRIGGERS FOR UPDATED_AT
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to tables
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_keys_updated_at
    BEFORE UPDATE ON user_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_files_updated_at
    BEFORE UPDATE ON files
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shares_updated_at
    BEFORE UPDATE ON shares
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- FUNCTION: INCREMENT SHARE ACCESS COUNT
-- =====================================================
CREATE OR REPLACE FUNCTION increment_share_access(share_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE shares 
    SET access_count = access_count + 1 
    WHERE id = share_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_keys ENABLE ROW LEVEL SECURITY;

-- Create policies for service role (full access)
CREATE POLICY "Service role has full access on users" ON users
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access on user_keys" ON user_keys
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access on files" ON files
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access on shares" ON shares
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access on share_keys" ON share_keys
    USING (true)
    WITH CHECK (true);

-- =====================================================
-- VERIFICATION QUERIES
-- Run these to verify your setup
-- =====================================================

-- Check all tables were created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Check all indexes were created
SELECT indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
ORDER BY indexname;
```

## 🔒 Security Assurances

- ✅ **No password storage** - Only OPAQUE registration records
- ✅ **No key storage** - Master key never persists on server
- ✅ **Zero-knowledge architecture** - Server cannot decrypt your files
- ✅ **Forward secrecy** - Session keys derived per login
- ✅ **Replay attack protection** - Timestamp validation on requests

## 🧪 Tested File Sizes

Performance validated for:

- 1KB, 50KB, 100KB, 200KB, 500KB
- 1MB, 5MB, 10MB, 20MB, 50MB, 100MB

## 📝 Known Limitations

- Google Drive API requires OAuth consent screen verification for production
- Email verification requires SMTP configuration (Gmail App Password recommended)
- Large files (>100MB) may experience performance degradation

## 🗺️ Roadmap

- [ ] Mobile application (React Native)
- [ ] Two-factor authentication support
- [ ] File versioning and history
- [ ] Team/organization sharing
- [ ] End-to-end encrypted chat
- [ ] Self-hosted storage backend option

## 🤝 Contributing

Contributions welcome! Please read our contributing guidelines before submitting PRs.

## License

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0)**.

### You are free to:
- **Use** the software for any purpose
- **Modify** the software to suit your needs
- **Distribute** copies of the software
- **Sell** the software (but must provide source code)

### Under the following conditions:
- **Share Changes** - If you modify and distribute the software, you must release your modifications under GPL-3.0
- **Disclose Source** - If you distribute the software, you must provide access to the source code
- **Same License** - Derivative works must be licensed under GPL-3.0
- **No Additional Restrictions** - You cannot add legal terms that restrict others from doing what the license allows

### This means:
✅ Commercial use is allowed  
✅ Selling the software is allowed  
✅ Modifying for personal use is allowed  
❌ Making closed-source derivatives is NOT allowed  
❌ Distributing without source code is NOT allowed  

See the [LICENSE](LICENSE) file for the full license text.

## ⚠️ Disclaimer

This software was developed for educational and research purposes. While built with security best practices, please conduct your own security audit before using for sensitive data in production.
