/**
 * Supabase Client
 *
 * Single shared instance used across the entire app.
 * Credentials are pulled from Vite environment variables — never hardcoded.
 *
 * Usage:
 *   import { supabase } from '@lib/supabase/client';
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file.'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persist session in localStorage so users stay logged in across page refreshes
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
