-- Voto collettivo facoltativo: 24 ore dall'apertura decisa dall'admin per partita.
-- Le medie finiscono nella colonna rating esistente, così statistiche e classifiche restano coerenti.
create table public.community_vote_settings (
  match_id uuid primary key references public.matches(id) on delete cascade,
  started_at timestamptz not null,
  enabled_by uuid references auth.users(id) on delete set null
);
create table public.community_votes (
  match_id uuid not null references public.community_vote_settings(match_id) on delete cascade,
  voter_user_id uuid not null references auth.users(id) on delete cascade,
  target_player_id uuid not null references public.players(id) on delete cascade,
  rating numeric(3,1) not null check (rating between 1 and 10 and rating * 2 = trunc(rating * 2)),
  updated_at timestamptz not null default now(),
  primary key(match_id,voter_user_id,target_player_id)
);
create index community_votes_target_idx on public.community_votes(match_id,target_player_id);
alter table public.community_vote_settings enable row level security;
alter table public.community_votes enable row level security;
revoke all on public.community_vote_settings,public.community_votes from anon,authenticated;

create function public.community_vote_state(p_match uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare lid uuid; score_a smallint; score_b smallint; started timestamptz; my_player uuid; my_votes jsonb;
begin
  select m.league_id,m.score_a,m.score_b,c.started_at into lid,score_a,score_b,started
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
    'open_until',started+interval '24 hours',
    'can_activate', public.is_league_admin(lid) and started is null
      and score_a is not null and score_b is not null
      and not exists(select 1 from match_players where match_id=p_match and rating is not null),
    'can_vote',started is not null and my_player is not null and now()>=started
      and now()<started+interval '24 hours',
    'my_player_id',my_player,
    'my_votes',my_votes);
end $$;
revoke all on function public.community_vote_state(uuid) from public,anon;
grant execute on function public.community_vote_state(uuid) to authenticated;

