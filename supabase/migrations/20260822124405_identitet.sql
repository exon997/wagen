-- B2: Identity and sellers (doc sections 15.5, 11, 5.3, 15.2).
-- profiles = public projection of a user; dealers = companies with concierge
-- activation; dealer_members = user<->dealer M:N from day one.

-- ---------------------------------------------------------------------------
-- Markets reference table (15.2, 15.6 - ODLUCENO).
-- Adding a market (e.g. 'SI') = inserting a row, zero schema migrations.
-- vehicles and equipment_codes deliberately have NO market column.
-- ---------------------------------------------------------------------------
create table public.markets (
  code text primary key,
  name text not null,
  created_at timestamptz not null default now()
);
comment on table public.markets is
  'Reference list of markets (15.2). New market = new row, never a schema change.';

insert into public.markets (code, name) values ('HR', 'Hrvatska');

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at fresh.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (15.5): public-facing user data. 1:1 with auth.users.
-- Phone number and its verification live in auth.users (phone_confirmed_at) -
-- they are NOT duplicated here. Anonymous sessions (4.3) get no profile row;
-- the app creates one at first need (publish / account upgrade).
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is
  'Public projection of a user (15.5). Identity truth stays in auth.users.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- dealers (15.5, 5.3, 11).
-- status: concierge lifecycle - 'pending' until wagen team manually activates.
-- tier: verification badge ladder from section 11; baseline 'verified' is
-- granted automatically at activation, higher tiers re-evaluated periodically.
-- ---------------------------------------------------------------------------
create type public.dealer_status as enum ('pending', 'active', 'suspended');
create type public.dealer_tier as enum ('verified', 'verified_plus', 'top');

create table public.dealers (
  id uuid primary key default gen_random_uuid(),
  market text not null default 'HR' references public.markets (code),
  legal_name text not null,
  display_name text not null,
  -- OIB in HR; the equivalent national tax id on other markets.
  tax_id text not null,
  status public.dealer_status not null default 'pending',
  tier public.dealer_tier not null default 'verified',
  concierge_notes text,
  contact_email text,
  contact_phone text,
  website text,
  address text,
  city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (market, tax_id)
);
comment on table public.dealers is
  'Dealer company (15.5). Activation is manual/concierge (5.3); badge tiers per section 11.';
comment on column public.dealers.tax_id is 'OIB u HR; nacionalni porezni broj na drugim trzistima.';

create index dealers_market_idx on public.dealers (market);
create index dealers_status_idx on public.dealers (status);

create trigger dealers_set_updated_at
  before update on public.dealers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- dealer_members (15.5): user <-> dealer, M:N from day one.
-- Seat limits (Premium 3, Ultimate unlimited) are enforced against the plan
-- at application level, not in the schema - quotas live in plans (B8).
-- ---------------------------------------------------------------------------
create type public.dealer_member_role as enum ('owner', 'member');

create table public.dealer_members (
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.dealer_member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (dealer_id, user_id)
);
comment on table public.dealer_members is
  'Membership of users in dealer accounts (15.5). M:N from day one.';

create index dealer_members_user_idx on public.dealer_members (user_id);

-- ---------------------------------------------------------------------------
-- RLS from day one (15.6): enabled now = deny-all until policies land in B9.
-- Local tooling and the worker use the secret (service) key and bypass RLS.
-- ---------------------------------------------------------------------------
alter table public.markets enable row level security;
alter table public.profiles enable row level security;
alter table public.dealers enable row level security;
alter table public.dealer_members enable row level security;
