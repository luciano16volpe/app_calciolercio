-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · Fase 4.6 (rifinitura): «Questo sono io» mostra solo i giocatori ancora liberi
--  Funzione di sola lettura: i giocatori della lega non ancora collegati a un account.
--  Applicare con:  npx supabase db push --linked
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.players_unclaimed(l uuid)
returns table (player_id uuid, name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.league_visible(l) then raise exception 'Permesso negato'; end if;
  return query
    select lp.player_id, p.name
      from league_players lp
      join players p on p.id = lp.player_id
     where lp.league_id = l and not lp.archived and p.user_id is null
     order by lower(p.name);
end $$;

revoke all on function public.players_unclaimed(uuid) from public, anon;
grant execute on function public.players_unclaimed(uuid) to authenticated;

-- fine ✔
