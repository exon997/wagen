-- Svaki salon ima VISE studijskih pozadina (odluka vlasnika 2026-09-07);
-- trgovac bira u Pripremi. dealers.studio_background_path ostaje kao
-- zadana/fallback (kompatibilnost), tablica je izvor izbora.

create table public.dealer_backgrounds (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  name text not null,
  storage_path text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
comment on table public.dealer_backgrounds is
  'Studijske pozadine salona (dealer-assets bucket); izbor u Pripremi, zadana = najmanji sort_order.';

create index dealer_backgrounds_dealer_idx on public.dealer_backgrounds (dealer_id, sort_order);

alter table public.dealer_backgrounds enable row level security;
create policy dealer_backgrounds_member_read on public.dealer_backgrounds
  for select using (public.is_dealer_member(dealer_id) or public.is_admin());
-- upis: service role (onboarding skripta); kasnije Kokpit upload

-- Seed iz postojece kolone
insert into public.dealer_backgrounds (dealer_id, name, storage_path, sort_order)
select id, 'Studio', studio_background_path, 0
from public.dealers
where studio_background_path is not null;
