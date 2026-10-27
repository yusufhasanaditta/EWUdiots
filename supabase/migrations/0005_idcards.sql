-- EWUdiots 0005: private ID card pictures (front, back, pass photo) so a student's pass follows them to every device.
-- Files live at idcards/<user id>/<front|back|photo>.jpg. Only the owner can read, write or delete them; there is no
-- public or admin read policy.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('idcards', 'idcards', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "idcards read own" on storage.objects for select to authenticated
  using (bucket_id = 'idcards' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "idcards upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'idcards' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "idcards update own" on storage.objects for update to authenticated
  using (bucket_id = 'idcards' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'idcards' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "idcards delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'idcards' and (storage.foldername(name))[1] = auth.uid()::text);
