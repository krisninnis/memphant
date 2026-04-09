/**
 * Supabase client singleton.
 * Returns null when env vars are not set — the rest of the app
 * checks `cloudAvailable` before attempting any network calls.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const cloudAvailable: boolean = Boolean(
  url && url.startsWith('https://') && key && key.length > 20,
);

export const supabase: SupabaseClient | null = cloudAvailable
  ? createClient(url!, key!)
  : null;
