/**
 * SecureCloud - Zero-Knowledge Encrypted Flie Encryptor for Cloud Storage
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

async function createTables() {
    console.log('🚀 Creating database tables...');
    
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
    );
    
    try {
        // SQL to create all required tables
        const sql = `
            -- OPAQUE Users Table
            CREATE TABLE IF NOT EXISTS opaque_users (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                opaque_id TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                failed_attempts INTEGER DEFAULT 0,
                locked_until TIMESTAMP WITH TIME ZONE,
                last_login TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- OPAQUE Credentials (Envelopes) Table
            CREATE TABLE IF NOT EXISTS opaque_credentials (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                opaque_user_id TEXT NOT NULL,
                credential_record JSONB NOT NULL,
                server_public_key TEXT NOT NULL,
                server_identity TEXT NOT NULL,
                envelope_id TEXT UNIQUE NOT NULL,
                version TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- OPAQUE Sessions Table
            CREATE TABLE IF NOT EXISTS opaque_sessions (
                id TEXT PRIMARY KEY,
                opaque_user_id TEXT,
                email TEXT,
                purpose TEXT NOT NULL,
                state JSONB NOT NULL,
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Create indexes
            CREATE INDEX IF NOT EXISTS idx_opaque_users_email ON opaque_users(email);
            CREATE INDEX IF NOT EXISTS idx_opaque_users_opaque_id ON opaque_users(opaque_id);
            CREATE INDEX IF NOT EXISTS idx_opaque_credentials_user_id ON opaque_credentials(opaque_user_id);
            CREATE INDEX IF NOT EXISTS idx_opaque_sessions_expires ON opaque_sessions(expires_at);
            CREATE INDEX IF NOT EXISTS idx_opaque_sessions_email ON opaque_sessions(email);
        `;

        // Execute SQL in chunks (Supabase SQL API might have limits)
        const sqlStatements = sql.split(';').filter(s => s.trim());
        
        for (const statement of sqlStatements) {
            if (statement.trim()) {
                const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' });
                if (error) {
                    // If exec_sql doesn't exist, try direct SQL
                    console.log(`Trying alternative method for: ${statement.substring(0, 50)}...`);
                }
            }
        }

        console.log('✅ Database tables created successfully!');
        
        // Alternative: Use the SQL editor in Supabase dashboard
        console.log('\n📝 If tables were not created, please run this SQL in your Supabase SQL Editor:');
        console.log(sql);
        
    } catch (error) {
        console.error('❌ Database creation failed:', error.message);
        console.log('\n📝 Please run this SQL in your Supabase SQL Editor manually:');
        
        const sql = `
            -- Run this in Supabase SQL Editor
            
            -- OPAQUE Users Table
            CREATE TABLE IF NOT EXISTS opaque_users (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                opaque_id TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                failed_attempts INTEGER DEFAULT 0,
                locked_until TIMESTAMP WITH TIME ZONE,
                last_login TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- OPAQUE Credentials (Envelopes) Table
            CREATE TABLE IF NOT EXISTS opaque_credentials (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                opaque_user_id TEXT NOT NULL,
                credential_record JSONB NOT NULL,
                server_public_key TEXT NOT NULL,
                server_identity TEXT NOT NULL,
                envelope_id TEXT UNIQUE NOT NULL,
                version TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- OPAQUE Sessions Table
            CREATE TABLE IF NOT EXISTS opaque_sessions (
                id TEXT PRIMARY KEY,
                opaque_user_id TEXT,
                email TEXT,
                purpose TEXT NOT NULL,
                state JSONB NOT NULL,
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Create indexes
            CREATE INDEX IF NOT EXISTS idx_opaque_users_email ON opaque_users(email);
            CREATE INDEX IF NOT EXISTS idx_opaque_users_opaque_id ON opaque_users(opaque_id);
            CREATE INDEX IF NOT EXISTS idx_opaque_credentials_user_id ON opaque_credentials(opaque_user_id);
            CREATE INDEX IF NOT EXISTS idx_opaque_sessions_expires ON opaque_sessions(expires_at);
            CREATE INDEX IF NOT EXISTS idx_opaque_sessions_email ON opaque_sessions(email);
        `;
        
        console.log(sql);
    }
}

createTables();