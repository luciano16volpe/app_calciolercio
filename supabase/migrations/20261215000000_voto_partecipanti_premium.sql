-- Il voto resta visibile ai membri della lega, ma solo i partecipanti Premium possono inviarlo.
-- I voti già presenti e le medie già pubblicate non vengono modificati.
create or replace function public.community_vote_state(p_match uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare lid uuid; score_a smallint; score_b smallint; started timestamptz;
  finished timestamptz; my_player uuid; my_votes jsonb; premium_active boolean;
begin
  select m.league_id,m.score_a,m.score_b,c.started_at,c.finalized_at
    into lid,score_a,score_b,started,finished
    from matches m left join community_vote_settings c on c.match_id=m.id where m.id=p_match;
  if lid is null or auth.uid() is null or not exists (
    select 1 from league_members where league_id=lid and user_id=auth.uid()) then return null; end if;
  select p.id into my_player from match_players mp join players p on p.id=mp.player_id
    where mp.match_id=p_match and p.user_id=auth.uid() limit 1;
  select coalesce(jsonb_object_agg(target_player_id,rating),'{}'::jsonb) into my_votes
    from community_votes where match_id=p_match and voter_user_id=auth.uid();
  premium_active := public.has_premium(auth.uid());
  return jsonb_build_object(
    'enabled',started is not null,
    'is_open',started is not null and now()>=started and now()<started+interval '24 hours',
    'finalized',finished is not null,
    'open_until',started+interval '24 hours',
    'can_activate',public.is_league_admin(lid) and started is null
      and score_a is not null and score_b is not null
      and not exists(select 1 from match_players where match_id=p_match and rating is not null),
    'can_vote',started is not null and my_player is not null and premium_active
      and now()>=started and now()<started+interval '24 hours',
    'has_premium',premium_active,
    'my_player_id',my_player,
    'my_votes',my_votes);
end $$;

create or replace function public.submit_community_votes(p_match uuid,p_votes jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare started timestamptz; lid uuid; my_player uuid; v record;
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  select c.started_at,m.league_id into started,lid from community_vote_settings c
    join matches m on m.id=c.match_id where c.match_id=p_match for update of c;
  if started is null or now()<started or now()>=started+interval '24 hours' then
    raise exception 'La votazione è chiusa'; end if;
  if not exists(select 1 from league_members where league_id=lid and user_id=auth.uid()) then
    raise exception 'Non fai parte della lega'; end if;
  if not public.has_premium(auth.uid()) then raise exception 'Per votare serve Premium attivo'; end if;
  select p.id into my_player from match_players mp join players p on p.id=mp.player_id
    where mp.match_id=p_match and p.user_id=auth.uid() limit 1;
  if my_player is null then raise exception 'Solo chi ha giocato può votare'; end if;
  if p_votes is null or jsonb_typeof(p_votes)<>'array' or jsonb_array_length(p_votes)=0 then
    raise exception 'Nessun voto da salvare'; end if;
  if exists(select 1 from jsonb_array_elements(p_votes) x
      group by x->>'player_id' having count(*)>1) then raise exception 'Giocatore duplicato'; end if;
  for v in select (x->>'player_id')::uuid as player_id,(x->>'rating')::numeric as rating
    from jsonb_array_elements(p_votes) x loop
    if v.player_id is null or v.player_id=my_player or not exists (
      select 1 from match_players where match_id=p_match and player_id=v.player_id) then
      raise exception 'Puoi votare solo gli altri partecipanti'; end if;
    if v.rating is null or v.rating<1 or v.rating>10 or v.rating*2<>trunc(v.rating*2) then
      raise exception 'Il voto deve essere tra 1 e 10, a passi di mezzo punto'; end if;
  end loop;
  insert into community_votes(match_id,voter_user_id,target_player_id,rating,updated_at)
    select p_match,auth.uid(),(x->>'player_id')::uuid,(x->>'rating')::numeric,now()
    from jsonb_array_elements(p_votes) x
    on conflict(match_id,voter_user_id,target_player_id) do update
      set rating=excluded.rating,updated_at=excluded.updated_at;
end $$;

-- Il riepilogo admin conta solo chi può votare in questo momento.
create or replace function public.community_vote_progress(p_match uuid)
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
      and public.has_premium(p.user_id)
      and exists (
        select 1 from league_members lm
        where lm.league_id=lid and lm.user_id=p.user_id
      );
  return jsonb_build_object('eligible',eligible,'voted',voted,'remaining',eligible-voted);
end $$;
