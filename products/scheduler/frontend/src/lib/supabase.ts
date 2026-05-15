/**
 * Supabase client initialisation.
 *
 * The client is constructed only when both ``VITE_SUPABASE_URL`` and
 * ``VITE_SUPABASE_ANON_KEY`` are configured. Otherwise we export
 * ``null`` and the rest of the app (AuthProvider, axios interceptor,
 * route guard) treats that as the local-dev bypass — matching the
 * backend's ``get_current_user`` behaviour when ``SUPABASE_URL`` is
 * blank. This keeps the dev experience friction-free without forcing
 * every contributor to spin up a Supabase project.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export const isAuthConfigured = supabase !== null;
