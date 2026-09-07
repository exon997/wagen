-- Preduvjet Video PLG-a (4.7) i ispravak javne stranice/feeda: obradjene
-- (AI studio) fotografije se sinkroniziraju u Storage uz originale.
-- Putanja: {user_id}/{session_id}/{photo_id}-processed.jpg (iste RLS
-- politike kao originali - isti folder).

alter table public.photo_session_photos
  add column processed_storage_path text;

comment on column public.photo_session_photos.processed_storage_path is
  'AI studio verzija fotografije u session-photos bucketu; null = jos nije sinkronizirana. Potrosaci (javna stranica, feed, video render) preferiraju ovu, fallback na storage_path.';
