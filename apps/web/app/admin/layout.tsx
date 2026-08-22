import Link from 'next/link';
import type { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/server';

/**
 * wagen admin (18.3): interni alat iza admin role - "nije proizvod, ne trosi
 * se dizajn na njega". Pet queue pogleda nad postojecim tablicama; pogledi
 * rastu po sprintovima, temelj odmah.
 *
 * Admin = JWT app_metadata.role claim (isti izvor kao RLS is_admin(), B9).
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = (user?.app_metadata as Record<string, unknown> | undefined)?.['role'];
  if (!user || role !== 'admin') {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui' }}>
        <h1>403</h1>
        <p>Pristup dopusten samo administratorima.</p>
      </main>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui' }}>
      <nav style={{ width: 220, borderRight: '1px solid #ddd', padding: 16 }}>
        <p style={{ fontWeight: 700 }}>wagen admin</p>
        <ul style={{ listStyle: 'none', padding: 0, lineHeight: 2 }}>
          <li>
            <Link href="/admin/trgovci">Aktivacija trgovaca</Link>
          </li>
          <li>
            <Link href="/admin/moderacija">Moderacija</Link>
          </li>
          <li>
            <Link href="/admin/prijevodi">Prijevodi opreme</Link>
          </li>
          <li>
            <Link href="/admin/tekstovi">Tekstovi modela</Link>
          </li>
          <li>
            <Link href="/admin/faza0">Metrike Faze 0</Link>
          </li>
        </ul>
      </nav>
      <main style={{ flex: 1, padding: 24 }}>{children}</main>
    </div>
  );
}
