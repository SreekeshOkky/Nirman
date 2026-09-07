-- Allow authors and builders to delete standalone site notes.
create policy "Authors and builders can delete notes"
on public.notes for delete
using (created_by = auth.uid() or public.is_site_owner(site_id));
