-- Faza C (12, outbound): tajni token po salonu za izvozni feed
-- (wagen.hr/api/feed/{dealerId}?token=...). Portali (Njuskalo/Index)
-- povlace XML; token se dijeli portalu pri uspostavi integracije.
-- Citanje tokena: iskljucivo service role (nema RLS politike za klijente).

alter table public.dealers
  add column feed_token uuid not null default gen_random_uuid();

comment on column public.dealers.feed_token is
  'Tajni token izvoznog XML feeda (Faza C). Rotacija = novi gen_random_uuid().';
