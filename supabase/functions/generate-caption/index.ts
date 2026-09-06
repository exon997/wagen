// AlphaOne sadrzajni paket (4.5, pre-launch): caption za drustvene mreze.
// Ulaz: strukturirani podaci vozila; izlaz: kratki FB/IG caption na
// hrvatskom s hashtagovima. Ista facts-only disciplina kao opis oglasa -
// nista se ne izmislja.
import { createClient } from 'npm:@supabase/supabase-js@2';

const MODEL = 'claude-opus-5';

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    return Response.json({ error: 'Caption servis nije konfiguriran' }, { status: 503 });
  }

  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const {
    data: { user },
  } = await service.auth.getUser(jwt);
  if (!user) return Response.json({ error: 'Neispravna sesija' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    make?: string;
    model?: string;
    engineLabel?: string | null;
    year?: number | null;
    priceEur?: number | null;
    mileageKm?: number | null;
    city?: string | null;
    dealerName?: string | null;
    pageUrl?: string | null;
    vehicleId?: string | null;
  } | null;
  if (!body?.make || !body.model) {
    return Response.json({ error: 'Nedostaju podaci o vozilu' }, { status: 422 });
  }

  let equipment: string[] = [];
  if (body.vehicleId) {
    const { data } = await service
      .from('vehicle_equipment')
      .select('equipment_codes (name_hr, name_en, photo_rank)')
      .eq('vehicle_id', body.vehicleId);
    equipment = (data ?? [])
      .map((r) => r.equipment_codes)
      .filter((c): c is NonNullable<typeof c> => !!c)
      .sort((a, b) => (a.photo_rank ?? 99) - (b.photo_rank ?? 99))
      .map((c) => c.name_hr ?? c.name_en ?? '')
      .filter(Boolean)
      .slice(0, 6);
  }

  const facts = [
    `Vozilo: ${body.year ? `${body.year}. ` : ''}${body.make} ${body.model}${body.engineLabel ? ` ${body.engineLabel}` : ''}`,
    body.priceEur ? `Cijena: €${body.priceEur.toLocaleString('de-DE')},-` : null,
    body.mileageKm ? `Kilometraza: ${body.mileageKm.toLocaleString('de-DE')} km` : null,
    body.city ? `Lokacija: ${body.city}` : null,
    body.dealerName ? `Prodavac: ${body.dealerName}` : null,
    equipment.length > 0 ? `Istaknuta oprema: ${equipment.join(', ')}` : null,
    body.pageUrl ? `Link: ${body.pageUrl}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 500,
      system:
        'Pises captione za Facebook/Instagram objave autokuca na hrvatskom. ' +
        'Pravila: koristi ISKLJUCIVO dane cinjenice, nista ne izmisljaj i ne dodaji. ' +
        'Kratko i udarno: 3-6 redaka, smisleni emojiji (umjereno), cijena tocno u danom formatu. ' +
        'Zavrsi s 4-6 relevantnih hashtagova (marka, model, rabljena vozila, hrvatski). ' +
        'Bez poziva na dogovor cijene, bez superlativa o stanju koje ne pise u cinjenicama. ' +
        'Vrati SAMO tekst captiona.',
      messages: [{ role: 'user', content: facts }],
    }),
  });
  const json = (await res.json().catch(() => null)) as {
    content?: { type: string; text?: string }[];
    error?: { message?: string };
  } | null;
  if (!res.ok) {
    return Response.json(
      { error: `AI: ${json?.error?.message?.slice(0, 160) ?? res.status}` },
      { status: 502 },
    );
  }
  const caption = json?.content?.find((c) => c.type === 'text')?.text?.trim();
  if (!caption) return Response.json({ error: 'Prazan odgovor' }, { status: 502 });
  return Response.json({ caption });
});
