import { cookies } from 'next/headers';
import { createWebServerClient } from '@wagen/supabase';

/** Server-component / route-handler Supabase client (RLS applies). */
export async function createClient() {
  const cookieStore = await cookies();

  return createWebServerClient(
    {
      url: process.env['NEXT_PUBLIC_SUPABASE_URL']!,
      publishableKey: process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']!,
    },
    {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server components cannot set cookies - middleware refreshes the
          // session; safe to ignore here.
        }
      },
    },
  );
}
