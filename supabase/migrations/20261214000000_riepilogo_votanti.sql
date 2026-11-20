-- Riepilogo riservato all'admin: conta i partecipanti abilitati che hanno espresso almeno un voto.
create function public.community_vote_progress(p_match uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare lid uuid; eligible integer; voted integer;
begin
  select league_id into lid from matches where id=p_match;
  if lid is null or auth.uid() is null or not public.is_league_admin(lid) then
    raise exception 'Permesso negato';
  end if;

  select count(*)::integer,
    count(*) filter (where exists (
      select 1 from community_votes cv
      where cv.match_id=p_match and cv.voter_user_id=p.user_id
    ))::integer
    into eligible,voted
    from match_players mp
    join players p on p.id=mp.player_id
    where mp.match_id=p_match and p.user_id is not null
      and exists (
        select 1 from league_members lm
        where lm.league_id=lid and lm.user_id=p.user_id
      );

  return jsonb_build_object('eligible',eligible,'voted',voted,'remaining',eligible-voted);
end $$;
revoke all on function public.community_vote_progress(uuid) from public,anon;
grant execute on function public.community_vote_progress(uuid) to authenticated;
