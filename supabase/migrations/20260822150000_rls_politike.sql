-- B9: RLS policies for all tables (15.6 - RLS from day one).
-- Matrix approved 2026-08-22. RLS was enabled per-table in B2-B8 (deny-all);
-- this migration adds the actual policies.
--
-- Principles:
-- * The Node worker and server-side jobs use the secret (service) key and
--   bypass RLS entirely - policies below govern JWT clients only.
-- * Anonymous sessions (4.3) carry role 'authenticated' with a valid
--   auth.uid() - they are first-class and covered by "owner" policies.
-- * Market isolation (15.2): public reads are scoped to the requesting
--   market via the x-wagen-market header, defaulting to 'HR'.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Requesting market: read from the x-wagen-market header (set by wagen.hr /
-- wagen.si frontends), default 'HR'. An unknown market simply matches nothing.
create function public.request_market()
returns text
language plpgsql stable
as $$
declare h text;
begin
  begin
    h := current_setting('request.headers', true)::json ->> 'x-wagen-market';
  exception when others then
    h := null;
  end;
  return coalesce(nullif(h, ''), 'HR');
end;
$$;

-- Admin = JWT app_metadata.role claim. Set only via service-side tooling.
create function public.is_admin()
returns boolean
language sql stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

-- security definer: these cross RLS boundaries on purpose (e.g. a listings
-- policy checking dealer_members must not recurse into dealer_members RLS).
create function public.is_dealer_member(d uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from dealer_members
    where dealer_id = d and user_id = auth.uid()
  );
$$;

create function public.is_dealer_owner(d uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from dealer_members
    where dealer_id = d and user_id = auth.uid() and role = 'owner'
  );
$$;

-- Does the current user own the listing (directly or through their dealer)?
create function public.owns_listing(l_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from listings l
    where l.id = l_id
      and (l.user_id = auth.uid()
           or (l.dealer_id is not null and public.is_dealer_member(l.dealer_id)))
  );
$$;

-- Full visibility rule for a listing, reused by child tables (photos,
-- enrichment, price_events).
create function public.can_view_listing(l_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from listings l
    where l.id = l_id
      and ((l.status in ('active', 'sold') and l.market = public.request_market())
           or l.user_id = auth.uid()
           or (l.dealer_id is not null and public.is_dealer_member(l.dealer_id))
           or public.is_admin())
  );
$$;

-- Vehicle-level visibility: a vehicle is public when it has a publicly
-- visible listing; its owner sees it through any own listing or session.
create function public.can_view_vehicle(v_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1 from listings l
      where l.vehicle_id = v_id
        and ((l.status in ('active', 'sold') and l.market = public.request_market())
             or l.user_id = auth.uid()
             or (l.dealer_id is not null and public.is_dealer_member(l.dealer_id)))
    )
    or exists (
      select 1 from photo_sessions s
      where s.vehicle_id = v_id and s.user_id = auth.uid()
    );
$$;

create function public.owns_vehicle_via_listing(v_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from listings l
    where l.vehicle_id = v_id
      and (l.user_id = auth.uid()
           or (l.dealer_id is not null and public.is_dealer_member(l.dealer_id)))
  ) or exists (
    select 1 from photo_sessions s
    where s.vehicle_id = v_id and s.user_id = auth.uid()
  );
$$;

-- Review precondition (11): the referenced contact event must belong to the
-- reviewer and point at a listing of the reviewed dealer.
create function public.review_contact_valid(ce_id uuid, d_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from contact_events ce
    join listings l on l.id = ce.listing_id
    where ce.id = ce_id and ce.user_id = auth.uid() and l.dealer_id = d_id
  );
$$;

-- ---------------------------------------------------------------------------
-- Public reference data: markets, categories, category_attributes, plans,
-- equipment_codes. Readable by everyone; written only by admin (worker uses
-- the service key and bypasses RLS anyway).
-- ---------------------------------------------------------------------------
create policy markets_public_read on public.markets
  for select using (true);
create policy markets_admin_write on public.markets
  for all using (public.is_admin()) with check (public.is_admin());

create policy categories_public_read on public.categories
  for select using (true);
create policy categories_admin_write on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

create policy category_attributes_public_read on public.category_attributes
  for select using (true);
create policy category_attributes_admin_write on public.category_attributes
  for all using (public.is_admin()) with check (public.is_admin());

create policy plans_public_read on public.plans
  for select using ((is_active and market = public.request_market()) or public.is_admin());
create policy plans_admin_write on public.plans
  for all using (public.is_admin()) with check (public.is_admin());

create policy equipment_codes_public_read on public.equipment_codes
  for select using (true);
create policy equipment_codes_admin_write on public.equipment_codes
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- profiles: NOT public - a private seller appears as "Privatni prodavac"
-- without a name on cards (13.1). Own profile only.
-- ---------------------------------------------------------------------------
create policy profiles_own_read on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy profiles_own_insert on public.profiles
  for insert with check (id = auth.uid());
