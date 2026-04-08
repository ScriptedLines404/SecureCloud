import { createClient } from '@supabase/supabase-js';

// Use service role key for direct database access (keep this secure!)
// In production, you'd want to use environment variables
const supabaseUrl = 'https://fgbroytazaxzbsbemhxa.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnYnJveXRhemF4emJzYmVtaHhhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDEyOTMyMywiZXhwIjoyMDg1NzA1MzIzfQ.ggb3GLQOsj0JFJKtGcgMYyqTICbqQcXywQdoxBuKpKU';

export const supabase = createClient(supabaseUrl, supabaseServiceKey);