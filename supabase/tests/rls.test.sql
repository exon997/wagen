-- B10: RLS policy tests - proves the approved matrix on a live database.
-- Run:  pnpm db:test:rls
-- The whole file runs in ONE transaction and rolls back - no residue.
-- Any failed assertion raises an exception; ON_ERROR_STOP makes psql exit 3.

\set ON_ERROR_STOP on
begin;

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres, bypassing RLS)
-- ---------------------------------------------------------------------------
insert into public.markets (code, name) values ('SI', 'Slovenija');

insert into auth.users (id, instance_id, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),  -- ua: private seller
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),  -- ub: unrelated user
  ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),  -- um: dealer member
  ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');  -- uo: dealer owner

insert into public.dealers (id, market, legal_name, display_name, tax_id, status) values
  ('00000000-0000-0000-0000-0000000000d1', 'HR', 'Test Auto d.o.o.', 'Test Auto', '12345678901', 'active');

insert into public.dealer_members (dealer_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000000d', 'owner'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000000c', 'member');

insert into public.vehicles (id, make, model) values
  ('00000000-0000-0000-0000-0000000000e1'::uuid, 'BMW', 'X1'),
  ('00000000-0000-0000-0000-0000000000e2'::uuid, 'Audi', 'A4'),
  ('00000000-0000-0000-0000-0000000000e3'::uuid, 'Skoda', 'Octavia'),
  ('00000000-0000-0000-0000-0000000000e4'::uuid, 'VW', 'Golf');

-- ua's draft, ua's active (HR), dealer's active (HR), active on SI market
insert into public.listings (id, market, category_id, vehicle_id, user_id, dealer_id, status) values
  ('00000000-0000-0000-0000-0000000000f1'::uuid, 'HR', (select id from public.categories limit 1), '00000000-0000-0000-0000-0000000000e1'::uuid, '00000000-0000-0000-0000-00000000000a', null, 'draft'),
  ('00000000-0000-0000-0000-0000000000f2'::uuid, 'HR', (select id from public.categories limit 1), '00000000-0000-0000-0000-0000000000e2'::uuid, '00000000-0000-0000-0000-00000000000a', null, 'active'),
  ('00000000-0000-0000-0000-0000000000f3'::uuid, 'HR', (select id from public.categories limit 1), '00000000-0000-0000-0000-0000000000e3'::uuid, null, '00000000-0000-0000-0000-0000000000d1', 'active'),
  ('00000000-0000-0000-0000-0000000000f4'::uuid, 'SI', (select id from public.categories limit 1), '00000000-0000-0000-0000-0000000000e4'::uuid, '00000000-0000-0000-0000-00000000000a', null, 'active');

insert into public.price_events (listing_id, price) values
  ('00000000-0000-0000-0000-0000000000f2'::uuid, 23990);

insert into public.saved_searches (user_id, name, filters) values
  ('00000000-0000-0000-0000-00000000000a', 'BMW X1 do 25k', '{"make":"bmw"}');

insert into public.garage_items (user_id, listing_id, price_at_save) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f3'::uuid, 45000);

-- ub contacted the dealer listing (basis for a review)
insert into public.contact_events (id, user_id, listing_id, channel) values
  ('00000000-0000-0000-0000-0000000000ce'::uuid, '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000f3'::uuid, 'phone_reveal');

insert into public.subscriptions (dealer_id, plan_id, status) values
  ('00000000-0000-0000-0000-0000000000d1', (select id from public.plans where code = 'premium'), 'trialing');

insert into public.invoices (dealer_id, net_amount_cents, vat_amount_cents, total_amount_cents) values
  ('00000000-0000-0000-0000-0000000000d1', 5900, 1475, 7375);

-- ---------------------------------------------------------------------------
-- Scenario 1: anonymous visitor (no auth) - sees only active/sold in HR
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

do $$
declare n int;
begin
  select count(*) into n from public.listings where id in ('00000000-0000-0000-0000-0000000000f2'::uuid, '00000000-0000-0000-0000-0000000000f3'::uuid);
  if n <> 2 then raise exception 'S1 FAIL: anon ne vidi aktivne HR fixture oglase (%)', n; end if;
  select count(*) into n from public.listings where id = '00000000-0000-0000-0000-0000000000f1'::uuid;
  if n <> 0 then raise exception 'S1 FAIL: anon vidi draft'; end if;
  select count(*) into n from public.saved_searches;
  if n <> 0 then raise exception 'S1 FAIL: anon vidi tudje spremljene pretrage'; end if;
  select count(*) into n from public.profiles;
  if n <> 0 then raise exception 'S1 FAIL: profili su javni, ne smiju biti'; end if;
  select count(*) into n from public.plans;
  if n <> 3 then raise exception 'S1 FAIL: anon ne vidi HR planove (%)', n; end if;
  raise notice 'S1 OK: anonimni posjetitelj vidi tocno 2 aktivna HR oglasa, nista privatno';
end $$;

