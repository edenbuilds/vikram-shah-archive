-- Public object store for the Shah v. Trindade paper archive.
-- Heavy files (page JPEGs, original PDFs, ZIPs) live here so Vercel stays light.

insert into storage.buckets (id, name, public, file_size_limit)
values ('archive', 'archive', true, 52428800)
on conflict (id) do update set public = true;

drop policy if exists "archive public read" on storage.objects;
create policy "archive public read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'archive');
