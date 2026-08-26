-- Kokpit Krug 1 (18.1, dealer-first): dealer sesija automatski otvara
-- DRAFT oglas cim je vozilo prepoznato - Kokpit time ima sto uredjivati
-- (vozilo != oglas, 15.1: sesija je dogadjaj fotografiranja, oglas je
-- komercijalni entitet). Privatne sesije i dalje stvaraju oglas tek na
-- "Objavi" (crosspost) - nista se ne mijenja za Fazu 0 flow.

create function public.ensure_dealer_draft_listing()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  cat_id uuid;
  d_market text;
  new_listing uuid;
begin
  if new.dealer_id is null or new.vehicle_id is null or new.listing_id is not null then
    return new;
  end if;

  select id into cat_id from categories where slug = 'osobna-vozila';
  select market into d_market from dealers where id = new.dealer_id;
  if cat_id is null or d_market is null then
    return new;
  end if;

  insert into listings (market, category_id, vehicle_id, dealer_id, status)
  values (d_market, cat_id, new.vehicle_id, new.dealer_id, 'draft')
  returning id into new_listing;

  new.listing_id := new_listing;
  return new;
end;
$$;

create trigger photo_sessions_dealer_draft
  before insert or update of vehicle_id, dealer_id on public.photo_sessions
  for each row execute function public.ensure_dealer_draft_listing();

-- Postojece dealer sesije s vozilom a bez oglasa: retroaktivno otvori draft
update public.photo_sessions
set updated_at = now()
where dealer_id is not null and vehicle_id is not null and listing_id is null;

-- ---------------------------------------------------------------------------
-- Fotografije sesije: clanovi salona smiju uredjivati (redoslijed, naslovna,
-- brisanje, web upload) fotke sesija svog salona - ne samo fotograf
-- ---------------------------------------------------------------------------
drop policy photo_session_photos_own_all on public.photo_session_photos;
create policy photo_session_photos_own_all on public.photo_session_photos
  for all using (
    exists (select 1 from public.photo_sessions s
            where s.id = session_id
              and (s.user_id = auth.uid()
                   or (s.dealer_id is not null and public.is_dealer_member(s.dealer_id))
                   or public.is_admin()))
  ) with check (
    exists (select 1 from public.photo_sessions s
            where s.id = session_id
              and (s.user_id = auth.uid()
                   or (s.dealer_id is not null and public.is_dealer_member(s.dealer_id))))
  );
