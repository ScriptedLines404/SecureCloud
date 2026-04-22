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

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Generate a stable OPAQUE server private key
 * This key MUST be generated once and never changed
 * Store it in Supabase secrets or .env file
 */
function generateServerKey() {
    console.log('\n🔐 OPAQUE Server Key Generation (Phase 3)\n');
    console.log('Generating 32-byte (256-bit) server private key...');
    
    // Generate cryptographically secure random 32 bytes
    const serverPrivateKey = crypto.randomBytes(32);
    
    // Convert to base64 for storage
    const base64Key = serverPrivateKey.toString('base64');
    
    console.log('\n✅ Key generated successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Key Details:');
    console.log(`  • Raw length: ${serverPrivateKey.length} bytes`);
    console.log(`  • Bit strength: ${serverPrivateKey.length * 8} bits`);
    console.log(`  • Base64 format: ${base64Key}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Create .env file entry
    const envEntry = `OPAQUE_SERVER_PRIVATE_KEY=${base64Key}`;
    
    console.log('\n📝 Add this to your .env file:');
    console.log(envEntry);
    
    // Optionally write to .env file
    const envPath = path.join(__dirname, '..', '.env');
    let envContent = '';
    
    if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
        
        // Check if key already exists
        if (envContent.includes('OPAQUE_SERVER_PRIVATE_KEY=')) {
            console.log('\n⚠️  OPAQUE_SERVER_PRIVATE_KEY already exists in .env');
            console.log('   Replace it manually with the new key above');
        } else {
            // Append to existing .env
            fs.appendFileSync(envPath, `\n${envEntry}\n`);
            console.log('\n✅ Key appended to .env file');
        }
    } else {
        // Create new .env file
        fs.writeFileSync(envPath, `${envEntry}\n`);
        console.log('\n✅ Created .env file with new key');
    }
    
    console.log('\n⚠️  IMPORTANT SECURITY NOTES:');
    console.log('  • NEVER commit this key to version control');
    console.log('  • Store a backup in a secure password manager');
    console.log('  • If lost, all existing user accounts become inaccessible');
    console.log('  • This key must remain stable for the lifetime of the application');
    console.log('\n✅ Server key generated and stored\n');
}

// Run if called directly
if (require.main === module) {
    generateServerKey();
}

module.exports = { generateServerKey };