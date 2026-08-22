-- B6: Faza 0 - photo sessions, draft pipeline, crosspost, attribution
-- (4.2, 4.3, 4.5, 15.5).

-- ---------------------------------------------------------------------------
-- photo_sessions: one guided VIN+photo session in the app. Owned by an
-- (often anonymous) auth user - anonymous sessions are first-class (4.3).
-- The session becomes a listing only on crosspost consent; the pending pool
-- for launch day is listings WHERE status='pending' via crosspost (4.5).
-- ---------------------------------------------------------------------------
-- Entry mode decides the default exit (4.2): photo mode -> download/share,
-- listing mode -> publish on wagen.hr.
create type public.session_mode as enum ('photo', 'listing');
create type public.session_status as enum ('in_progress', 'completed', 'abandoned');

create table public.photo_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mode public.session_mode not null,
  status public.session_status not null default 'in_progress',
  vin text,
  -- Set once the VIN decodes into (or manual entry creates) a vehicle.
  vehicle_id uuid references public.vehicles (id) on delete set null,
  -- Crosspost consent ("Objavi i na wagen.hr") - THE Faza 0 metric (4.5).
  crosspost_consented boolean not null default false,
  -- Listing created from this session on crosspost/publish.
  listing_id uuid references public.listings (id) on delete set null,
  -- Deep link / FB group attribution. Deliberately schemaless JSONB: the
  -- attribution model is an open item (sekcija 20) - the schema must not
  -- presuppose it. Whatever the deep link carries lands here verbatim.
  attribution jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.photo_sessions is
  'Faza 0 photo/VIN session (4.2, 15.5). Crosspost rate = share of photo-mode sessions with crosspost_consented.';

create index photo_sessions_user_idx on public.photo_sessions (user_id);
create index photo_sessions_metrics_idx on public.photo_sessions (mode, status, crosspost_consented);

create trigger photo_sessions_set_updated_at
  before update on public.photo_sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- photo_session_photos: shots taken during the session, with the angle
-- category from guided shooting (13.3). Copied into listing_photos when the
-- session turns into a listing.
-- ---------------------------------------------------------------------------
create table public.photo_session_photos (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.photo_sessions (id) on delete cascade,
  storage_path text not null,
  angle_category public.photo_angle,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index photo_session_photos_session_idx on public.photo_session_photos (session_id, sort_order);

alter table public.photo_sessions enable row level security;
alter table public.photo_session_photos enable row level security;
