-- Chiusura automatica quando tutti i partecipanti Premium abilitati hanno votato.
create or replace function public.submit_community_votes(p_match uuid,p_votes jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare started timestamptz; early timestamptz; finished timestamptz; lid uuid; my_player uuid; v record;
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  select c.started_at,c.closed_early_at,c.finalized_at,m.league_id into started,early,finished,lid
    from community_vote_settings c join matches m on m.id=c.match_id where c.match_id=p_match for update of c;
  -- finalized_at: chi aspettava il blocco mentre l'admin chiudeva trova la votazione già chiusa
  if started is null or finished is not null or now()<started or now()>=public.community_vote_deadline(started,early) then
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
  -- L'ultimo partecipante abilitato chiude e pubblica i voti nella stessa transazione.
  if exists (
    select 1 from match_players mp join players p on p.id=mp.player_id
    where mp.match_id=p_match and p.user_id is not null
      and public.has_premium(p.user_id)
      and exists (select 1 from league_members lm where lm.league_id=lid and lm.user_id=p.user_id)
  ) and not exists (
    select 1 from match_players mp join players p on p.id=mp.player_id
    where mp.match_id=p_match and p.user_id is not null
      and public.has_premium(p.user_id)
      and exists (select 1 from league_members lm where lm.league_id=lid and lm.user_id=p.user_id)
      and not exists (select 1 from community_votes cv where cv.match_id=p_match and cv.voter_user_id=p.user_id)
  ) then
    update community_vote_settings set closed_early_at=clock_timestamp() where match_id=p_match;
    perform public.finalize_community_votes(clock_timestamp());
  end if;
end $$;

-- Dettagli visibili all'admin durante il voto e ai membri Premium dopo la finalizzazione.
create or replace function public.community_vote_details(p_match uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare lid uuid; details jsonb; finished timestamptz;
begin
  select m.league_id,c.finalized_at into lid,finished from matches m left join community_vote_settings c on c.match_id=m.id where m.id=p_match;
  if lid is null or auth.uid() is null or not (public.is_league_admin(lid) or (finished is not null and public.has_premium(auth.uid()) and exists (select 1 from league_members where league_id=lid and user_id=auth.uid()))) then
    raise exception 'Permesso negato'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'voter_name',voter.name,'target_name',target.name,'rating',cv.rating)
    order by target.name,voter.name),'[]'::jsonb) into details
    from community_votes cv
    join players target on target.id=cv.target_player_id
    join lateral (
      select p.name from players p join match_players mp on mp.player_id=p.id
        where mp.match_id=cv.match_id and p.user_id=cv.voter_user_id
        order by p.name limit 1
    ) voter on true
    where cv.match_id=p_match;
  return details;
end $$;

