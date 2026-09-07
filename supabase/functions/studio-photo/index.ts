// I2-cloud: AI studio obrada fotografija (odluka 2026-08-25, terenski
// dokazano na M340d i X3 primjercima - "auto iz kataloga").
//
// Zasto server-side: on-device pipeline (segmentacija + predlozak) nikad ne
// rjesava refleksije na laku; AI ureduje koherentno. Kljuc i promptovi zive
// ovdje - app salje fotku (base64 JPEG), dobiva studio verziju natrag.
// Registarske tablice app zamucuje NA UREDJAJU prije slanja (privatnost).
//
// Adapter napomena: Gemini je prvi pruzatelj; model i promptovi su
// koncentrirani u konstantama ispod da zamjena bude jednorednska.
import { createClient } from 'npm:@supabase/supabase-js@2';

const MODEL = 'gemini-3.1-flash-image';

// Promptovi su na engleskom (bolji rezultati) i namjerno inzistiraju na
// vjernosti znacki/natpisa - trziste oglasa zahtijeva dokaznu vjernost.
const PROMPT_EXTERIOR =
  'Photo edit for a used-car marketplace listing. Replace ONLY the background and the ground ' +
  'with a premium automotive photo studio: seamless light-gray walls, subtly reflective dark ' +
  'floor with a soft natural reflection and grounded shadow under the car, soft diffused ' +
  'lighting. The vehicle itself is EVIDENCE and must stay absolutely identical to the input: ' +
  'do NOT redesign or regenerate any part - body panels, headlights, taillights, grille, ' +
  'wheels, tires and window tint must match pixel-for-pixel. EXTREME CARE with small emblems ' +
  'and lettering: manufacturer roundels on hood/trunk/wheel center caps, trim badges on the ' +
  'fenders and model lettering must remain perfectly crisp, correctly drawn and undistorted - ' +
  'copy them from the source, never redraw from imagination. Keep the license plate exactly ' +
  'as in the source, including any blur applied to it. Same camera angle, crop and ' +
  'proportions. Photorealistic.';

// Dealer branding (Faza A, sekcija 9): pozadina salona je referentni
// BACKDROP (IMAGE 2). Terenske lekcije: (2026-08-26) prompt mora biti
// UREDI FOTKU 1, ne "smjesti auto u prostor"; (2026-09-07) backdrop se
// tretira kao RAVNI printani zid i ZABRANJUJE se izmisljanje stropova/
// rasvjete - inace svaka fotka sesije dobije drugaciju interpretaciju.
// Konzistentnost sesije: prva uspjesna studio fotka postaje referenca
// (IMAGE 3) za sve sljedece fotke iste sesije.
const PROMPT_EXTERIOR_BRANDED =
  'Edit the FIRST image (a car photo). The SECOND image is the dealership branded ' +
  'studio BACKDROP - a flat printed wall design. Replace the entire background of the ' +
  'first photo so the car stands in a clean studio in front of EXACTLY this backdrop: ' +
  'reproduce its gradient, colors and logos faithfully (logos readable and undistorted). ' +
  'Do NOT invent any other environment elements: no ceilings, no visible light fixtures, ' +
  'no windows, no props. The ground the car stands on IS the lower portion of the SECOND ' +
  'image: continue its exact colors and gradient onto the floor (do NOT darken, recolor or ' +
  'replace it), but render that floor as a polished showroom surface with a CLEAR soft ' +
  'mirror reflection of the car beneath it. The final background from top to bottom must ' +
  'look like the SECOND image. The car must sit firmly grounded on that floor with a ' +
  'natural contact shadow - never floating - keeping EXACTLY the same position, size, crop ' +
  'and camera angle as in the FIRST image. This is a background replacement, NOT a scene ' +
  'composition: pixel-faithful body panels, lights, grille, wheels, tires, window tint and ' +
  'emblems; never redraw them. CRITICAL: the output must contain ONLY that one vehicle - ' +
  'remove every other vehicle, person and object from the original photo (parked cars, ' +
  'buildings, bins, equipment). Photorealistic, high-end dealership listing quality.';

// Tablice: deterministicka grafika (na uredjaju) ima prednost; ovo je
// mrezica za slucaj kad OCR detekcija promasi (2026-09-07: count 0 na
// sve tri Mini fotke) - AI zamjenjuje registraciju cistom plocicom s
// natpisom salona.
const promptPlates = (dealerName: string) =>
  ` License plate rule: if the plate already carries a branded graphic overlay, keep it ` +
  `pixel-faithful. If it still shows a real registration, replace the plate content with a ` +
  `clean black plate with the dealership wordmark "${dealerName}" in white bold italic ` +
  `letters, keeping the plate's exact position, size and perspective.`;

const PROMPT_SESSION_REF =
  ' The THIRD image shows another photo of this SAME car already placed in this studio - ' +
  'match that environment EXACTLY (same backdrop rendering, same lighting, same floor tone ' +
  'and reflections) so that all photos of this car look shot in the same place at the same time.';

