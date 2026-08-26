-- Popravak 42702: OUT parametar dealer_id (returns table) sudara se s
-- imenom kolone u ON CONFLICT listi - plpgsql pokusava substituciju
-- varijable. #variable_conflict use_column daje prednost kolonama.

create or replace function public.claim_dealer_invites()
returns table (dealer_id uuid, display_name text)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
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
    select c.dealer_id, auth.uid(), c.role from claimed c
    on conflict (dealer_id, user_id) do nothing
    returning dealer_members.dealer_id
  )
  select d.id, d.display_name
  from dealers d
  where d.id in (select c2.dealer_id from claimed c2);
end;
$$;
