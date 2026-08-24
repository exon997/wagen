-- Photo categories v2 (13.3 AZURIRANO 2026-08-24) + photo suggestions.
--
-- 1) photo_angle enum grows: trunk / feature / mechanical (five-section
--    gallery; 'detail' stays for the wheel shot and legacy data).
-- 2) equipment_codes learns photo suggestions - classified ONCE per code
--    (same philosophy as translation): should the app suggest photographing
--    this feature, how prominently, and with what instruction.

alter type public.photo_angle add value if not exists 'trunk';
alter type public.photo_angle add value if not exists 'feature';
alter type public.photo_angle add value if not exists 'mechanical';

alter table public.equipment_codes
  add column photo_suggest boolean not null default false,
  add column photo_rank smallint check (photo_rank is null or (photo_rank between 1 and 5)),
  add column photo_hint text;

comment on column public.equipment_codes.photo_suggest is
  'Should the app suggest photographing this feature? Classified once, forever - features already covered by the 16 standard shots stay false.';
comment on column public.equipment_codes.photo_rank is
  'Selling value 1-5; the app surfaces top-ranked suggestions first.';
comment on column public.equipment_codes.photo_hint is
  'Short Croatian instruction shown in the camera overlay for this feature.';
