-- Faza B (Kokpit-lite, sekcija 9/18): clanovi salona vide SVE sesije svog
-- salona - dosad je RLS davao samo vlastite (fotograf). Vlasnistvo pisanja
-- ostaje na fotografu; salon dobiva uvid (read-only za tudje sesije).

drop policy photo_sessions_own_read on public.photo_sessions;
create policy photo_sessions_own_read on public.photo_sessions
  for select using (
    user_id = auth.uid()
    or (dealer_id is not null and public.is_dealer_member(dealer_id))
    or public.is_admin()
  );

drop policy photo_session_photos_own_all on public.photo_session_photos;
create policy photo_session_photos_own_all on public.photo_session_photos
  for all using (
    exists (select 1 from public.photo_sessions s
            where s.id = session_id
              and (s.user_id = auth.uid()
                   or (s.dealer_id is not null and public.is_dealer_member(s.dealer_id))
                   or public.is_admin()))
  ) with check (
    exists (select 1 from public.photo_sessions s
            where s.id = session_id and s.user_id = auth.uid())
  );

-- Storage: putanja je {user_id}/{session_id}/{photo_id}.jpg - drugi segment
-- vodi na sesiju, pa clan salona cita fotke sesija svog salona
create policy session_photos_dealer_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'session-photos'
    and exists (
      select 1 from public.photo_sessions s
      where s.id::text = (storage.foldername(name))[2]
        and s.dealer_id is not null
        and public.is_dealer_member(s.dealer_id)
    )
  );
