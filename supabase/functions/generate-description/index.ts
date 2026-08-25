// AI opis oglasa (spec 2026-08-25, korak 4: "opis - slobodan ili AI").
// Generira se iz STRUKTURIRANIH podataka (vozilo, atributi, oprema) -
// nikakvo izmisljanje: samo cinjenice koje imamo. Korisnik uvijek moze
// urediti prije objave.
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    return Response.json({ error: 'AI nije konfiguriran' }, { status: 503 });
  }
  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  const {
    data: { user },
  } = await service.auth.getUser(jwt);
  if (!user) return Response.json({ error: 'Neispravna sesija' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    make?: string | null;
    model?: string | null;
    engineLabel?: string | null;
    firstRegistrationYear?: number | null;
    mileageKm?: number | null;
    ownersCount?: number | null;
    serviceBook?: string | null;
    condition?: string | null;
    isNew?: boolean;
    vehicleId?: string | null;
  } | null;
  if (!body?.make || !body.model) {
    return Response.json({ error: 'Nedostaju podaci o vozilu' }, { status: 422 });
  }

  // Oprema iz baze (prevedena, odobrena ili strojna)
  let equipmentNames: string[] = [];
  if (body.vehicleId) {
    const { data } = await service
      .from('vehicle_equipment')
      .select('equipment_codes(name_hr, photo_rank)')
      .eq('vehicle_id', body.vehicleId);
    equipmentNames = (data ?? [])
      .map((r) => r.equipment_codes as { name_hr: string | null; photo_rank: number | null })
      .filter((e) => e?.name_hr)
      .sort((a, b) => (b.photo_rank ?? 0) - (a.photo_rank ?? 0))
      .slice(0, 15)
      .map((e) => e.name_hr!);
  }

  const facts = [
    `Vozilo: ${body.make} ${body.model}${body.engineLabel ? ' ' + body.engineLabel : ''}`,
    body.firstRegistrationYear ? `Prva registracija: ${body.firstRegistrationYear}.` : null,
    body.mileageKm ? `Kilometraza: ${body.mileageKm} km` : null,
    body.ownersCount ? `Broj vlasnika: ${body.ownersCount}` : null,
    body.serviceBook ? `Servisna povijest: ${body.serviceBook}` : null,
    body.condition ? `Stanje: ${body.condition}` : null,
    body.isNew ? 'NOVO VOZILO' : null,
    equipmentNames.length > 0 ? `Istaknuta oprema: ${equipmentNames.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-5',
      max_tokens: 2048,
      system: `Pises opis oglasa za prodaju rabljenog auta na hrvatskom oglasniku wagen.hr.
Pravila:
- ISKLJUCIVO cinjenice iz danih podataka - nista ne izmisljaj i ne pretpostavljaj.
- 3-5 kratkih odlomaka, prirodan prodajni ton bez pretjerivanja i bez fraza tipa "prilika koju ne smijete propustiti".
- Bez naslova, bez cijene (prikazuje se odvojeno), bez kontakt podataka.
- Opremu spomeni prirodno u tekstu, ne kao listu.
- Maksimalno 120 rijeci.`,
      messages: [{ role: 'user', content: facts }],
    }),
  });

  if (!response.ok) {
    return Response.json({ error: 'AI generiranje palo' }, { status: 502 });
  }
  const result = await response.json();
  const description = result.content?.find(
    (b: { type: string; text?: string }) => b.type === 'text',
  )?.text;
  return Response.json({ description: description ?? null });
});