create policy profiles_own_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- dealers: active dealers are public (profile page), scoped to market.
-- Members see their own dealer in any status; owners update it.
-- Dealer creation + first membership happen server-side (B2B registration
-- endpoint, concierge flow 5.3) - no client insert policy on purpose.
-- ---------------------------------------------------------------------------
create policy dealers_public_read on public.dealers
  for select using (
    (status = 'active' and market = public.request_market())
    or public.is_dealer_member(id)
    or public.is_admin()
  );
create policy dealers_owner_update on public.dealers
  for update using (public.is_dealer_owner(id) or public.is_admin())
  with check (public.is_dealer_owner(id) or public.is_admin());
create policy dealers_admin_insert on public.dealers
  for insert with check (public.is_admin());
create policy dealers_admin_delete on public.dealers
  for delete using (public.is_admin());

-- dealer_members: the roster is visible to members of the same dealer;
-- owners manage it. Seat limits per plan are app-level (B2).
create policy dealer_members_member_read on public.dealer_members
  for select using (
    user_id = auth.uid() or public.is_dealer_member(dealer_id) or public.is_admin()
  );
create policy dealer_members_owner_write on public.dealer_members
  for insert with check (public.is_dealer_owner(dealer_id) or public.is_admin());
create policy dealer_members_owner_update on public.dealer_members
  for update using (public.is_dealer_owner(dealer_id) or public.is_admin())
  with check (public.is_dealer_owner(dealer_id) or public.is_admin());
