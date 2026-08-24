-- E2: The VIN provider decision is open (Outvin vs vindata - both behind the
-- same adapter). The schema goes provider-neutral: cache columns lose the
-- Outvin-specific names, the source enum learns the new provider.
-- (15.1 concept unchanged: vehicles carries the decoded cache, forever.)

alter type public.vin_source add value if not exists 'vindata';

alter table public.vehicles rename column outvin_data to decode_data;
alter table public.vehicles rename column outvin_fetched_at to decode_fetched_at;

comment on column public.vehicles.decode_data is
  'Raw provider decode response (15.1 server-side cache). Provider identified by vin_decoded_source.';
