# render-worker

Server-side 9:16 video (doc 4.7, `docs/video-plg-sprint.md`). Polling
`render_jobs` (RPC `claim_render_job`, SKIP LOCKED), Remotion render
templatea iz `packages/video-templates`, ffmpeg faststart, upload u
Storage bucket `videos`, upis `listing_videos`.

## Licenca

**Remotion je besplatan za tvrtke ≤ 3 zaposlena** (Wagen d.o.o. — OK,
spec 3.1). Ako se to promijeni, alternativa je čisti ffmpeg
(`zoompan` + `drawtext`).

## Pokretanje

```
SUPABASE_URL=...          # cloud projekt
SUPABASE_SECRET_KEY=...   # service rola (sb_secret_...)
POLL_MS=2000              # opcionalno
LINK_BASE=wagen.hr/v      # opcionalno
pnpm --filter @wagen/render-worker start
```

Ručno stavljanje posla u red (za test):

```sql
insert into render_jobs (listing_id, template_slug, template_version)
values ('<listing_id>', 'dealer-classic', 1);
```

## Deploy (Hetzner wagen-worker-1)

Docker image se builda iz korijena repoa (`apps/render-worker/Dockerfile`);
Chromium headless shell se peče u image pri buildu. Env ide kroz
`/opt/wagen/render-worker.env` na serveru.
