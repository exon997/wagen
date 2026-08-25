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
  } | null;
  const image = body?.image;
  const kind = body?.kind === 'interior' ? 'interior' : 'exterior';
  if (!image || typeof image !== 'string' || image.length < 1000) {
    return Response.json({ error: 'Nedostaje fotografija' }, { status: 422 });
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
              { text: kind === 'interior' ? PROMPT_INTERIOR : PROMPT_EXTERIOR },
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

  return Response.json({ image: out, ms: Date.now() - started, model: MODEL });
});
