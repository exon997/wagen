-- B8: Commerce and moderation - plans, subscriptions, invoices,
-- moderation_flags (9.3, 9.5, 9.7, 8, 15.5).

-- ---------------------------------------------------------------------------
-- plans: packages as DATA, not code (ODLUCENO). Changing a price or quota is
-- a row update, never a deploy. Has market by decision (15.2).
-- NULL quota/limit = not yet decided (TBD in sekcija 20) or unlimited where
-- noted. Known values from 9.3 are seeded below.
-- ---------------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  market text not null default 'HR' references public.markets (code),
  code text not null,
  name text not null,
  -- Net price (9.1), in cents - invoices need decimals even if listing
  -- prices never do.
  monthly_price_cents int not null,
  -- NULL = unlimited tier ("preko 100", surcharge per extra 100 is TBD).
  active_listing_limit int,
  -- TBD for premium/ultimate (sekcija 20); basic has none (9.3).
  top_quota_monthly int,
  -- NULL = unlimited (Ultimate).
  seats int,
  autobrief_sync boolean not null default false,
  -- 0 = none, 1 = blago, 2 = da (9.3 "prioritet u search rangiranju")
  search_priority smallint not null default 0,
  dealer_tier public.dealer_tier not null,
  stripe_price_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (market, code)
);
comment on table public.plans is
  'Dealer packages as data (9.3). TBD values (sekcija 20) stay NULL until decided.';

create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

insert into public.plans
  (market, code, name, monthly_price_cents, active_listing_limit, top_quota_monthly,
   seats, autobrief_sync, search_priority, dealer_tier)
values
  ('HR', 'basic',    'Basic',    1900, 10,   0,    1,    false, 0, 'verified'),
  ('HR', 'premium',  'Premium',  5900, 100,  null, 3,    false, 1, 'verified_plus'),
  ('HR', 'ultimate', 'Ultimate', 9900, null, null, null, true,  2, 'top');

-- ---------------------------------------------------------------------------
-- subscriptions (9.5): Stripe Billing state mirrored via webhooks. Quotas are
-- derived from the plan (15.5), never stored here.
-- status is text: the value set is owned by Stripe (trialing, active,
-- past_due, canceled...), mirrored verbatim - an enum would break on their
-- next addition.
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  stripe_customer_id text,
  stripe_subscription_id text unique,
  status text not null,
  -- Trial covers both the general promo period and Hrvoje's individual
  -- 6-12 month deals - same mechanism, different day count (9.4, 9.5).
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_dealer_idx on public.subscriptions (dealer_id);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- invoices (9.7 - ODLUCENO): wagen's own invoice entity. The "Stripe invoice
-- = racun" assumption is explicitly rejected - Stripe is the payment
-- processor, the fiscal obligation to issue and fiscalize is wagen's.
-- Modeled to the Croatian fiscalization standard (JIR/ZKI), provider-neutral;
-- the intermediary adapter (D2) fills the fiscal fields.
-- ---------------------------------------------------------------------------
create type public.fiscalization_status as enum ('pending', 'fiscalized', 'failed', 'not_required');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  -- Sequential human-readable number, assigned at issue time by the invoice
  -- service (numbering scheme per Croatian rules; unique when present).
  number text unique,
  -- Buyer: dealer (B2B subscription) XOR user (B2C boost) - same rule as
  -- listing ownership (15.5).
  dealer_id uuid references public.dealers (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  line_items jsonb not null default '[]',
  net_amount_cents int not null,
  vat_amount_cents int not null,
  total_amount_cents int not null,
  currency text not null default 'EUR',
  -- Stripe object this invoice was generated from (invoice / checkout session).
  stripe_ref text,
  jir text,
  zki text,
  fiscalization_status public.fiscalization_status not null default 'pending',
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invoices_buyer_xor check (num_nonnulls(dealer_id, user_id) = 1)
);
comment on table public.invoices is
  'wagen invoice entity (9.7). Fiscal truth lives here, not in Stripe. Adapter fills JIR/ZKI.';

create index invoices_fiscalization_idx on public.invoices (fiscalization_status)
  where fiscalization_status in ('pending', 'failed');

-- ---------------------------------------------------------------------------
-- moderation_flags (8, 15.5): moderation is a queue over data, not a separate
-- system. AI (instant check + periodic sweep), manual review and user reports
-- all write here; the /admin queue reads it.
-- flag_type follows the reference criteria list from sekcija 8.
-- ---------------------------------------------------------------------------
create type public.moderation_flag_type as enum (
  'duplicate_listing',      -- isti sadrzaj/vozilo objavljeno vise puta
  'repeated_repost',        -- stari obrisan, identican novi odmah
  'inappropriate_photos',   -- neprikladne ili tudje fotografije
  'multi_vehicle',          -- oglas ne predstavlja jedno jasno vozilo
  'phantom_vehicle',        -- vozilo stvarno nije dostupno
  'price_outlier',          -- odudara od trzisne cijene (scam signal)
  'other'
);
create type public.moderation_source as enum ('ai_instant', 'ai_sweep', 'manual', 'user_report');
create type public.moderation_status as enum ('open', 'resolved', 'dismissed');

create table public.moderation_flags (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  flag_type public.moderation_flag_type not null,
  source public.moderation_source not null,
  reporter_user_id uuid references auth.users (id) on delete set null,
  note text,
  details jsonb,
  status public.moderation_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index moderation_flags_queue_idx on public.moderation_flags (status, created_at)
  where status = 'open';
create index moderation_flags_listing_idx on public.moderation_flags (listing_id);

create trigger moderation_flags_set_updated_at
  before update on public.moderation_flags
  for each row execute function public.set_updated_at();

alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.invoices enable row level security;
alter table public.moderation_flags enable row level security;
