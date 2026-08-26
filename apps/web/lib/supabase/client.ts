'use client';

import { createWebBrowserClient } from '@wagen/supabase';

/** Browser Supabase client (RLS applies). */
export function createClient() {
  return createWebBrowserClient({
    url: process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    publishableKey: process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']!,
  });
}
