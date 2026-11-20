-- I voti individuali restano privati fino alla chiusura della finestra di 24 ore.
-- La media viene pubblicata in match_players soltanto dal job di finalizzazione.
alter table public.community_vote_settings add column finalized_at timestamptz;

create or replace function public.community_vote_state(p_match uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare lid uuid; score_a smallint; score_b smallint; started timestamptz;
  finished timestamptz; my_player uuid; my_votes jsonb;
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
  return jsonb_build_object(
    'enabled',started is not null,
    'is_open',started is not null and now()>=started and now()<started+interval '24 hours',
    'finalized',finished is not null,
    'open_until',started+interval '24 hours',
    'can_activate',public.is_league_admin(lid) and started is null
      and score_a is not null and score_b is not null
      and not exists(select 1 from match_players where match_id=p_match and rating is not null),
    'can_vote',started is not null and my_player is not null and now()>=started
      and now()<started+interval '24 hours',
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
  if not exists(select 1 from league_members where league_id=lid and user_id=auth.uid()) then raise exception 'Non fai parte della lega'; end if;
  select p.id into my_player from match_players mp join players p on p.id=mp.player_id
    where mp.match_id=p_match and p.user_id=auth.uid() limit 1;
  if my_player is null then raise exception 'Solo chi ha giocato può votare'; end if;
  if p_votes is null or jsonb_typeof(p_votes)<>'array' or jsonb_array_length(p_votes)=0 then raise exception 'Nessun voto da salvare'; end if;
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

create function public.finalize_community_votes(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path=public as $$
declare item record; completed integer := 0; previous_uid text;
begin
  previous_uid := current_setting('request.jwt.claim.sub',true);
  perform set_config('request.jwt.claim.sub','',true);
  for item in select c.match_id from community_vote_settings c
    where c.finalized_at is null and c.started_at+interval '24 hours'<=p_now
    order by c.started_at for update skip locked loop
    update match_players mp set rating=(
      select round(avg(cv.rating),1) from community_votes cv
        where cv.match_id=item.match_id and cv.target_player_id=mp.player_id)
      where mp.match_id=item.match_id;
    update community_vote_settings set finalized_at=p_now where match_id=item.match_id;
    completed := completed+1;
  end loop;
  perform set_config('request.jwt.claim.sub',coalesce(previous_uid,''),true);
  return completed;
end $$;
revoke all on function public.finalize_community_votes(timestamptz) from public,anon,authenticated;
grant execute on function public.finalize_community_votes(timestamptz) to service_role;

-- Se la finestra era già aperta al momento del rilascio, ritira le medie premature.
update match_players mp set rating=null from community_vote_settings c
  where c.match_id=mp.match_id and c.started_at+interval '24 hours'>now()
    and mp.rating is not null;
-- Se la finestra era già chiusa, pubblica subito il risultato definitivo.
select public.finalize_community_votes();

do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='community-vote-finalize';
    perform cron.schedule('community-vote-finalize','* * * * *','select public.finalize_community_votes()');
  else
    raise warning 'pg_cron non attivo: le medie dei voti devono essere finalizzate manualmente';
  end if;
end $$;
