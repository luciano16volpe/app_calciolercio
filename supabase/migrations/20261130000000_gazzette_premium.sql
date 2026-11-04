-- La lettura delle Gazzette richiede Premium e appartenenza alla lega.
create function public.gazzetta_access(p_league uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.has_premium(auth.uid()) and public.league_visible(p_league);
$$;
revoke all on function public.gazzetta_access(uuid) from public;
grant execute on function public.gazzetta_access(uuid) to authenticated, anon;

create policy gazzette_premium_limit on public.gazzette as restrictive for select
  using (public.gazzetta_access(public.match_league(match_id)));

-- Anche la scrittura deve funzionare per la redazione senza abbonamento:
-- non concede loro accesso in lettura alle immagini.
create function public.publish_gazzetta(p_match uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare l uuid;
begin
  select league_id into l from public.matches where id = p_match;
  if l is null or not public.has_league_role(l, array['admin','redazione']::public.league_role[]) then
    raise exception 'Permesso negato';
  end if;
  if p_path is null or p_path not like l::text || '/' || p_match::text || '-%.jpg'
    or not exists (select 1 from storage.objects where bucket_id = 'gazzette' and name = p_path) then
    raise exception 'File Gazzetta non valido';
  end if;
  insert into public.gazzette(match_id, file_path) values (p_match, p_path)
    on conflict (match_id) do update set file_path = excluded.file_path;
end $$;
revoke all on function public.publish_gazzetta(uuid, text) from public, anon;
grant execute on function public.publish_gazzetta(uuid, text) to authenticated;
