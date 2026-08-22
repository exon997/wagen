/**
 * Supabase clients for every runtime - one package, three factories.
 * Generated DB types live in ./types.ts (regenerate: pnpm db:types).
 */
import { createBrowserClient, createServerClient, type CookieMethodsServer } from '@supabase/ssr';
import { createClient, type SupabaseClientOptions } from '@supabase/supabase-js';

import type { Database } from './types';

export type { Database } from './types';

export interface SupabaseConfig {
  url: string;
  /** Publishable key (sb_publishable_...) - safe for clients. */
  publishableKey: string;
}

/** Next.js browser components. */
export function createWebBrowserClient({ url, publishableKey }: SupabaseConfig) {
  return createBrowserClient<Database>(url, publishableKey);
}

/**
 * Next.js server components / route handlers. Cookie methods come from the
 * caller (next/headers) so this package stays framework-agnostic.
 */
export function createWebServerClient(
  { url, publishableKey }: SupabaseConfig,
  cookies: CookieMethodsServer,
) {
  return createServerClient<Database>(url, publishableKey, { cookies });
}

/**
 * Expo / React Native. Storage is injected (AsyncStorage or SecureStore
 * adapter) so this package does not depend on react-native.
 */
export function createExpoClient(
  { url, publishableKey }: SupabaseConfig,
  storage: NonNullable<NonNullable<SupabaseClientOptions<'public'>['auth']>['storage']>,
) {
  return createClient<Database>(url, publishableKey, {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      // Deep links are handled explicitly (5.2), not by URL sniffing.
      detectSessionInUrl: false,
    },
  });
}

/**
 * Node worker / server-side jobs. Uses the SECRET key - bypasses RLS.
 * Never import this from web or mobile code.
 */
export function createServiceClient(url: string, secretKey: string) {
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
