-- B5: Equipment dictionary and vehicle documents (13.4, 10, 13.5, 15.5).

-- ---------------------------------------------------------------------------
-- equipment_codes: global dictionary (15.5) - manufacturer + code -> names.
-- Market-neutral shared asset by decision (15.2). Built from real traffic:
-- ingest hits an unknown code -> one Claude API call translates it -> stored
-- forever (13.4). New machine translations wait in the admin review queue.
-- ---------------------------------------------------------------------------
create type public.translation_status as enum ('untranslated', 'machine_translated', 'approved');

create table public.equipment_codes (
  id uuid primary key default gen_random_uuid(),
  manufacturer text not null,
  code text not null,
  name_en text,
  name_hr text,
  translation_status public.translation_status not null default 'untranslated',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (manufacturer, code)
);
comment on table public.equipment_codes is
  'Global equipment-code dictionary (13.4). Translated once, forever. Shared across markets (15.2).';

create index equipment_codes_review_idx on public.equipment_codes (translation_status)
  where translation_status <> 'approved';

create trigger equipment_codes_set_updated_at
  before update on public.equipment_codes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- vehicle_equipment: factory equipment is a property of the VEHICLE, not the
-- listing (15.5) - it survives across listings of the same car.
-- ---------------------------------------------------------------------------
create table public.vehicle_equipment (
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  equipment_code_id uuid not null references public.equipment_codes (id) on delete cascade,
  -- Curated subset shown as chips in Sloj 1 (13.4); selection criteria TBD.
  is_highlighted boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (vehicle_id, equipment_code_id)
);

-- ---------------------------------------------------------------------------
-- documents: seller-uploaded vehicle documentation (10). FK to the VEHICLE -
-- an Aviloo certificate holds for the next listing of the same car (13.5).
-- type distinguishes a generic PDF from an Aviloo certificate, which gets
-- structured fields for the SoH block on EV/PHEV listing pages.
-- ---------------------------------------------------------------------------
create type public.document_type as enum ('generic', 'aviloo_certificate');

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  uploaded_by uuid references auth.users (id) on delete set null,
  type public.document_type not null default 'generic',
  title text not null,
  storage_path text not null,
  -- Aviloo-only structured fields (13.5); NULL for generic documents.
  soh_percent numeric(5, 2) check (soh_percent is null or (soh_percent >= 0 and soh_percent <= 100)),
  test_date date,
  created_at timestamptz not null default now()
);
comment on table public.documents is
  'Vehicle documentation (10). Aviloo certificates get structured SoH display (13.5); everything else is a plain attachment.';

create index documents_vehicle_idx on public.documents (vehicle_id);

alter table public.equipment_codes enable row level security;
alter table public.vehicle_equipment enable row level security;
alter table public.documents enable row level security;
