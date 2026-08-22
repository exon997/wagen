-- F2: Development seed data. Applied by `supabase db reset` (local only,
-- never pushed to cloud environments). Deterministic - no random().
--
-- Contents: 2 dealers (Premium + Ultimate w/ subscriptions), 1 private
-- seller, 30 vehicles/listings with price history, photos with angle
-- categories, equipment dictionary sample, Faza 0 photo sessions.

-- ---------------------------------------------------------------------------
-- Users (auth.users direct insert - dev only)
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'privatni@dev.wagen.hr'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vlasnik@transauto.dev'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vlasnik@adriacars.dev'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'kupac@dev.wagen.hr');

insert into public.profiles (id, display_name) values
  ('10000000-0000-0000-0000-000000000001', 'Ivan Horvat'),
  ('10000000-0000-0000-0000-000000000004', 'Ana Kovac');

-- ---------------------------------------------------------------------------
-- Dealers + membership + subscriptions
-- ---------------------------------------------------------------------------
insert into public.dealers (id, market, legal_name, display_name, tax_id, status, tier, contact_email, city) values
  ('20000000-0000-0000-0000-000000000001', 'HR', 'TransAuto d.o.o.', 'TransAuto', '11111111111', 'active', 'top', 'info@transauto.dev', 'Zagreb'),
  ('20000000-0000-0000-0000-000000000002', 'HR', 'Adria Cars d.o.o.', 'Adria Cars', '22222222222', 'active', 'verified_plus', 'info@adriacars.dev', 'Split');

insert into public.dealer_members (dealer_id, user_id, role) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'owner'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'owner');

insert into public.subscriptions (dealer_id, plan_id, status, trial_ends_at) values
  ('20000000-0000-0000-0000-000000000001', (select id from public.plans where code = 'ultimate' and market = 'HR'), 'trialing', now() + interval '6 months'),
  ('20000000-0000-0000-0000-000000000002', (select id from public.plans where code = 'premium' and market = 'HR'), 'trialing', now() + interval '3 months');

-- ---------------------------------------------------------------------------
-- Equipment dictionary sample (13.4)
-- ---------------------------------------------------------------------------
insert into public.equipment_codes (manufacturer, code, name_en, name_hr, translation_status) values
  ('BMW', 'S402A', 'Panorama glass roof', 'Panoramski stakleni krov', 'approved'),
  ('BMW', 'S423A', 'Floor mats velours', 'Velur tepisi', 'approved'),
  ('BMW', 'S688A', 'Harman Kardon surround sound', 'Harman Kardon ozvucenje', 'approved'),
  ('Audi', 'PX2', 'Matrix LED headlights', 'Matrix LED svjetla', 'machine_translated'),
  ('Volkswagen', 'PW3', 'Winter package', 'Zimski paket', 'machine_translated'),
  ('Skoda', 'PJD', 'Alloy wheels 18"', null, 'untranslated');

