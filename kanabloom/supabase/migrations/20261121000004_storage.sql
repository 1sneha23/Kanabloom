-- Private media bucket for videos, audio, thumbnails, images.
-- Signed-in learners can read (the app requests short-lived signed URLs); only the owner can write.
-- Object path convention: videos/<uuid>.mp4, thumbnails/<uuid>.jpg, audio/<script>/<char>.mp3, images/...

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 524288000,
        array['video/mp4', 'video/webm', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg',
              'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'text/vtt'])
on conflict (id) do nothing;

create policy media_read on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.is_active_user());
create policy media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_admin());
create policy media_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.is_admin()) with check (bucket_id = 'media' and public.is_admin());
create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_admin());
