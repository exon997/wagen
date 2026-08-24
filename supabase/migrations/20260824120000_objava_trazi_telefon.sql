-- J2: The product gate "publishing requires a verified phone" (3.2, 4.3)
-- enforced at the DB level, not just in app code. The GoTrue JWT carries the
-- confirmed phone as the 'phone' claim - anonymous sessions have it empty.
--
-- Applies ONLY to the private-seller branch (user_id path). Dealers publish
-- through dealer membership with email identity (5.3) - no phone requirement.

drop policy listings_owner_insert on public.listings;

create policy listings_owner_insert on public.listings
  for insert to authenticated with check (
    (
      user_id = (select auth.uid())
      and dealer_id is null
      and nullif(auth.jwt() ->> 'phone', '') is not null
    )
    or (dealer_id is not null and public.is_dealer_member(dealer_id))
  );
