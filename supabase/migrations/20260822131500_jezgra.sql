-- B4: Core - Vozilo != Oglas (15.1), enrichment (15.3), price events (15.4),
-- photos with angle category (13.3).

-- ---------------------------------------------------------------------------
-- vehicles: the physical vehicle, anchored by VIN. Exists once, forever.
-- Market-neutral by decision (15.2): the same vehicle can be listed on any
-- market (imports). NO market column here.
-- ---------------------------------------------------------------------------
create type public.vin_source as enum ('outvin', 'iso_fallback', 'manual');

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  -- Nullable: oldtimers / manual entry (15.1). Unique only on non-null values.
  vin text,
  make text not null,
  model text not null,
  -- Trim / equipment package for the generated title, e.g. "M Sport" (13.1)
  trim text,
  -- Engine label for title line 2, e.g. "sDrive20i" (13.1)
  engine_label text,
  model_year int,
  vin_decoded_source public.vin_source,
  -- Server-side Outvin response cache (3.2)
  outvin_data jsonb,
  outvin_fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.vehicles is
  'Physical vehicle anchored by VIN (15.1). Market-neutral (15.2). DMS sync may write here; listing_enrichment is off limits.';

create unique index vehicles_vin_unique on public.vehicles (vin) where vin is not null;

create trigger vehicles_set_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- listings: the commercial event - this vehicle, at a price, in a period.
-- Common columns per 15.2; category-specific data in attributes JSONB
-- validated against category_attributes at application level (packages/domain).
-- ---------------------------------------------------------------------------
create type public.listing_status as enum ('draft', 'pending', 'active', 'sold', 'removed');

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  market text not null default 'HR' references public.markets (code),
  category_id uuid not null references public.categories (id),
  vehicle_id uuid not null references public.vehicles (id),
  -- Exactly one owner: user_id XOR dealer_id (15.5, check below).
  user_id uuid references auth.users (id) on delete set null,
  dealer_id uuid references public.dealers (id) on delete set null,
  status public.listing_status not null default 'draft',
  -- Whole euros, never decimals (13.1). NULL = "Na upit".
  -- Truth lives in price_events (15.4); this is a denormalization kept
  -- fresh by the price_events trigger below. Do not update directly.
  price_current int check (price_current is null or price_current >= 0),
  -- "Povrat PDV-a moguc" - property of the transaction, not the seller (13.1).
  vat_deductible boolean not null default false,
  first_registration_year int,
  mileage_km int check (mileage_km is null or mileage_km >= 0),
  location_city text,
  attributes jsonb not null default '{}',
  description text,
  -- Stable SEO slug, separate column by decision (15.6).
  slug text unique,
  published_at timestamptz,
  sold_at timestamptz,
  -- Voluntary final price on "Oznaci prodano" (18.2); feeds the price base.
  sold_price int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_owner_xor check (num_nonnulls(user_id, dealer_id) = 1)
);
comment on table public.listings is
  'Commercial event for a vehicle (15.1). Sold listings are never deleted (17.3).';

create index listings_market_status_idx on public.listings (market, status);
create index listings_vehicle_idx on public.listings (vehicle_id);
create index listings_dealer_idx on public.listings (dealer_id) where dealer_id is not null;
create index listings_user_idx on public.listings (user_id) where user_id is not null;
create index listings_category_idx on public.listings (category_id);
create index listings_attributes_idx on public.listings using gin (attributes);

create trigger listings_set_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- listing_enrichment: wagen-owned fields, 1:1 with listings (12.2, 15.3).
-- DMS sync NEVER writes to this table - the separation is physical, not
-- flag-based. The sync adapter simply has no code path that touches it.
-- ---------------------------------------------------------------------------
-- Closed badge set (9.6 - ODLUCENO). One internal type per badge; the display
-- label for sport_paket depends on the vehicle make (lookup in packages/domain).
create type public.badge_type as enum (
  -- Grupa 1 - sportska oprema (one internal type, label by make)
  'sport_paket',
  -- Grupa 2 - povijest vozila
  'prvi_vlasnik', 'kupljen_u_hrvatskoj', 'uvoz_njemacka', 'uvoz_svicarska',
  'potpuna_servisna', 'malo_kilometara',
  -- Grupa 3 - oprema i dodaci
  'harman_kardon', 'bang_olufsen', 'burmester', 'nove_gume', 'zimski_set'
);

create table public.listing_enrichment (
  listing_id uuid primary key references public.listings (id) on delete cascade,
  -- Max one badge per listing (9.6) - single column enforces it structurally.
  highlight_badge public.badge_type,
  top_until timestamptz,
  -- Custom photo ordering (overrides listing_photos.sort_order when present)
  photo_order uuid[],
  enriched_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.listing_enrichment is
  'wagen-owned enrichment (12.2, 15.3). DMS sync has no write path here - physical field ownership.';

create trigger listing_enrichment_set_updated_at
  before update on public.listing_enrichment
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- price_events: append-only truth for prices (15.4). listings.price_current
-- is updated by trigger - the event is the single write path for price.
-- ---------------------------------------------------------------------------
create table public.price_events (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  price int not null check (price >= 0),
  created_at timestamptz not null default now()
);
comment on table public.price_events is
  'Append-only price history (15.4). No updates, no deletes. Feeds Garaza delta, price-drop push, outlier signal, market stats.';

create index price_events_listing_idx on public.price_events (listing_id, created_at desc);

create function public.apply_price_event()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.listings set price_current = new.price where id = new.listing_id;
  return new;
end;
$$;

create trigger price_events_apply
  after insert on public.price_events
  for each row execute function public.apply_price_event();

-- ---------------------------------------------------------------------------
-- listing_photos: photos with angle category from guided shooting (13.3).
-- angle_category is NULL for DMS/web-upload photos - the gallery falls back
-- to non-sectioned mode by decision (13.3).
-- ---------------------------------------------------------------------------
create type public.photo_angle as enum ('exterior', 'interior', 'detail');

create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  storage_path text not null,
  angle_category public.photo_angle,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index listing_photos_listing_idx on public.listing_photos (listing_id, sort_order);

alter table public.vehicles enable row level security;
alter table public.listings enable row level security;
alter table public.listing_enrichment enable row level security;
alter table public.price_events enable row level security;
alter table public.listing_photos enable row level security;
