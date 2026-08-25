-- 3.2 AZURIRANO 2026-08-25 (ODLUCENO): condition describes DAMAGE, not age.
-- New values: bez-stete / popravljena-steta / osteceno. "Novo vozilo" is a
-- separate boolean attribute; "rabljeno" is implicit and gone.
-- Plus: app_events for Faza 0 metrics (4.5) and interest measurement
-- (e.g. the "PDF profil - uskoro" button).

update public.category_attributes
set
  enum_values = '[{"value":"bez-stete","label":"Bez štete"},{"value":"popravljena-steta","label":"Popravljena šteta"},{"value":"osteceno","label":"Oštećeno"}]'::jsonb,
  label = 'Stanje vozila'
where key = 'condition'
  and category_id = (select id from public.categories where slug = 'osobna-vozila');

insert into public.category_attributes
  (category_id, key, label, data_type, is_filterable, is_required, display_order)
select id, 'is_new', 'Novo vozilo', 'boolean', true, false, 12
from public.categories where slug = 'osobna-vozila'
on conflict (category_id, key) do nothing;

-- ---------------------------------------------------------------------------
-- app_events: lagani event log za metrike Faze 0 (4.5 - instalacije,
-- dovrsetak flowa, crosspost rate) i mjerenje interesa za buduce feature.
-- Worker/admin citaju agregate; korisnik pise samo svoje dogadjaje.
-- ---------------------------------------------------------------------------
create table public.app_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
comment on table public.app_events is
  'Event log Faze 0 (4.5). Append-only s klijentske strane; agregati u admin metrikama.';

create index app_events_event_idx on public.app_events (event, created_at desc);

alter table public.app_events enable row level security;

create policy app_events_own_insert on public.app_events
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy app_events_admin_read on public.app_events
  for select using (public.is_admin());
