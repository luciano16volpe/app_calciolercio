-- Conteggio dei votanti: i numeri li vede ogni membro della lega; solo l'admin vede anche i nomi
-- di chi ancora manca e di chi non può votare (ospite senza profilo collegato, non nella lega).
create or replace function public.community_vote_progress(p_match uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare lid uuid; eligible integer; voted integer; result jsonb; missing jsonb; cannot jsonb;
begin
  select league_id into lid from matches where id=p_match;
  if lid is null or auth.uid() is null or not exists (
    select 1 from league_members where league_id=lid and user_id=auth.uid()) then
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

  result:=jsonb_build_object('eligible',eligible,'voted',voted,'remaining',eligible-voted);

  if public.is_league_admin(lid) then
    select coalesce(jsonb_agg(jsonb_build_object('name',p.name,'premium',public.has_premium(p.user_id)) order by p.name),'[]'::jsonb)
      into missing
      from match_players mp join players p on p.id=mp.player_id
      where mp.match_id=p_match and p.user_id is not null
        and exists (select 1 from league_members lm where lm.league_id=lid and lm.user_id=p.user_id)
        and not exists (select 1 from community_votes cv where cv.match_id=p_match and cv.voter_user_id=p.user_id);
    select coalesce(jsonb_agg(jsonb_build_object('name',p.name,
        'reason',case when p.user_id is null then 'senza profilo collegato' else 'non fa parte della lega' end) order by p.name),'[]'::jsonb)
      into cannot
      from match_players mp join players p on p.id=mp.player_id
      where mp.match_id=p_match and (p.user_id is null
        or not exists (select 1 from league_members lm where lm.league_id=lid and lm.user_id=p.user_id));
    result:=result||jsonb_build_object('missing',missing,'cannot_vote',cannot);
  end if;
  return result;
end $$;
