-- Un admin senza Premium attivo (scaduto) continua a gestire la lega al minimo:
-- partite, pagelle, sorteggio, rosa, inviti e membri.
-- Restano riservati al Premium: impostazioni avanzate e eliminazione della lega,
-- eliminazione giocatori, pubblicazione delle Gazzette (la redazione resta libera di pubblicarle).

create or replace function public.has_league_role(l uuid, r public.league_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.league_members m where m.league_id = l and m.user_id = auth.uid() and m.role = any(r));
$$;

create or replace function public.is_any_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.league_members where user_id = auth.uid() and role = 'admin');
$$;

-- Modifica giocatori: non richiede Premium. L'eliminazione (can_delete_player) sì.
create or replace function public.can_edit_player(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.league_players lp join public.league_members lm on lm.league_id = lp.league_id where lp.player_id = p and lm.user_id = auth.uid() and lm.role = 'admin')
    or (exists (select 1 from public.players where id = p and created_by = auth.uid()) and public.is_any_admin() and not exists (select 1 from public.league_players where player_id = p));
$$;

-- Admin con Premium attivo della lega, oppure super amministratore.
create or replace function public.is_premium_league_admin(l uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or (public.has_premium(auth.uid()) and public.is_league_admin(l));
$$;
revoke all on function public.is_premium_league_admin(uuid) from public, anon;
grant execute on function public.is_premium_league_admin(uuid) to authenticated;

-- Gazzette: redazione sempre, admin solo con Premium.
create or replace function public.can_write_gazzetta(l uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_league_role(l, array['redazione']::public.league_role[]) or public.is_premium_league_admin(l);
$$;
revoke all on function public.can_write_gazzetta(uuid) from public, anon;
grant execute on function public.can_write_gazzetta(uuid) to authenticated;

drop policy if exists leagues_update on public.leagues;
create policy leagues_update on public.leagues for update to authenticated using (public.is_premium_league_admin(id));
drop policy if exists leagues_delete on public.leagues;
create policy leagues_delete on public.leagues for delete to authenticated using (public.is_premium_league_admin(id));

drop policy if exists gazzette_write on public.gazzette;
create policy gazzette_write on public.gazzette for all to authenticated
  using (public.can_write_gazzetta(public.match_league(match_id)))
  with check (public.can_write_gazzetta(public.match_league(match_id)));

drop policy if exists gazzette_files_write on storage.objects;
create policy gazzette_files_write on storage.objects for insert to authenticated
  with check (bucket_id = 'gazzette' and public.can_write_gazzetta(((storage.foldername(name))[1])::uuid));
drop policy if exists gazzette_files_update on storage.objects;
create policy gazzette_files_update on storage.objects for update to authenticated
  using (bucket_id = 'gazzette' and public.can_write_gazzetta(((storage.foldername(name))[1])::uuid));
drop policy if exists gazzette_files_delete on storage.objects;
create policy gazzette_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'gazzette' and public.can_write_gazzetta(((storage.foldername(name))[1])::uuid));

create or replace function public.publish_gazzetta(p_match uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare l uuid;
begin
  select league_id into l from public.matches where id = p_match;
  if l is null or not public.can_write_gazzetta(l) then raise exception 'Permesso negato'; end if;
  if p_path is null or p_path not like l::text || '/' || p_match::text || '-%.jpg'
    or not exists (select 1 from storage.objects where bucket_id = 'gazzette' and name = p_path) then
    raise exception 'File Gazzetta non valido';
  end if;
  insert into public.gazzette(match_id, file_path) values (p_match, p_path)
    on conflict (match_id) do update set file_path = excluded.file_path;
end $$;
revoke all on function public.publish_gazzetta(uuid, text) from public, anon;
grant execute on function public.publish_gazzetta(uuid, text) to authenticated;
