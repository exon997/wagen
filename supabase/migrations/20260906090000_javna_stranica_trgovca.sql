-- Javna stranica trgovca (18.1, ODLUCENO 2026-09-05): wagen.hr/ime-trgovca.
-- Fizicko razdvajanje (isti princip kao field ownership 15.3): dealers
-- ostaje interna tablica (concierge_notes, tax_id...), dealer_pages je
-- javni sadrzaj koji trgovac sam uredjuje u Kokpitu.

create table public.dealer_pages (
  dealer_id uuid primary key references public.dealers (id) on delete cascade,
  slug text not null unique,
  is_published boolean not null default false,
  about text,
  phone text,
  email text,
  address text,
  city text,
  working_hours text,
  website text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- mala slova/brojke/crtice, 3-60 znakova
  constraint dealer_pages_slug_format
    check (slug ~ '^[a-z0-9](-?[a-z0-9])*$' and char_length(slug) between 3 and 60),
  -- rute weba se ne smiju zasjeniti (Next staticke rute ionako pobjedjuju,
  -- ali baza je zadnja linija obrane)
  constraint dealer_pages_slug_reserved check (slug not in (
    'kokpit', 'admin', 'api', 'trgovci', 'trgovac', 'oglasi', 'oglas',
    'pretraga', 'o-nama', 'kontakt', 'uvjeti', 'privatnost', 'impressum',
    'prijava', 'registracija', 'garaza', 'app', 'www', 'salon', 'izlog'
  ))
);
comment on table public.dealer_pages is
  'Javna stranica trgovca na wagen.hr/{slug} (18.1) - Google Business odrediste za salone bez weba.';

create trigger dealer_pages_set_updated_at
  before update on public.dealer_pages
  for each row execute function public.set_updated_at();

alter table public.dealer_pages enable row level security;

-- Javno citljivo samo objavljeno; clan/admin vidi i neobjavljeno
create policy dealer_pages_read on public.dealer_pages
  for select using (
    is_published
    or public.is_dealer_member(dealer_id)
    or public.is_admin()
  );
create policy dealer_pages_member_insert on public.dealer_pages
  for insert with check (public.is_dealer_member(dealer_id));
create policy dealer_pages_member_update on public.dealer_pages
  for update using (public.is_dealer_member(dealer_id) or public.is_admin())
  with check (public.is_dealer_member(dealer_id) or public.is_admin());