create policy dealer_members_owner_delete on public.dealer_members
  for delete using (
    public.is_dealer_owner(dealer_id) or user_id = auth.uid() or public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- vehicles: public read (needed to render listing pages; price-history
-- features build on open vehicle data). Insert by any authenticated user
-- (VIN scan / manual entry); updates only via service or admin (corrections
-- of fuel/transmission live in listing.attributes, not on the vehicle - 3.2).
-- ---------------------------------------------------------------------------
create policy vehicles_public_read on public.vehicles
  for select using (true);
create policy vehicles_authenticated_insert on public.vehicles
  for insert to authenticated with check (true);
create policy vehicles_admin_update on public.vehicles
  for update using (public.is_admin()) with check (public.is_admin());
create policy vehicles_admin_delete on public.vehicles
  for delete using (public.is_admin());

-- ---------------------------------------------------------------------------
-- listings: the heart of the matrix. Public sees active+sold in the
-- requesting market (17.3: sold stays visible); owners see and edit their
-- own; dealer members their dealer's. No client delete - removal is a
-- status change (17.3), hard delete is admin-only.
-- ---------------------------------------------------------------------------
create policy listings_visible_read on public.listings
  for select using (
    (status in ('active', 'sold') and market = public.request_market())
    or user_id = auth.uid()
    or (dealer_id is not null and public.is_dealer_member(dealer_id))
    or public.is_admin()
  );
create policy listings_owner_insert on public.listings
  for insert to authenticated with check (
    (user_id = auth.uid() and dealer_id is null)
    or (dealer_id is not null and public.is_dealer_member(dealer_id))
  );
create policy listings_owner_update on public.listings
  for update using (
    user_id = auth.uid()
    or (dealer_id is not null and public.is_dealer_member(dealer_id))
    or public.is_admin()
  ) with check (
    user_id = auth.uid()
    or (dealer_id is not null and public.is_dealer_member(dealer_id))
    or public.is_admin()
  );
create policy listings_admin_delete on public.listings
  for delete using (public.is_admin());

-- listing_photos / listing_enrichment / price_events follow the parent.
create policy listing_photos_read on public.listing_photos
  for select using (public.can_view_listing(listing_id));
create policy listing_photos_owner_write on public.listing_photos
  for insert with check (public.owns_listing(listing_id) or public.is_admin());
create policy listing_photos_owner_update on public.listing_photos
  for update using (public.owns_listing(listing_id) or public.is_admin())
  with check (public.owns_listing(listing_id) or public.is_admin());
create policy listing_photos_owner_delete on public.listing_photos
  for delete using (public.owns_listing(listing_id) or public.is_admin());

create policy listing_enrichment_read on public.listing_enrichment
  for select using (public.can_view_listing(listing_id));
create policy listing_enrichment_owner_write on public.listing_enrichment
  for insert with check (public.owns_listing(listing_id) or public.is_admin());
create policy listing_enrichment_owner_update on public.listing_enrichment
  for update using (public.owns_listing(listing_id) or public.is_admin())
  with check (public.owns_listing(listing_id) or public.is_admin());
create policy listing_enrichment_owner_delete on public.listing_enrichment
  for delete using (public.owns_listing(listing_id) or public.is_admin());

-- price_events: APPEND-ONLY for every JWT client (15.4) - there is
-- deliberately no update or delete policy, not even for admin. History does
-- not get rewritten.
create policy price_events_read on public.price_events
  for select using (public.can_view_listing(listing_id));
create policy price_events_owner_insert on public.price_events
  for insert with check (public.owns_listing(listing_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- vehicle_equipment / documents: follow vehicle visibility. Equipment writes
-- come from the decode pipeline (service key); highlight curation arrives
-- with Kokpit and will extend these policies then.
-- ---------------------------------------------------------------------------
create policy vehicle_equipment_read on public.vehicle_equipment
  for select using (public.can_view_vehicle(vehicle_id));
create policy vehicle_equipment_admin_write on public.vehicle_equipment
  for all using (public.is_admin()) with check (public.is_admin());

create policy documents_read on public.documents
  for select using (public.can_view_vehicle(vehicle_id));
create policy documents_owner_insert on public.documents
  for insert with check (
    uploaded_by = auth.uid() and public.owns_vehicle_via_listing(vehicle_id)
  );
create policy documents_owner_delete on public.documents
  for delete using (
    uploaded_by = auth.uid() or public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- photo_sessions: strictly private to their (often anonymous) owner (4.3).
-- Admin may read for Faza 0 metrics (18.3) - no admin writes.
-- ---------------------------------------------------------------------------
create policy photo_sessions_own_read on public.photo_sessions
  for select using (user_id = auth.uid() or public.is_admin());
create policy photo_sessions_own_insert on public.photo_sessions
  for insert with check (user_id = auth.uid());
create policy photo_sessions_own_update on public.photo_sessions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy photo_sessions_own_delete on public.photo_sessions
  for delete using (user_id = auth.uid());

create policy photo_session_photos_own_all on public.photo_session_photos
  for all using (
    exists (select 1 from public.photo_sessions s
            where s.id = session_id and (s.user_id = auth.uid() or public.is_admin()))
  ) with check (
    exists (select 1 from public.photo_sessions s
            where s.id = session_id and s.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- saved_searches / garage_items / notifications: private. Deliberately NO
-- admin read - this is user-private data the platform has no business
-- browsing (matrix decision). Notifications are inserted by the worker
-- (service key); clients only read and mark as read / delete.
-- ---------------------------------------------------------------------------
create policy saved_searches_own_all on public.saved_searches
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy garage_items_own_all on public.garage_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notifications_own_read on public.notifications
  for select using (user_id = auth.uid());
create policy notifications_own_update on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_own_delete on public.notifications
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- contact_events: user logs their own contact; dealer members read events on
-- their own listings (18.1 stats); admin reads all.
-- ---------------------------------------------------------------------------
create policy contact_events_read on public.contact_events
  for select using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.listings l
      where l.id = listing_id
        and l.dealer_id is not null
        and public.is_dealer_member(l.dealer_id)
    )
  );
create policy contact_events_own_insert on public.contact_events
  for insert to authenticated with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- reviews (11): published reviews are public; insert requires a contact
-- event owned by the reviewer pointing at the reviewed dealer. One review
-- per user per dealer is the unique constraint from B7.
-- ---------------------------------------------------------------------------
create policy reviews_public_read on public.reviews
  for select using (
    status = 'published'
    or user_id = auth.uid()
    or public.is_dealer_member(dealer_id)
    or public.is_admin()
  );
create policy reviews_own_insert on public.reviews
  for insert with check (
    user_id = auth.uid()
    and public.review_contact_valid(contact_event_id, dealer_id)
  );
create policy reviews_own_update on public.reviews
  for update using (user_id = auth.uid() and status = 'published')
  with check (user_id = auth.uid() and status = 'published');
create policy reviews_admin_moderate on public.reviews
  for update using (public.is_admin()) with check (public.is_admin());
create policy reviews_admin_delete on public.reviews
  for delete using (public.is_admin());

-- ---------------------------------------------------------------------------
-- subscriptions / invoices: read-only for the respective owner; all writes
-- come from Stripe webhooks through the service key.
-- ---------------------------------------------------------------------------
create policy subscriptions_owner_read on public.subscriptions
  for select using (public.is_dealer_owner(dealer_id) or public.is_admin());

create policy invoices_owner_read on public.invoices
  for select using (
    (dealer_id is not null and public.is_dealer_owner(dealer_id))
    or user_id = auth.uid()
    or public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- moderation_flags (8): users may report a listing; only admin sees the
-- queue and resolves it. AI writes go through the service key.
-- ---------------------------------------------------------------------------
create policy moderation_flags_admin_read on public.moderation_flags
  for select using (public.is_admin());
create policy moderation_flags_user_report on public.moderation_flags
  for insert to authenticated with check (
    source = 'user_report' and reporter_user_id = auth.uid()
  );
create policy moderation_flags_admin_update on public.moderation_flags
  for update using (public.is_admin()) with check (public.is_admin());
