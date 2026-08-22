-- B7: Engagement and trust - saved searches, Garaza, contact events,
-- reviews, notifications (14, 11, 15.5).

-- ---------------------------------------------------------------------------
-- saved_searches (14.1, 14.2): filters are structured JSONB - the NL layer
-- translates queries into the same structure, so notification matching is a
-- plain query, never text parsing (14.6). Has market by decision (15.2).
-- Limit of 20 per user (14.5) is enforced at application level.
-- ---------------------------------------------------------------------------
create type public.notification_level as enum ('instant', 'daily', 'weekly');

create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  market text not null default 'HR' references public.markets (code),
  -- Auto-generated from filters (14.1); rename is optional.
  name text not null,
  filters jsonb not null,
  -- Default suggested by result density (14.2); the app sets it explicitly.
  notification_level public.notification_level not null default 'daily',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index saved_searches_user_idx on public.saved_searches (user_id);
create index saved_searches_matching_idx on public.saved_searches (market, notification_level);

create trigger saved_searches_set_updated_at
  before update on public.saved_searches
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- garage_items (14.3): the snapshot lives in the USER's row, so it survives
-- even full deletion of the listing. Active limit of 200 (14.5) is
-- application-level; sold/removed listings do not count toward it.
-- ---------------------------------------------------------------------------
create table public.garage_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  -- Whole euros (13.1); NULL when saved while "Na upit".
  price_at_save int,
  saved_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);
comment on table public.garage_items is
  'Garaza (14.3): dossier, not a mirror. Snapshot survives listing deletion; delta is computed against price_current/price_events.';

create index garage_items_listing_idx on public.garage_items (listing_id);

-- ---------------------------------------------------------------------------
-- contact_events (15.5): one row per "kontaktiraj prodavaca". Carries three
-- jobs: proof-of-contact for reviews (11), dealer dashboard stats (18.1),
-- demand signal for analytics.
-- channel is text, not enum: the set of contact channels is a product
-- surface that will grow (phone reveal, form, WhatsApp...) - no migration
-- per new channel.
-- ---------------------------------------------------------------------------
create table public.contact_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  channel text not null,
  created_at timestamptz not null default now()
);

create index contact_events_listing_idx on public.contact_events (listing_id);
create index contact_events_user_idx on public.contact_events (user_id);

-- ---------------------------------------------------------------------------
-- reviews (11): open review model - any user with a logged contact may
-- review. FK to contact_events IS the proof; "one review per user per
-- dealer" is a unique constraint, not application logic (15.5).
-- ---------------------------------------------------------------------------
create type public.review_status as enum ('published', 'flagged', 'removed');

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_event_id uuid not null references public.contact_events (id),
  rating smallint not null check (rating between 1 and 5),
  body text,
  status public.review_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dealer_id, user_id)
);

create index reviews_dealer_idx on public.reviews (dealer_id) where status = 'published';

create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- notifications (14.6, 15.5): a queue the Node worker drains. One mechanism
-- for new results, price drops and digests. In-app bell reads from here too.
-- Dedup: the same listing never reaches the same user twice for the same
-- type - partial unique constraint (14.6).
-- type is text (e.g. 'saved_search_new', 'price_drop_garage'): new
-- notification types must not require a migration.
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  listing_id uuid references public.listings (id) on delete cascade,
  payload jsonb not null default '{}',
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index notifications_dedup_idx
  on public.notifications (user_id, listing_id, type)
  where listing_id is not null;
create index notifications_queue_idx on public.notifications (sent_at) where sent_at is null;
create index notifications_bell_idx on public.notifications (user_id, created_at desc);

alter table public.saved_searches enable row level security;
alter table public.garage_items enable row level security;
alter table public.contact_events enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;
