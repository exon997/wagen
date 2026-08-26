-- Faza A dealer pilota (dealer-first pivot, sekcija 9, odobreno 2026-08-25):
-- branding salona, clanstvo preko telefonskog poziva (invite), veza sesija
-- na salon i fair-use pracenje AI studio obrade.

-- ---------------------------------------------------------------------------
-- 1) Branding i fair-use parametri na dealers
-- ---------------------------------------------------------------------------
alter table public.dealers
  add column studio_background_path text,
  add column plate_overlay_path text,
  add column studio_monthly_limit integer not null default 100;

comment on column public.dealers.studio_background_path is
  'dealer-assets putanja: referentni brandirani studio za AI pozadinu (9).';
comment on column public.dealers.plate_overlay_path is
  'dealer-assets putanja: grafika reklamne tablice salona - deterministicki overlay preko regije tablice, ne kroz AI (9).';
comment on column public.dealers.studio_monthly_limit is
  'Fair-use: maksimalan broj vozila (sesija) s AI studio obradom mjesecno; konacan standard TBD (sekcija 20).';

-- ---------------------------------------------------------------------------
-- 2) Sesija se veze na salon; studio_processed_at = jedinica fair-use brojanja
-- ---------------------------------------------------------------------------
alter table public.photo_sessions
  add column dealer_id uuid references public.dealers (id) on delete set null,
  add column studio_processed_at timestamptz;

create index photo_sessions_dealer_idx
  on public.photo_sessions (dealer_id) where dealer_id is not null;

comment on column public.photo_sessions.dealer_id is
  'Salon za koji se vozilo slika (dealer mod). Sesiju i dalje posjeduje fotograf (user_id).';
comment on column public.photo_sessions.studio_processed_at is
  'Prvi AI studio poziv sesije - postavlja iskljucivo edge fn (service role).';

-- Postojece politike rade po user_id; dodatno: tudji dealer_id se ne moze
-- podmetnuti (insert/update dopusten samo s clanskim dealer_id ili null)
drop policy photo_sessions_own_insert on public.photo_sessions;
create policy photo_sessions_own_insert on public.photo_sessions
  for insert with check (
    user_id = auth.uid()
    and (dealer_id is null or public.is_dealer_member(dealer_id))
  );
drop policy photo_sessions_own_update on public.photo_sessions;
create policy photo_sessions_own_update on public.photo_sessions
  for update using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (dealer_id is null or public.is_dealer_member(dealer_id))
  );

-- ---------------------------------------------------------------------------
-- 3) Pozivnice: admin upise telefon, korisnik nakon OTP-a preuzme clanstvo.
--    Bez izravnog pristupa (deny-all RLS) - sve ide kroz claim RPC.
-- ---------------------------------------------------------------------------
create table public.dealer_invites (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  -- E.164 bez plusa, npr. 385911234567 - isti oblik kao auth.users.phone
  phone text not null,
  role public.dealer_member_role not null default 'member',
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (dealer_id, phone)
);
comment on table public.dealer_invites is
  'Onboarding clanova salona: telefon -> nakon SMS OTP-a claim_dealer_invites() upise clanstvo (Faza A pilota).';

alter table public.dealer_invites enable row level security;
-- namjerno bez politika: klijenti ne citaju pozivnice; service role i RPC ispod

create function public.claim_dealer_invites()
returns table (dealer_id uuid, display_name text)
language plpgsql security definer set search_path = public
as $$
declare
  my_phone text := nullif(auth.jwt() ->> 'phone', '');
begin
  if auth.uid() is null or my_phone is null then
    return;
  end if;

  return query
  with claimed as (
    update dealer_invites i
    set claimed_by = auth.uid(), claimed_at = now()
    where i.phone = my_phone and i.claimed_at is null
    returning i.dealer_id, i.role
  ), inserted as (
    insert into dealer_members (dealer_id, user_id, role)
    select c.dealer_id, auth.uid(), c.role from claimed
    on conflict (dealer_id, user_id) do nothing
    returning dealer_members.dealer_id
  )
  select d.id, d.display_name
  from dealers d
  where d.id in (select claimed.dealer_id from claimed);
end;
$$;

comment on function public.claim_dealer_invites is
  'Preuzmi sve neiskoristene pozivnice za telefon iz JWT-a; vraca preuzete salone.';

-- ---------------------------------------------------------------------------
-- 4) my_dealer(): sve sto aplikaciji treba u jednom pozivu
-- ---------------------------------------------------------------------------
create function public.my_dealer()
returns table (
  dealer_id uuid,
  display_name text,
  studio_background_path text,
  plate_overlay_path text,
  studio_monthly_limit integer,
  studio_used_this_month bigint
)
language sql stable security definer set search_path = public
as $$
  select d.id,
         d.display_name,
         d.studio_background_path,
         d.plate_overlay_path,
         d.studio_monthly_limit,
         (select count(*) from photo_sessions s
          where s.dealer_id = d.id
            and s.studio_processed_at >= date_trunc('month', now()))
  from dealers d
  join dealer_members m on m.dealer_id = d.id
  where m.user_id = auth.uid()
  order by m.created_at
  limit 1;
$$;

comment on function public.my_dealer is
  'Salon trenutnog korisnika s brandingom i fair-use stanjem (prvi po uclanjenju; multi-salon UI kasnije).';

-- ---------------------------------------------------------------------------
-- 5) dealer-assets bucket: clanovi citaju svoj salon; upis samo service role
--    (admin onboarding skripta). Putanja: {dealer_id}/{datoteka}.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('dealer-assets', 'dealer-assets', false)
on conflict (id) do nothing;

create policy dealer_assets_member_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'dealer-assets'
    and public.is_dealer_member(((storage.foldername(name))[1])::uuid)
  );
