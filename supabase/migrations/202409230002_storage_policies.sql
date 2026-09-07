-- Private receipt access for site members.
-- The first path segment is always the site UUID.

create policy "Site members can view receipts"
on storage.objects for select
to authenticated
using (
  bucket_id = 'receipts'
  and public.is_site_member((storage.foldername(name))[1]::uuid)
);

create policy "Site members can upload receipts"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'receipts'
  and public.is_site_member((storage.foldername(name))[1]::uuid)
);

create policy "Builders can update receipts"
on storage.objects for update
to authenticated
using (
  bucket_id = 'receipts'
  and public.is_site_owner((storage.foldername(name))[1]::uuid)
)
with check (
  bucket_id = 'receipts'
  and public.is_site_owner((storage.foldername(name))[1]::uuid)
);

create policy "Builders can delete receipts"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'receipts'
  and public.is_site_owner((storage.foldername(name))[1]::uuid)
);
