-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · Collaudo: eliminare un giocatore (con tutte le sue pagelle) richiede di essere amministratore
--  di TUTTE le leghe in cui gioca (stessa regola di «Unisci giocatori»). Un giocatore appena creato e non ancora
--  in nessuna lega lo elimina chi l'ha creato, se è ancora amministratore.
--  Applicare con:  npx supabase db push --linked
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.can_delete_player(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from league_players where player_id = p) then
      not exists (select 1 from league_players lp
                   where lp.player_id = p
                     and not exists (select 1 from league_members lm where lm.league_id = lp.league_id and lm.user_id = auth.uid() and lm.role = 'admin'))
    else exists (select 1 from players where id = p and created_by = auth.uid()) and public.is_any_admin()
  end;
$$;
revoke all on function public.can_delete_player(uuid) from public, anon;
grant execute on function public.can_delete_player(uuid) to authenticated;

drop policy if exists players_delete on public.players;
create policy players_delete on public.players for delete to authenticated using (public.can_delete_player(id));
-- fine ✔