-- I singoli voti sono consultabili solo dall'admin della lega.
create function public.community_vote_details(p_match uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare lid uuid; details jsonb;
begin
  select league_id into lid from matches where id=p_match;
  if lid is null or auth.uid() is null or not public.is_league_admin(lid) then
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
revoke all on function public.community_vote_details(uuid) from public,anon;
grant execute on function public.community_vote_details(uuid) to authenticated;

create function public.enable_community_voting(p_match uuid)
returns void language plpgsql security definer set search_path=public as $$
declare m matches%rowtype;
begin
  select * into m from matches where id=p_match for update;
  if not found or auth.uid() is null or not public.is_league_admin(m.league_id) then raise exception 'Permesso negato'; end if;
  if m.score_a is null or m.score_b is null then raise exception 'Inserisci prima il risultato'; end if;
  if exists(select 1 from match_players where match_id=p_match and rating is not null) then
    raise exception 'Sono già presenti voti della redazione'; end if;
  insert into community_vote_settings(match_id,started_at,enabled_by) values(p_match,now(),auth.uid());
end $$;
revoke all on function public.enable_community_voting(uuid) from public,anon;
grant execute on function public.enable_community_voting(uuid) to authenticated;

create function public.submit_community_votes(p_match uuid,p_votes jsonb)
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
  perform set_config('app.community_vote_writer','on',true);
  update match_players mp set rating=(
    select round(avg(cv.rating),1) from community_votes cv
      where cv.match_id=p_match and cv.target_player_id=mp.player_id)
    where mp.match_id=p_match and mp.player_id in (
      select (x->>'player_id')::uuid from jsonb_array_elements(p_votes) x);
  perform set_config('app.community_vote_writer','',true);
end $$;
revoke all on function public.submit_community_votes(uuid,jsonb) from public,anon;
grant execute on function public.submit_community_votes(uuid,jsonb) to authenticated;

create function public.community_voting_enabled(p_match uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from community_vote_settings where match_id=p_match);
$$;
revoke all on function public.community_voting_enabled(uuid) from public,anon;
grant execute on function public.community_voting_enabled(uuid) to authenticated;

-- Il trigger conserva la protezione originale e ammette solo il ricalcolo verificato della media.
create or replace function public.match_players_guard()
returns trigger language plpgsql security definer set search_path=public as $$
declare lg uuid; expected_rating numeric;
begin
  if auth.uid() is null then return new; end if;
  lg := public.match_league(new.match_id);
  if public.is_league_admin(lg) then return new; end if;
  if current_setting('app.community_vote_writer',true)='on'
    and new.match_id=old.match_id and new.player_id=old.player_id
    and new.team=old.team and new.position=old.position
    and new.goals=old.goals and new.assist=old.assist and new.autogol=old.autogol
    and new.meta=old.meta and new.rigori_sbagliati=old.rigori_sbagliati
    and new.titolo is not distinct from old.titolo
    and new.descrizione is not distinct from old.descrizione
    and exists(select 1 from community_vote_settings where match_id=new.match_id) then
    select round(avg(rating),1) into expected_rating from community_votes
      where match_id=new.match_id and target_player_id=new.player_id;
    if new.rating is not distinct from expected_rating then return new; end if;
  end if;
  if public.has_league_role(lg,array['redazione']::public.league_role[])
    and new.match_id=old.match_id and new.player_id=old.player_id and new.team=old.team
    and new.position=old.position and new.rating is not distinct from old.rating
    and new.goals=old.goals and new.assist=old.assist and new.autogol=old.autogol
    and new.meta=old.meta and new.rigori_sbagliati=old.rigori_sbagliati then return new; end if;
  raise exception 'Permesso negato: la redazione può modificare solo titolo e descrizione';
end $$;

-- Le correzioni di gol, assist e testi da parte dell'admin non cancellano la media dei partecipanti.
create or replace function public.save_match_ratings(p_match uuid, p_rows jsonb, p_header jsonb default null, p_untouched_texts uuid[] default '{}')
returns void language plpgsql security invoker set search_path=public as $$
declare lid uuid; r record; affected integer; expected integer; collective boolean;
begin
  select league_id into lid from matches where id = p_match;
  if auth.uid() is null or lid is null or not public.is_league_admin(lid) then
    raise exception 'Partita non trovata o permesso negato'; end if;
  perform 1 from matches where id = p_match for update;
  if not found then raise exception 'Partita non trovata'; end if;
  collective := public.community_voting_enabled(p_match);
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Pagelle non valide'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) x group by x->>'player_id' having count(*) > 1)
     or exists (select 1 from jsonb_array_elements(p_rows) x where not exists (
       select 1 from match_players mp where mp.match_id = p_match and mp.player_id = (x->>'player_id')::uuid)) then
    raise exception 'Giocatore duplicato o non presente nella partita'; end if;
  select count(*) into expected from match_players where match_id = p_match;
  update match_players mp set rating = case when collective then rating else null end,
    goals = 0, assist = 0, autogol = 0, meta = 0, rigori_sbagliati = 0,
    titolo = case when mp.player_id = any(coalesce(p_untouched_texts, '{}')) then mp.titolo else null end,
    descrizione = case when mp.player_id = any(coalesce(p_untouched_texts, '{}')) then mp.descrizione else null end
    where mp.match_id = p_match and not exists (
      select 1 from jsonb_array_elements(p_rows) x where (x->>'player_id')::uuid = mp.player_id);
  get diagnostics affected = row_count;
  for r in select * from jsonb_to_recordset(p_rows) as x(
    player_id uuid, rating numeric, goals smallint, assist smallint, autogol smallint,
    meta smallint, rigori_sbagliati smallint, titolo text, descrizione text, write_text boolean)
  loop
    update match_players set rating = case when collective then rating else r.rating end,
      goals = r.goals, assist = r.assist, autogol = r.autogol, meta = r.meta, rigori_sbagliati = r.rigori_sbagliati,
      titolo = case when r.write_text then nullif(r.titolo, '') else titolo end,
      descrizione = case when r.write_text then nullif(r.descrizione, '') else descrizione end
      where match_id = p_match and player_id = r.player_id;
    if not found then raise exception 'Pagella non salvata'; end if;
    affected := affected + 1;
  end loop;
  if affected <> expected then raise exception 'Pagelle non salvate'; end if;
  if p_header is not null then
    update matches set score_a = (p_header->>'score_a')::smallint,
      score_b = (p_header->>'score_b')::smallint, notes = nullif(btrim(p_header->>'notes'), ''),
      play_time = (p_header->>'play_time')::time, place = nullif(btrim(p_header->>'place'), ''),
      place_lat = (p_header->>'place_lat')::double precision, place_lng = (p_header->>'place_lng')::double precision,
      place_url = nullif(btrim(p_header->>'place_url'), '') where id = p_match;
    if not found then raise exception 'Risultato non salvato'; end if;
  end if;
end $$;
