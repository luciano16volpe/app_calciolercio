-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · eliminare un giocatore appena creato (senza lega e senza partite): il creatore deve essere ancora
--  amministratore (come prima); l'amministratore supremo può sempre.
--  Applicare con:  npx supabase db push --linked
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.can_delete_player(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from league_players where player_id = p)
     and not exists (select 1 from match_players where player_id = p)
     and (public.is_super_admin()
          or (public.is_any_admin() and exists (select 1 from players where id = p and created_by = auth.uid())));
$$;

-- fine ✔
