-- Decision 0008: private CV photos, one folder per user.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cv-photos', 'cv-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']);

create policy "own cv photos: read" on storage.objects
  for select to authenticated
  using (bucket_id = 'cv-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own cv photos: upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cv-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own cv photos: update" on storage.objects
  for update to authenticated
  using (bucket_id = 'cv-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'cv-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own cv photos: delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cv-photos' and (storage.foldername(name))[1] = auth.uid()::text);
