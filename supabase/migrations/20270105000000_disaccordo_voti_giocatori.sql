-- Mostra solo la dispersione aggregata, mai i voti dei singoli partecipanti.
create function public.community_vote_disagreement(p_match uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare lid uuid; finished timestamptz; result jsonb;
begin
  select m.league_id,c.finalized_at into lid,finished
    from matches m join community_vote_settings c on c.match_id=m.id where m.id=p_match;
  if auth.uid() is null or lid is null or finished is null or not exists (
    select 1 from league_members where league_id=lid and user_id=auth.uid()
  ) then return null; end if;
  select jsonb_build_object('player_id',chosen.target_player_id,'dispersion',round(chosen.dispersion,2),'votes',chosen.votes)
    into result from (
      select target_player_id, stddev_pop(rating) as dispersion, count(*) as votes
      from community_votes where match_id=p_match
      group by target_player_id having count(*)>=2
      order by stddev_pop(rating) desc, count(*) desc, target_player_id
      limit 1
    ) chosen;
  return result;
end $$;
revoke all on function public.community_vote_disagreement(uuid) from public,anon;
grant execute on function public.community_vote_disagreement(uuid) to authenticated;
