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

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

/**
 * Initialize database with clean schema
 * Creates users, files, and user_keys tables
 */
async function initializeDatabase() {
    console.log('\n🚀 Initializing Database Schema\n');
    
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('❌ Missing Supabase environment variables');
        console.error('Please ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env');
        process.exit(1);
    }
    
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    try {
        console.log('Creating database tables...\n');
        console.log('⚠️  Please run the following SQL in your Supabase SQL Editor:\n');
        
        console.log(`
-- Drop existing tables if they exist (in correct order due to foreign keys)
DROP TABLE IF EXISTS files CASCADE;
DROP TABLE IF EXISTS user_keys CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Create users table (OPAQUE authentication)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    registration_record TEXT NOT NULL,
    failed_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'),
    CONSTRAINT failed_attempts_range CHECK (failed_attempts >= 0)
);

-- Create user_keys table (wrapped master encryption keys)
CREATE TABLE IF NOT EXISTS user_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wrapped_mek TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Create files table (file metadata)
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    original_file_name TEXT,
    file_size BIGINT NOT NULL,
    file_type TEXT,
    drive_file_id TEXT NOT NULL,
    drive_file_name TEXT,
    drive_file_url TEXT,
    encrypted BOOLEAN DEFAULT true,
    encryption_version TEXT DEFAULT 'AES-GCM-256',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_locked ON users(locked_until) WHERE locked_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_keys_user_id ON user_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_drive_file_id ON files(drive_file_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers
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

-- Enable RLS but allow service role full access
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access on users" ON users
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access on user_keys" ON user_keys
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access on files" ON files
    USING (true)
    WITH CHECK (true);
        `);
        
        console.log('\n✅ After running the SQL above, your database will be ready.\n');

    } catch (error) {
        console.error('\n❌ Database initialization failed:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    initializeDatabase();
}

module.exports = { initializeDatabase };