-- ---------------------------------------------------------------------------
-- Scenario 2: market isolation - SI listing invisible on HR, visible on SI
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from public.listings where id = '00000000-0000-0000-0000-0000000000f4'::uuid;
  if n <> 0 then raise exception 'S2 FAIL: SI oglas vidljiv na HR tržištu'; end if;
  raise notice 'S2a OK: SI oglas nevidljiv s defaultnim HR headerom';
end $$;

set local request.headers to '{"x-wagen-market":"SI"}';

do $$
declare n int;
begin
  select count(*) into n from public.listings where market = 'HR';
  if n <> 0 then raise exception 'S2 FAIL: SI trziste vidi HR oglase (%)', n; end if;
  select count(*) into n from public.listings where id = '00000000-0000-0000-0000-0000000000f4'::uuid;
  if n <> 1 then raise exception 'S2 FAIL: SI oglas nevidljiv na SI tržištu'; end if;
  raise notice 'S2b OK: x-wagen-market=SI vidi tocno svoj oglas - market izolacija radi';
end $$;

set local request.headers to '{}';

-- ---------------------------------------------------------------------------
-- Scenario 3: owner (ua) sees own draft; unrelated user (ub) does not
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
declare n int;
begin
  select count(*) into n from public.listings where status = 'draft';
  if n <> 1 then raise exception 'S3 FAIL: vlasnik ne vidi svoj draft'; end if;
  select count(*) into n from public.saved_searches;
  if n <> 1 then raise exception 'S3 FAIL: vlasnik ne vidi svoju pretragu'; end if;
  select count(*) into n from public.garage_items;
  if n <> 1 then raise exception 'S3 FAIL: vlasnik ne vidi svoju Garazu'; end if;
  raise notice 'S3a OK: vlasnik vidi svoj draft, pretragu i Garazu';
end $$;

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

do $$
declare n int;
begin
  select count(*) into n from public.listings where status = 'draft';
  if n <> 0 then raise exception 'S3 FAIL: tudji korisnik vidi tudji draft'; end if;
  select count(*) into n from public.saved_searches;
  if n <> 0 then raise exception 'S3 FAIL: tudji korisnik vidi tudje pretrage'; end if;
  select count(*) into n from public.garage_items;
  if n <> 0 then raise exception 'S3 FAIL: tudji korisnik vidi tudju Garazu'; end if;
  raise notice 'S3b OK: nepovezani korisnik ne vidi nista tudje privatno';
end $$;

-- ---------------------------------------------------------------------------
-- Scenario 4: dealer member sees dealer listings + contact events on them
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';

do $$
declare n int;
begin
  select count(*) into n from public.listings where dealer_id = '00000000-0000-0000-0000-0000000000d1';
  if n <> 1 then raise exception 'S4 FAIL: clan ne vidi oglas svog trgovca'; end if;
  select count(*) into n from public.contact_events where id = '00000000-0000-0000-0000-0000000000ce'::uuid;
  if n <> 1 then raise exception 'S4 FAIL: clan ne vidi kontakt na svom oglasu (statistika 18.1)'; end if;
  select count(*) into n from public.subscriptions;
  if n <> 0 then raise exception 'S4 FAIL: obicni clan vidi pretplatu (samo owner smije)'; end if;
  raise notice 'S4 OK: clan vidi oglase i kontakte trgovca, ali ne pretplatu';
end $$;

-- owner reads subscription + invoice
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}';

do $$
declare n int;
begin
  select count(*) into n from public.subscriptions;
  if n <> 1 then raise exception 'S5 FAIL: owner ne vidi pretplatu'; end if;
  select count(*) into n from public.invoices;
  if n <> 1 then raise exception 'S5 FAIL: owner ne vidi racun'; end if;
  raise notice 'S5 OK: owner vidi pretplatu i racun svog trgovca';
end $$;

-- ---------------------------------------------------------------------------
-- Scenario 6: price_events append-only - even the owner cannot UPDATE/DELETE
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
declare n int;
begin
  update public.price_events set price = 1 where price = 23990;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'S6 FAIL: UPDATE na price_events prosao (%)', n; end if;
  delete from public.price_events;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'S6 FAIL: DELETE na price_events prosao'; end if;
  -- INSERT for own listing must still work (price change path)
  insert into public.price_events (listing_id, price) values ('00000000-0000-0000-0000-0000000000f2'::uuid, 22990);
  select price_current into n from public.listings where id = '00000000-0000-0000-0000-0000000000f2'::uuid;
  if n <> 22990 then raise exception 'S6 FAIL: trigger nije azurirao price_current (%)', n; end if;
  raise notice 'S6 OK: price_events append-only; insert vlasnika radi i azurira price_current';
end $$;

-- ---------------------------------------------------------------------------
-- Scenario 7: review needs a valid contact event of the same user
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
begin
  -- ua tries to review using ub's contact event -> must fail
  begin
    insert into public.reviews (dealer_id, user_id, contact_event_id, rating)
    values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000ce'::uuid, 5);
    raise exception 'S7 FAIL: recenzija s tudjim kontaktom prosla';
  exception when insufficient_privilege then
    raise notice 'S7a OK: recenzija s tudjim contact_eventom odbijena';
  end;
