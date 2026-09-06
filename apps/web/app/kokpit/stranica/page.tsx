import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { StranicaForma } from './forma';

export const dynamic = 'force-dynamic';

/** Kokpit: uredjivanje javne stranice salona (wagen.hr/{slug}, 18.1). */
export default async function StranicaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui' }}>
        <p>
          Prijava je istekla - <Link href="/kokpit">natrag na Kokpit</Link>
        </p>
      </main>
    );
  }

  const { data: dealerRows } = await supabase.rpc('my_dealer');
  const dealer = Array.isArray(dealerRows) ? dealerRows[0] : dealerRows;
  if (!dealer) {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui' }}>
        <p>Ovaj racun nije povezan sa salonom.</p>
      </main>
    );
  }

  const { data: page } = await supabase
    .from('dealer_pages')
    .select('slug, is_published, about, phone, email, address, city, working_hours, website')
    .eq('dealer_id', dealer.dealer_id)
    .maybeSingle();

  return (
    <StranicaForma
      dealerId={dealer.dealer_id}
      displayName={dealer.display_name}
      initial={page}
    />
  );
}
