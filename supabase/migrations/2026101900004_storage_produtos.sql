insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produtos', 'produtos', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;

create policy "admin envia imagens" on storage.objects for insert to authenticated
  with check (bucket_id = 'produtos' and public.is_admin());
create policy "admin altera imagens" on storage.objects for update to authenticated
  using (bucket_id = 'produtos' and public.is_admin());
create policy "admin remove imagens" on storage.objects for delete to authenticated
  using (bucket_id = 'produtos' and public.is_admin());
