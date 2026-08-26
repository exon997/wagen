-- Terenski #27: "broj potvrdjen, ali nije povezan sa salonom" - claim je
-- ovisio o auth.jwt()->>'phone', a taj claim nije pouzdan u svim tokovima
-- (sms prijava u postojeci racun, stariji tokeni bez osvjezenja). Izvor
-- istine je auth.users.phone - security definer ga smije procitati.
-- Usput: normalizacija formata (s '+' ili bez njega).

create or replace function public.claim_dealer_invites()
returns table (dealer_id uuid, display_name text)
language plpgsql security definer set search_path = public
as $$
declare
  my_phone text;
begin
  if auth.uid() is null then
    return;
  end if;

  select replace(u.phone, '+', '') into my_phone
  from auth.users u
  where u.id = auth.uid() and u.phone_confirmed_at is not null;

  if my_phone is null or my_phone = '' then
    return;
  end if;

  return query
  with claimed as (
    update dealer_invites i
    set claimed_by = auth.uid(), claimed_at = now()
    where replace(i.phone, '+', '') = my_phone and i.claimed_at is null
    returning i.dealer_id, i.role
  ), inserted as (
    insert into dealer_members (dealer_id, user_id, role)
    select c.dealer_id, auth.uid(), c.role from claimed
    on conflict (dealer_id, user_id) do nothing
    returning dealer_members.dealer_id
  )
  select d.id, d.display_name
  from dealers d
  where d.id in (select claimed.dealer_id from claimed);
end;
$$;
