-- B3: Extensible categories - hybrid model (15.2).
-- Category is an entity with its own attribute set. A new category (Faza 2)
-- or a new listing type (Faza 3: parts/tyres) = rows in these tables,
-- zero schema migrations.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  -- 'vehicle' now; Faza 3 introduces e.g. 'part' with different common
  -- assumptions (quantity instead of VIN) through the same mechanism (15.2).
  kind text not null default 'vehicle',
  is_active boolean not null default false,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.categories is
  'Vehicle categories (15.2). Faza 1: only osobna vozila active (7).';

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create type public.attribute_type as enum ('text', 'number', 'boolean', 'enum');

create table public.category_attributes (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete cascade,
  key text not null,
  label text not null,            -- Croatian UI label
  data_type public.attribute_type not null,
  unit text,                      -- e.g. 'kW', 'ccm'
  enum_values jsonb,              -- for data_type='enum': [{"value","label"}]
  is_filterable boolean not null default false,
  is_required boolean not null default false,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (category_id, key)
);
comment on table public.category_attributes is
  'Attribute definitions per category (15.2). listings.attributes JSONB is validated against this (zod in packages/domain).';

alter table public.categories enable row level security;
alter table public.category_attributes enable row level security;

-- ---------------------------------------------------------------------------
-- Seed: osobna vozila (Faza 1). Attribute keys are English (code), labels and
-- enum values Croatian (user-facing data). Required set follows 3.2.
-- ---------------------------------------------------------------------------
insert into public.categories (slug, name, kind, is_active, display_order)
values ('osobna-vozila', 'Osobna vozila', 'vehicle', true, 1);

with c as (select id from public.categories where slug = 'osobna-vozila')
insert into public.category_attributes
  (category_id, key, label, data_type, unit, enum_values, is_filterable, is_required, display_order)
select c.id, a.* from c, (values
  ('fuel', 'Gorivo', 'enum'::public.attribute_type, null,
   '[{"value":"benzin","label":"Benzin"},{"value":"dizel","label":"Dizel"},{"value":"hibrid","label":"Hibrid"},{"value":"plug-in-hibrid","label":"Plug-in hibrid"},{"value":"elektricni","label":"Električni"},{"value":"plin","label":"Plin (LPG)"}]'::jsonb,
   true, true, 1),
  ('transmission', 'Mjenjač', 'enum', null,
   '[{"value":"rucni","label":"Ručni"},{"value":"automatski","label":"Automatski"}]',
   true, true, 2),
  ('power_kw', 'Snaga', 'number', 'kW', null, true, true, 3),
  ('drive', 'Pogon', 'enum', null,
   '[{"value":"prednji","label":"Prednji"},{"value":"straznji","label":"Stražnji"},{"value":"4x4","label":"4x4"}]',
   true, false, 4),
  ('body_type', 'Karoserija', 'enum', null,
   '[{"value":"limuzina","label":"Limuzina"},{"value":"karavan","label":"Karavan"},{"value":"suv","label":"SUV"},{"value":"hatchback","label":"Hatchback"},{"value":"coupe","label":"Coupé"},{"value":"kabriolet","label":"Kabriolet"},{"value":"monovolumen","label":"Monovolumen"},{"value":"pickup","label":"Pick-up"},{"value":"ostalo","label":"Ostalo"}]',
   true, false, 5),
  ('color', 'Boja', 'enum', null,
   '[{"value":"crna","label":"Crna"},{"value":"bijela","label":"Bijela"},{"value":"siva","label":"Siva"},{"value":"srebrna","label":"Srebrna"},{"value":"plava","label":"Plava"},{"value":"crvena","label":"Crvena"},{"value":"zelena","label":"Zelena"},{"value":"smedja","label":"Smeđa"},{"value":"bez","label":"Bež"},{"value":"zuta","label":"Žuta"},{"value":"narancasta","label":"Narančasta"},{"value":"ostalo","label":"Ostalo"}]',
   true, false, 6),
  ('doors', 'Broj vrata', 'number', null, null, false, false, 7),
  ('engine_ccm', 'Obujam motora', 'number', 'ccm', null, false, false, 8),
  ('condition', 'Stanje vozila', 'enum', null,
   '[{"value":"novo","label":"Novo"},{"value":"rabljeno","label":"Rabljeno"},{"value":"osteceno","label":"Oštećeno"},{"value":"popravljena-steta","label":"Popravljena šteta"}]',
   true, true, 9),
  ('owners_count', 'Broj vlasnika', 'number', null, null, true, true, 10),
  ('service_book', 'Servisna knjiga', 'enum', null,
   '[{"value":"da","label":"Da"},{"value":"ne","label":"Ne"},{"value":"djelomicno","label":"Djelomično"}]',
   true, true, 11)
) as a(key, label, data_type, unit, enum_values, is_filterable, is_required, display_order);
