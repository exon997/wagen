import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';

/** Service klijent: RLS bypass - worker je jedini pisac videa/eventova. */
export function createService(): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
