-- H2: Storage bucket for session photos (4.5 - backend receives photos from
-- day one). Private bucket; path scheme {user_id}/{session_id}/{filename}.
-- Owner-scoped RLS mirrors photo_sessions ownership (anonymous users
-- included, 4.3). Listing photos get their own bucket in the J-block when
-- sessions turn into listings.

insert into storage.buckets (id, name, public)
values ('session-photos', 'session-photos', false)
on conflict (id) do nothing;

-- First path segment must be the caller's uid - the same physical-ownership
-- principle as everywhere else (nobody can write into someone else's folder).
create policy session_photos_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'session-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy session_photos_owner_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'session-photos'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
  );

create policy session_photos_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'session-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