-- ---------------------------------------------------------------------------
-- 30 vehicles + listings via generate_series. Deterministic variety from
-- modulo picks. Listing split: 14 TransAuto, 12 Adria Cars, 4 private.
-- ---------------------------------------------------------------------------
with spec as (
  select
    i,
    (array['BMW','Volkswagen','Skoda','Audi','Renault','Toyota'])[(i % 6) + 1]                 as make,
    (array['X1','Golf','Octavia','A4','Clio','Corolla'])[(i % 6) + 1]                          as model,
    (array['M Sport', null, 'Sportline', 'S line', null, null])[(i % 6) + 1]                   as trim,
    (array['sDrive20i','2.0 TDI','1.5 TSI','40 TDI','1.0 TCe','1.8 Hybrid'])[(i % 6) + 1]      as engine_label,
    2015 + (i % 10)                                                                            as reg_year,
    (array['benzin','dizel','benzin','dizel','benzin','hibrid'])[(i % 6) + 1]                  as fuel,
    (array['automatski','rucni','rucni','automatski','rucni','automatski'])[(i % 6) + 1]       as transmission,
    (array[141, 110, 110, 150, 67, 90])[(i % 6) + 1]                                           as power_kw,
    30000 + i * 7000                                                                           as mileage,
    12000 + i * 1350                                                                           as base_price,
    ('3000000'||lpad(i::text, 1, '0')||'-0000-0000-0000-'||lpad(i::text, 12, '0'))::uuid       as vehicle_id,
    ('4000000'||lpad(i::text, 1, '0')||'-0000-0000-0000-'||lpad(i::text, 12, '0'))::uuid       as listing_id
  from generate_series(0, 29) as i
),
veh as (
  insert into public.vehicles (id, vin, make, model, trim, engine_label, model_year, vin_decoded_source)
  select vehicle_id,
         case when i = 29 then null else 'WVWDEV000SEED'||lpad(i::text, 4, '0') end,  -- one VIN-less oldtimer
         make, model, trim, engine_label, reg_year,
         case when i = 29 then 'manual'::public.vin_source else 'outvin'::public.vin_source end
  from spec
  returning id
)
insert into public.listings
  (id, market, category_id, vehicle_id, user_id, dealer_id, status, vat_deductible,
   first_registration_year, mileage_km, location_city, attributes, description, slug, published_at)
select
  s.listing_id, 'HR',
  (select id from public.categories where slug = 'osobna-vozila'),
  s.vehicle_id,
  case when s.i >= 26 then '10000000-0000-0000-0000-000000000001'::uuid else null end,
  case when s.i < 14 then '20000000-0000-0000-0000-000000000001'::uuid
       when s.i < 26 then '20000000-0000-0000-0000-000000000002'::uuid
       else null end,
  case when s.i = 26 then 'draft'::public.listing_status
       when s.i = 27 then 'pending'::public.listing_status
       when s.i = 28 then 'sold'::public.listing_status
       else 'active'::public.listing_status end,
  s.i % 7 = 0,
  s.reg_year, s.mileage,
  case when s.i < 14 then 'Zagreb' when s.i < 26 then 'Split' else 'Rijeka' end,
  jsonb_build_object(
    'fuel', s.fuel, 'transmission', s.transmission, 'power_kw', s.power_kw,
    'condition', 'rabljeno', 'owners_count', (s.i % 3) + 1,
    'service_book', (array['da','ne','djelomicno'])[(s.i % 3) + 1]
  ),
  'Uredno servisirano vozilo, prvi lak, kupljeno u Hrvatskoj. Moguca zamjena.',
  case when s.i in (26, 27) then null
       else lower(s.reg_year||'-'||s.make||'-'||s.model||'-dev-'||s.i) end,
  case when s.i in (26, 27) then null else now() - (s.i || ' days')::interval end
from spec s;

-- Sold listing gets final price data (14.3, 18.2)
update public.listings
  set sold_at = now() - interval '3 days', sold_price = 15900
  where id = '40000002-0000-0000-0000-000000000028';

-- ---------------------------------------------------------------------------
-- Price events - the ONLY write path for prices (15.4); trigger fills
-- listings.price_current. A third of listings get a price drop.
-- ---------------------------------------------------------------------------
insert into public.price_events (listing_id, price, created_at)
select l.id, s.base_price, now() - (s.i || ' days')::interval - interval '12 hours'
from public.listings l
join (select i, listing_id, base_price from (
  select i,
    ('4000000'||lpad(i::text, 1, '0')||'-0000-0000-0000-'||lpad(i::text, 12, '0'))::uuid as listing_id,
    12000 + i * 1350 as base_price
  from generate_series(0, 29) as i
) x) s on s.listing_id = l.id;

insert into public.price_events (listing_id, price, created_at)
select l.id, l.price_current - 500 - (100 * (s.i % 5)), now() - interval '2 days'
from public.listings l
join (select i,
    ('4000000'||lpad(i::text, 1, '0')||'-0000-0000-0000-'||lpad(i::text, 12, '0'))::uuid as listing_id
  from generate_series(0, 29) as i
) s on s.listing_id = l.id
where s.i % 3 = 0 and l.status = 'active';