end $$;

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

do $$
begin
  -- ub with own contact -> passes
  insert into public.reviews (dealer_id, user_id, contact_event_id, rating)
  values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000ce'::uuid, 4);
  raise notice 'S7b OK: recenzija s vlastitim dokazom kontakta prolazi';
end $$;

-- ---------------------------------------------------------------------------
-- Scenario 8: moderation - user may only insert user_report; cannot read queue
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  begin
    insert into public.moderation_flags (listing_id, flag_type, source, reporter_user_id)
    values ('00000000-0000-0000-0000-0000000000f3'::uuid, 'phantom_vehicle', 'ai_sweep', '00000000-0000-0000-0000-00000000000b');
    raise exception 'S8 FAIL: korisnik smio pisati kao ai_sweep';
  exception when insufficient_privilege then null;
  end;
  insert into public.moderation_flags (listing_id, flag_type, source, reporter_user_id)
  values ('00000000-0000-0000-0000-0000000000f3'::uuid, 'phantom_vehicle', 'user_report', '00000000-0000-0000-0000-00000000000b');
  select count(*) into n from public.moderation_flags;
  if n <> 0 then raise exception 'S8 FAIL: korisnik vidi moderacijski queue'; end if;
  raise notice 'S8 OK: user_report prolazi, ai izvor odbijen, queue nevidljiv korisniku';
end $$;

-- ---------------------------------------------------------------------------
-- Scenario 9: photo_sessions private; admin reads them (metrics), not others
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

insert into public.photo_sessions (user_id, mode)
values ('00000000-0000-0000-0000-00000000000a', 'photo');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

do $$
declare n int;
begin
  select count(*) into n from public.photo_sessions;
  if n <> 0 then raise exception 'S9 FAIL: tudji korisnik vidi tudju foto sesiju'; end if;
  raise notice 'S9a OK: foto sesija nevidljiva drugom korisniku';
end $$;

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated","app_metadata":{"role":"admin"}}';

do $$
declare n int;
begin
  select count(*) into n from public.photo_sessions where user_id = '00000000-0000-0000-0000-00000000000a';
  if n <> 1 then raise exception 'S9 FAIL: admin ne vidi foto sesije (metrike Faze 0)'; end if;
  select count(*) into n from public.listings where id = '00000000-0000-0000-0000-0000000000f1'::uuid;
  if n <> 1 then raise exception 'S9 FAIL: admin ne vidi draftove'; end if;
  select count(*) into n from public.moderation_flags where listing_id = '00000000-0000-0000-0000-0000000000f3'::uuid;
  if n <> 1 then raise exception 'S9 FAIL: admin ne vidi moderacijski queue'; end if;
  select count(*) into n from public.saved_searches where user_id = '00000000-0000-0000-0000-00000000000a';
  if n <> 0 then raise exception 'S9 FAIL: admin vidi privatne pretrage - namjerno zabranjeno'; end if;
  raise notice 'S9b OK: admin vidi sesije, draftove i queue; privatne pretrage ni admin';
end $$;

-- ---------------------------------------------------------------------------
-- Scenario 10: unrelated user cannot touch someone else's listing/enrichment
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

do $$
declare n int;
begin
  update public.listings set description = 'hakirano' where id = '00000000-0000-0000-0000-0000000000f2'::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'S10 FAIL: tudji UPDATE oglasa prosao'; end if;
  begin
    insert into public.listing_enrichment (listing_id, highlight_badge)
    values ('00000000-0000-0000-0000-0000000000f2'::uuid, 'sport_paket');
    raise exception 'S10 FAIL: tudji INSERT enrichmenta prosao';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.price_events (listing_id, price) values ('00000000-0000-0000-0000-0000000000f2'::uuid, 1);
    raise exception 'S10 FAIL: tudji price event prosao';
  exception when insufficient_privilege then null;
  end;
  raise notice 'S10 OK: tudji oglas nedodirljiv (update, enrichment, cijena)';
end $$;

-- ---------------------------------------------------------------------------
-- Scenario 11: objava trazi verificiran telefon (3.2 - RLS gate)
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
begin
  begin
    insert into public.listings (market, category_id, vehicle_id, user_id, status)
    values ('HR', (select id from public.categories limit 1), '00000000-0000-0000-0000-0000000000e1'::uuid, '00000000-0000-0000-0000-00000000000a', 'pending');
    raise exception 'S11 FAIL: objava bez telefona prosla';
  exception when insufficient_privilege then
    raise notice 'S11a OK: objava bez verificiranog telefona odbijena';
  end;
end $$;

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","phone":"385991111111"}';

do $$
begin
  insert into public.listings (market, category_id, vehicle_id, user_id, status)
  values ('HR', (select id from public.categories limit 1), '00000000-0000-0000-0000-0000000000e1'::uuid, '00000000-0000-0000-0000-00000000000a', 'pending');
  raise notice 'S11b OK: objava s telefonom u JWT-u prolazi';
end $$;

reset role;
rollback;

\echo 'SVI RLS TESTOVI PROSLI (rollback izvrsen, baza cista)'
