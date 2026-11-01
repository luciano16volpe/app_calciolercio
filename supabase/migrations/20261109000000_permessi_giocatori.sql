-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · Collaudo: chi ha creato un giocatore da amministratore e poi non lo è più non può più modificarlo né eliminarlo.
--  Modifica ed eliminazione spettano agli amministratori delle leghe in cui il giocatore gioca (decisione del 1/11).
--  Applicare con:  npx supabase db push --linked
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.can_edit_player(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from league_players lp
                   join league_members lm on lm.league_id = lp.league_id
                  where lp.player_id = p and lm.user_id = auth.uid() and lm.role = 'admin')
      -- giocatore appena creato e non ancora in nessuna lega: lo gestisce chi l'ha creato, se è ancora amministratore
      or (exists (select 1 from players where id = p and created_by = auth.uid())
          and public.is_any_admin()
          and not exists (select 1 from league_players where player_id = p));
$$;

drop policy if exists players_delete on public.players;
create policy players_delete on public.players for delete to authenticated using (public.can_edit_player(id));

-- fine ✔
