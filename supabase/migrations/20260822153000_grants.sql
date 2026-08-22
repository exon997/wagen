-- B9b: Table grants - the coarse privilege layer under RLS.
-- Newer Supabase versions grant NO DML to anon/authenticated by default
-- (hardening); every access must be granted explicitly. RLS (B9) then
-- filters rows within what is granted here.
--
-- Roles:
-- * anon           - unauthenticated visitors: read-only. Every write path
--                    in the product requires at least an anonymous SESSION
--                    (role authenticated, 4.3), so anon never writes.
-- * authenticated  - logged-in AND anonymous-session users: DML, RLS-filtered.
-- * service_role   - worker, webhooks, admin tooling: full DML, bypasses RLS.

grant usage on schema public to anon, authenticated, service_role;

grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;

-- Policy helper functions (request_market, is_admin, owns_listing...) execute
-- as the calling role - they need EXECUTE.
grant execute on all functions in schema public to anon, authenticated, service_role;

-- Future objects created by migrations (role postgres) inherit the same.
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
