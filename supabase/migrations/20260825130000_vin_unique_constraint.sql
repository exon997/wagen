-- vin: parcijalni unique indeks -> pravi unique constraint.
--
-- Razlog (terenski, 2026-08-25): ON CONFLICT (vin) u vin-decode upsertu ne
-- moze koristiti parcijalni indeks (where vin is not null) pa je svaki novi
-- decode pucao na upisu. Unique CONSTRAINT u Postgresu dopusta vise NULL
-- vrijednosti (NULL != NULL), pa semantika 15.1 (oldtimeri bez VIN-a)
-- ostaje identicna - a upsert radi.

drop index if exists public.vehicles_vin_unique;

alter table public.vehicles
  add constraint vehicles_vin_unique unique (vin);
