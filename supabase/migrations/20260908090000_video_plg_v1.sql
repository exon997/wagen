-- Video PLG V1 (4.7, docs/video-plg-sprint.md): server-side 9:16 video.
-- V1 opseg: tablice + RLS + bucket + claim RPC + dealer template seed.
-- Kokpit/app rucno stavljaju posao u red; auto-trigger na objavu
-- privatnog oglasa je V2 (uz Blok D).

-- ---------------------------------------------------------------------
-- Template = konfiguracija + verzija NA SERVERU (novi template bez
-- update-a aplikacije). Config je jsonb, zod-validiran u workeru.
create table public.video_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  version int not null,
  config jsonb not null,
  active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (slug, version)
);

comment on table public.video_templates is
  'Video predlosci (4.7): konfiguracija zivi na serveru, komponenta u packages/video-templates.';

-- Red za render (worker polling, FOR UPDATE SKIP LOCKED kroz RPC)
create table public.render_jobs (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  template_slug text not null,
  template_version int not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'failed')),
  attempts int not null default 0,
  error text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index render_jobs_queue_idx on public.render_jobs (status, created_at)
  where status = 'queued';

create trigger render_jobs_set_updated_at
  before update on public.render_jobs
  for each row execute function public.set_updated_at();

-- Gotovi videi (deterministicki: isti listing + template verzija = cache)
create table public.listing_videos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  template_slug text not null,
  template_version int not null,
  storage_path text not null,
  thumb_path text,
  duration_sec numeric,
  size_bytes bigint,
  render_ms int,
  status text not null default 'ready' check (status in ('ready', 'failed')),
  created_at timestamptz not null default now(),
  unique (listing_id, template_slug, template_version)
);

-- Kratki linkovi s end carda / dossiera: wagen.hr/v/{code}
create table public.short_links (
  code text primary key,
  listing_id uuid not null references public.listings (id) on delete cascade,
  video_id uuid references public.listing_videos (id) on delete set null,
  source text not null default 'video' check (source in ('video', 'pdf', 'manual')),
  created_at timestamptz not null default now()
);

-- Atribucija: klik -> instalacija -> otvaranje; samo hashevi, bez sirovog
-- IP/UA (privatnost, retencija 90 dana - ciscenje radi worker)
create table public.link_events (
  id bigint generated always as identity primary key,
  code text not null references public.short_links (code) on delete cascade,
  event text not null check (event in ('click', 'install', 'open')),
  platform text,
  ua_hash text,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index link_events_code_idx on public.link_events (code, event);

create table public.share_events (
  id bigint generated always as identity primary key,
  video_id uuid not null references public.listing_videos (id) on delete cascade,
  channel text not null default 'unknown',
  created_at timestamptz not null default now()
);

-- Story hook za 'story' template (V2 UI; kolona spremna odmah)
alter table public.listings add column if not exists story_text text;

-- ---------------------------------------------------------------------
-- Kod kratkog linka: 5 znakova, base62 BEZ 0/O/1/l/I - tipka se rucno
-- s videa (spec 3.3)
create function public.gen_short_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  result text := '';
  i int;
begin
  for i in 1..5 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

-- Worker preuzima najstariji queued posao (SKIP LOCKED - vise instanci
-- bez sudara). Poziva se service rolom; zakljucani posao se oznaci
-- running + locked_at, a zaglavljeni running stariji od 5 min se vraca
-- u red (crash recovery) do max 3 pokusaja.
create function public.claim_render_job()
returns setof public.render_jobs
language plpgsql
volatile
as $$
declare
  job public.render_jobs;
begin
  -- Zaglavljene poslove vrati u red (worker pao usred rendera)
  update public.render_jobs
    set status = 'queued', locked_at = null
    where status = 'running'
      and locked_at < now() - interval '5 minutes'
      and attempts < 3;

  select * into job
    from public.render_jobs
    where status = 'queued'
    order by created_at
    limit 1
    for update skip locked;

  if not found then
    return;
  end if;

  update public.render_jobs
    set status = 'running',
        locked_at = now(),
        attempts = attempts + 1
    where id = job.id
    returning * into job;

  return next job;
end;
$$;

comment on function public.claim_render_job is
  'Render worker (service rola): atomarno preuzimanje posla iz reda + oporavak zaglavljenih.';

-- ---------------------------------------------------------------------
-- RLS
alter table public.video_templates enable row level security;
alter table public.render_jobs enable row level security;
alter table public.listing_videos enable row level security;
alter table public.short_links enable row level security;
alter table public.link_events enable row level security;
alter table public.share_events enable row level security;

-- Aktivni templatei su javni (app picker ih cita bez privilegija)
create policy video_templates_public_read on public.video_templates
  for select using (active);

-- "Moj oglas": privatni vlasnik ILI clan salona (15.5 XOR vlasnistvo)
create function public.is_my_listing(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from listings l
    where l.id = p_listing_id
      and (
        l.user_id = (select auth.uid())
        or (l.dealer_id is not null and public.is_dealer_member(l.dealer_id))
      )
  );
$$;

create policy render_jobs_owner_insert on public.render_jobs
  for insert to authenticated
  with check (status = 'queued' and public.is_my_listing(listing_id));

create policy render_jobs_owner_read on public.render_jobs
  for select to authenticated
  using (public.is_my_listing(listing_id));

create policy listing_videos_owner_read on public.listing_videos
  for select to authenticated
  using (public.is_my_listing(listing_id));

create policy short_links_owner_read on public.short_links
  for select to authenticated
  using (public.is_my_listing(listing_id));

-- link_events i share_events: pise ih server (service rola); vlasnik
-- dobiva agregate kroz view u V2 - bez izravnih politika sada.

-- ---------------------------------------------------------------------
-- Storage bucket za videe i thumbnailove; putanja {listing_id}/{file}
insert into storage.buckets (id, name, public)
values ('videos', 'videos', false)
on conflict (id) do nothing;

create policy videos_owner_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'videos'
    and public.is_my_listing(((storage.foldername(name))[1])::uuid)
  );

-- ---------------------------------------------------------------------
-- Seed V1: dealer template (Kokpit + AlphaOne). Konfiguracija zrcali
-- dosadasnji browser-render iz Kokpita (foto scene + cijena + end card).
insert into public.video_templates (slug, version, config, active, is_default)
values (
  'dealer-classic',
  1,
  '{
    "slug": "dealer-classic",
    "version": 1,
    "durationSec": 18,
    "hook": { "type": "hero", "durationSec": 2.4 },
    "scenes": [
      { "photoIndex": "auto", "durationSec": 2.4, "motion": "zoomIn", "overlay": "spec" },
      { "photoIndex": "auto", "durationSec": 2.4, "motion": "panR", "overlay": "none" },
      { "photoIndex": "auto", "durationSec": 2.4, "motion": "zoomOut", "overlay": "spec" },
      { "photoIndex": "auto", "durationSec": 2.4, "motion": "panL", "overlay": "none" },
      { "photoIndex": "auto", "durationSec": 2.4, "motion": "zoomIn", "overlay": "none" }
    ],
    "price": { "show": "always" },
    "endCard": { "headline": "Pogledaj cijeli oglas", "cta": "wagen.hr", "showQr": false },
    "captionTemplate": "{make} {model} ({year}) — detalji i sve fotografije: {link}",
    "hashtags": ["#rabljenavozila", "#wagen", "#autooglasi"],
    "locale": "hr"
  }'::jsonb,
  true,
  true
);
