-- Le immagini delle Gazzette richiedono Premium anche direttamente in Storage,
-- senza dipendere dalle regole della tabella gazzette.
drop policy if exists gazzette_files_read on storage.objects;
create policy gazzette_files_read on storage.objects for select to authenticated using (
  bucket_id = 'gazzette' and exists (
    select 1 from public.gazzette g join public.matches m on m.id = g.match_id
    where (storage.objects.name = g.file_path or storage.objects.name = regexp_replace(g.file_path, '\.jpg$', '-t.jpg'))
      and public.gazzetta_access(m.league_id) and public.history_date_visible(m.date)
  )
);
