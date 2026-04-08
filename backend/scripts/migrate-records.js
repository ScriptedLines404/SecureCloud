// backend/scripts/migrate-records.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function migrateRecords() {
    console.log('🔄 Migrating existing registration records...');
    
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    try {
        // Get all users
        const { data: users, error } = await supabase
            .from('users')
            .select('id, email, registration_record');
            
        if (error) throw error;
        
        console.log(`Found ${users.length} users to check`);
        
        for (const user of users) {
            // Check if record is already in new format
            try {
                const parsed = JSON.parse(user.registration_record);
                if (parsed.data) {
                    console.log(`✅ User ${user.email} already in new format`);
                    continue;
                }
            } catch (e) {
                // Not JSON, needs migration
                console.log(`🔄 Migrating user ${user.email}...`);
                
                // Wrap in new format
                const newRecord = {
                    data: user.registration_record,
                    _version: '1.0',
                    _timestamp: new Date().toISOString(),
                    _migrated: true
                };
                
                const { error: updateError } = await supabase
                    .from('users')
                    .update({ registration_record: JSON.stringify(newRecord) })
                    .eq('id', user.id);
                    
                if (updateError) {
                    console.error(`❌ Failed to migrate ${user.email}:`, updateError);
                } else {
                    console.log(`✅ Migrated ${user.email}`);
                }
            }
        }
        
        console.log('✅ Migration complete');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
    }
}

migrateRecords();