const PROMPT_INTERIOR =
  'Photo edit for a used-car marketplace listing, interior shot. Keep the ENTIRE interior ' +
  'absolutely identical to the input photo - seats, stitching, trim, screens and their ' +
  'content, steering wheel and its emblems, controls, floor mats: all pixel-for-pixel, never ' +
  'redrawn. Replace ONLY what is visible OUTSIDE through the windows, windshield and open ' +
  'doors with a soft, bright, neutral light-gray photo-studio environment. Gently neutralize ' +
  'any strong warm or cold color cast toward clean neutral daylight so the interior colors ' +
  'look natural, but do not change any materials or details. Same camera angle, crop and ' +
  'proportions. Photorealistic.';

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiKey) {
    return Response.json({ error: 'Studio obrada nije konfigurirana' }, { status: 503 });
  }

  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  const {
    data: { user },
  } = await service.auth.getUser(jwt);
  if (!user) {
    return Response.json({ error: 'Neispravna sesija' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    image?: string;
    kind?: string;
    sessionId?: string;
  } | null;
  const image = body?.image;
  const kind = body?.kind === 'interior' ? 'interior' : 'exterior';
  if (!image || typeof image !== 'string' || image.length < 1000) {
    return Response.json({ error: 'Nedostaje fotografija' }, { status: 422 });
  }

  // Dealer kontekst preko sesije (server je istina, klijent ne salje dealerId)
  let brandedBackground: string | null = null;
  let dealerDisplayName: string | null = null;
  let sessionRef: string | null = null;
  let sessionRefPath: string | null = null;
  if (body?.sessionId) {
    const { data: session } = await service
      .from('photo_sessions')
      .select('id, user_id, dealer_id, studio_processed_at')
      .eq('id', body.sessionId)
      .maybeSingle();
    if (session && session.user_id !== user.id) {
      return Response.json({ error: 'Sesija ne pripada korisniku' }, { status: 403 });
    }
    if (session?.dealer_id) {
      const { data: dealer } = await service
        .from('dealers')
        .select('id, display_name, studio_background_path, studio_monthly_limit')
        .eq('id', session.dealer_id)
        .maybeSingle();
      if (dealer) {
        // Fair-use: jedinica = sesija (vozilo); broji se pri prvom studio pozivu
        if (!session.studio_processed_at) {
          const { count } = await service
            .from('photo_sessions')
            .select('id', { count: 'exact', head: true })
            .eq('dealer_id', dealer.id)
            .gte(
              'studio_processed_at',
              new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
            );
          if ((count ?? 0) >= dealer.studio_monthly_limit) {
            return Response.json(
              {
                error: `Mjesecni limit AI studija za salon je dosegnut (${dealer.studio_monthly_limit} vozila). Javite se wagenu za povecanje.`,
              },
              { status: 429 },
            );
          }
          await service
            .from('photo_sessions')
            .update({ studio_processed_at: new Date().toISOString() })
            .eq('id', session.id)
            .is('studio_processed_at', null);
        }
        // Brandirana pozadina (samo eksterijer)
        if (kind === 'exterior' && dealer.studio_background_path) {
          const toBase64 = (buf: Uint8Array) => {
            let binary = '';
            const chunk = 8192;
            for (let i = 0; i < buf.length; i += chunk) {
              binary += String.fromCharCode(...buf.subarray(i, i + chunk));
            }
            return btoa(binary);
          };
          const { data: file } = await service.storage
            .from('dealer-assets')
            .download(dealer.studio_background_path);
          if (file) brandedBackground = toBase64(new Uint8Array(await file.arrayBuffer()));
          if (brandedBackground) dealerDisplayName = dealer.display_name;
          // Referenca sesije: prva studio fotka sidri sve sljedece (2026-09-07).
          // Verzija u imenu: promjena prompta ponistava stara sidra sama od sebe.
          if (brandedBackground) {
            sessionRefPath = `${session.user_id}/${session.id}/_studio-ref-v3.png`;
            const { data: ref } = await service.storage
              .from('session-photos')
              .download(sessionRefPath);
            if (ref) sessionRef = toBase64(new Uint8Array(await ref.arrayBuffer()));
          }
        }
      }
    }
  }

  const started = Date.now();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': geminiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: 'image/jpeg', data: image } },
              ...(brandedBackground
                ? [{ inline_data: { mime_type: 'image/png', data: brandedBackground } }]
                : []),
              ...(brandedBackground && sessionRef
                ? [{ inline_data: { mime_type: 'image/png', data: sessionRef } }]
                : []),
              {
                text: brandedBackground
                  ? PROMPT_EXTERIOR_BRANDED +
                    (dealerDisplayName ? promptPlates(dealerDisplayName) : '') +
                    (sessionRef ? PROMPT_SESSION_REF : '')
                  : kind === 'interior'
                    ? PROMPT_INTERIOR
                    : PROMPT_EXTERIOR,
              },
            ],
          },
        ],
      }),
    },
  );

  const json = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[];
    error?: { message?: string };
  } | null;

  if (!res.ok) {
    return Response.json(
      { error: `AI servis: ${json?.error?.message?.slice(0, 200) ?? `HTTP ${res.status}`}` },
      { status: 502 },
    );
  }

  const out = json?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData
    ?.data;
  if (!out) {
    return Response.json({ error: 'AI nije vratio sliku' }, { status: 502 });
  }

  // Prva uspjesna studio fotka sesije postaje referenca za sljedece
  if (brandedBackground && !sessionRef && sessionRefPath) {
    const bytes = Uint8Array.from(atob(out), (c) => c.charCodeAt(0));
    await service.storage
      .from('session-photos')
      .upload(sessionRefPath, bytes, { contentType: 'image/png', upsert: true })
      .catch(() => null);
  }

  return Response.json({
    image: out,
    ms: Date.now() - started,
    model: MODEL,
    branded: brandedBackground !== null,
  });
});