-- ---------------------------------------------------------------------------
-- Photos: 3 per listing with angle categories (13.3). Private web listings
-- would have none from web upload - but these came through the app.
-- ---------------------------------------------------------------------------
insert into public.listing_photos (listing_id, storage_path, angle_category, sort_order)
select l.id,
       'dev/'||l.id||'/'||p.n||'.jpg',
       (array['exterior','exterior','interior'])[p.n]::public.photo_angle,
       p.n - 1
from public.listings l
cross join (select generate_series(1, 3) as n) p;

-- Dealer 2 (Adria) simulates a DMS import: no angle categories -> gallery
-- fallback without sections (13.3)
update public.listing_photos set angle_category = null
where listing_id in (select id from public.listings where dealer_id = '20000000-0000-0000-0000-000000000002');

-- ---------------------------------------------------------------------------
-- Enrichment (12.2): a few badges - one per listing, validated set (9.6)
-- ---------------------------------------------------------------------------
insert into public.listing_enrichment (listing_id, highlight_badge) values
  ('40000000-0000-0000-0000-000000000000', 'sport_paket'),      -- BMW X1 M Sport
  ('40000001-0000-0000-0000-000000000013', 'prvi_vlasnik'),
  ('40000001-0000-0000-0000-000000000014', 'kupljen_u_hrvatskoj');

-- Vehicle equipment for the first BMW
insert into public.vehicle_equipment (vehicle_id, equipment_code_id, is_highlighted)
select '30000000-0000-0000-0000-000000000000', id, code = 'S402A'
from public.equipment_codes where manufacturer = 'BMW';

-- ---------------------------------------------------------------------------
-- Faza 0: photo sessions (4.2/4.5) - one crossposted (-> pending listing 27),
-- one photo-only, one abandoned
-- ---------------------------------------------------------------------------
insert into public.photo_sessions (user_id, mode, status, vin, vehicle_id, crosspost_consented, listing_id, attribution) values
  ('10000000-0000-0000-0000-000000000001', 'photo', 'completed', 'WVWDEV000SEED0027',
   '30000002-0000-0000-0000-000000000027', true, '40000002-0000-0000-0000-000000000027',
   '{"source": "fb_group", "group": "dev-grupa"}'),
  ('10000000-0000-0000-0000-000000000004', 'photo', 'completed', null, null, false, null,
   '{"source": "fb_group", "group": "dev-grupa"}'),
  ('10000000-0000-0000-0000-000000000004', 'listing', 'in_progress', null, null, false, null, null);

-- ---------------------------------------------------------------------------
-- Engagement: saved search, garage, contact, review
-- ---------------------------------------------------------------------------
insert into public.saved_searches (user_id, market, name, filters, notification_level) values
  ('10000000-0000-0000-0000-000000000004', 'HR', 'BMW X1 · Benzin · do 25.000 EUR',
   '{"make": "BMW", "model": "X1", "fuel": "benzin", "price_max": 25000}', 'instant');

insert into public.garage_items (user_id, listing_id, price_at_save)
select '10000000-0000-0000-0000-000000000004', id, price_current
from public.listings where status = 'active' limit 3;

insert into public.contact_events (id, user_id, listing_id, channel) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004',
   '40000000-0000-0000-0000-000000000000', 'phone_reveal');

insert into public.reviews (dealer_id, user_id, contact_event_id, rating, body) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004',
   '50000000-0000-0000-0000-000000000001', 5, 'Korektan trgovac, auto kakav je opisan.');

-- One open moderation flag for the admin queue
insert into public.moderation_flags (listing_id, flag_type, source, note) values
  ('40000005-0000-0000-0000-000000000005', 'price_outlier', 'ai_sweep',
   'Cijena 40% ispod medijana za model/godiste.');
