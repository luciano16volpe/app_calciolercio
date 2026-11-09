-- Luogo della partita trovato su una mappa: oltre al nome si salvano le coordinate (per il pulsante «Condividi posizione»).
-- Un luogo scritto a mano resta valido: senza coordinate.
alter table public.matches
  add column if not exists place_lat double precision check (place_lat between -90 and 90),
  add column if not exists place_lng double precision check (place_lng between -180 and 180);
alter table public.matches drop constraint if exists matches_place_coords_together;
alter table public.matches add constraint matches_place_coords_together check ((place_lat is null) = (place_lng is null));

create or replace function public.create_match_with_teams(p_match jsonb, p_team_a uuid[], p_team_b uuid[])
returns uuid language plpgsql security invoker set search_path = public as $$
declare mid uuid; lid uuid := (p_match->>'league_id')::uuid;
begin
  if auth.uid() is null or not public.is_league_admin(lid) then
    raise exception 'Permesso negato: solo amministratori della lega';
  end if;
  if coalesce(cardinality(p_team_a), 0) = 0 or coalesce(cardinality(p_team_b), 0) = 0 then
    raise exception 'Servono due squadre non vuote';
  end if;
  if exists (select 1 from unnest(p_team_a || p_team_b) t(p)
      where p is null or not exists (select 1 from league_players lp where lp.league_id = lid and lp.player_id = p)) then
    raise exception 'Le squadre devono contenere solo giocatori della rosa';
  end if;
  insert into matches(league_id, date, play_time, place, place_lat, place_lng, notes, score_a, score_b, pred, pred_rank)
    values (lid, (p_match->>'date')::date, (p_match->>'play_time')::time,
      nullif(btrim(p_match->>'place'), ''), (p_match->>'place_lat')::double precision, (p_match->>'place_lng')::double precision,
      nullif(p_match->>'notes', ''),
      (p_match->>'score_a')::smallint, (p_match->>'score_b')::smallint,
      (p_match->>'pred')::numeric, (p_match->>'pred_rank')::smallint)
    returning id into mid;
  -- Un giocatore ripetuto causa una violazione della chiave e annulla anche la partita.
  insert into match_players(match_id, player_id, team, position)
    select mid, p, 'A', (n - 1)::integer from unnest(p_team_a) with ordinality t(p, n)
    union all
    select mid, p, 'B', (n - 1)::integer from unnest(p_team_b) with ordinality t(p, n);
  return mid;
end $$;

create or replace function public.save_match_ratings(p_match uuid, p_rows jsonb, p_header jsonb default null, p_untouched_texts uuid[] default '{}')
returns void language plpgsql security invoker set search_path = public as $$
declare lid uuid; r record; affected integer; expected integer;
begin
  select league_id into lid from matches where id = p_match;
  if auth.uid() is null or lid is null or not public.is_league_admin(lid) then
    raise exception 'Partita non trovata o permesso negato';
  end if;
  perform 1 from matches where id = p_match for update;
  if not found then raise exception 'Partita non trovata'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Pagelle non valide'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) x group by x->>'player_id' having count(*) > 1)
     or exists (select 1 from jsonb_array_elements(p_rows) x where not exists (
       select 1 from match_players mp where mp.match_id = p_match and mp.player_id = (x->>'player_id')::uuid)) then
    raise exception 'Giocatore duplicato o non presente nella partita';
  end if;
  select count(*) into expected from match_players where match_id = p_match;
  update match_players mp set rating = null, goals = 0, assist = 0, autogol = 0, meta = 0, rigori_sbagliati = 0,
    titolo = case when mp.player_id = any(coalesce(p_untouched_texts, '{}')) then mp.titolo else null end,
    descrizione = case when mp.player_id = any(coalesce(p_untouched_texts, '{}')) then mp.descrizione else null end
    where mp.match_id = p_match and not exists (
      select 1 from jsonb_array_elements(p_rows) x where (x->>'player_id')::uuid = mp.player_id);
  get diagnostics affected = row_count;
  for r in select * from jsonb_to_recordset(p_rows) as x(
    player_id uuid, rating numeric, goals smallint, assist smallint, autogol smallint,
    meta smallint, rigori_sbagliati smallint, titolo text, descrizione text, write_text boolean)
  loop
    update match_players set rating = r.rating, goals = r.goals, assist = r.assist,
      autogol = r.autogol, meta = r.meta, rigori_sbagliati = r.rigori_sbagliati,
      titolo = case when r.write_text then nullif(r.titolo, '') else titolo end,
      descrizione = case when r.write_text then nullif(r.descrizione, '') else descrizione end
      where match_id = p_match and player_id = r.player_id;
    if not found then raise exception 'Pagella non salvata'; end if;
    affected := affected + 1;
  end loop;
  if affected <> expected then raise exception 'Pagelle non salvate'; end if;
  if p_header is not null then
    update matches set score_a = (p_header->>'score_a')::smallint,
      score_b = (p_header->>'score_b')::smallint, notes = nullif(p_header->>'notes', ''),
      play_time = (p_header->>'play_time')::time, place = nullif(btrim(p_header->>'place'), ''),
      place_lat = (p_header->>'place_lat')::double precision, place_lng = (p_header->>'place_lng')::double precision
      where id = p_match;
    if not found then raise exception 'Risultato non salvato'; end if;
  end if;
end $$;

-- Stessa funzione con due parametri in più (coordinate): la vecchia firma si toglie.
drop function if exists public.update_planned_match(uuid,date,time,text,text,uuid[],uuid[],jsonb);
create function public.update_planned_match(p_match uuid, p_date date, p_time time, p_place text,
  p_notes text, p_team_a uuid[], p_team_b uuid[], p_original jsonb,
  p_lat double precision default null, p_lng double precision default null)
returns void language plpgsql security invoker set search_path = public as $$
declare m public.matches%rowtype; original jsonb; teams_changed boolean; affected integer;
begin
  select * into m from public.matches where id=p_match for update;
  if not found or auth.uid() is null or not public.is_league_admin(m.league_id) then
    raise exception 'Partita non trovata o permesso negato';
  end if;
  perform 1 from public.match_players where match_id=p_match for update;
  if m.score_a is not null or m.score_b is not null or exists (
    select 1 from public.match_players where match_id=p_match and
      (rating is not null or goals<>0 or assist<>0 or autogol<>0 or meta<>0 or rigori_sbagliati<>0
       or coalesce(titolo,'')<>'' or coalesce(descrizione,'')<>'')) then
    raise exception 'La partita ha già risultati o pagelle: non puoi cambiare il programma e i convocati';
  end if;
  select jsonb_build_object('date',m.date::text,'time',coalesce(to_char(m.play_time,'HH24:MI'),''),
    'place',coalesce(m.place,''),'notes',coalesce(m.notes,''),
    'teamA',coalesce(jsonb_agg(player_id order by position,player_id) filter(where team='A'),'[]'),
    'teamB',coalesce(jsonb_agg(player_id order by position,player_id) filter(where team='B'),'[]'))
    into original from public.match_players where match_id=p_match;
  if p_original is distinct from original then raise exception 'La partita è stata modificata: chiudi e riaprila prima di salvare'; end if;
  if p_date is null or p_time is null or nullif(btrim(p_place),'') is null or length(btrim(p_place))>80 then
    raise exception 'Indica giorno, ora e luogo della partita (massimo 80 caratteri)';
  end if;
  if coalesce(cardinality(p_team_a),0)=0 or coalesce(cardinality(p_team_b),0)=0 then
    raise exception 'Servono due squadre non vuote';
  end if;
  if exists(select 1 from unnest(p_team_a || p_team_b) p group by p having count(*)>1)
    or array_position(p_team_a || p_team_b,null) is not null then raise exception 'Giocatore duplicato o non valido'; end if;
  if exists(select 1 from unnest(p_team_a || p_team_b) p where
    not exists(select 1 from public.league_players lp where lp.league_id=m.league_id and lp.player_id=p)
    and not exists(select 1 from public.match_players mp where mp.match_id=p_match and mp.player_id=p)) then
    raise exception 'I sostituti devono appartenere alla Rosa della lega';
  end if;
  teams_changed := (original->'teamA') is distinct from to_jsonb(p_team_a) or (original->'teamB') is distinct from to_jsonb(p_team_b);
  update public.matches set date=p_date, play_time=p_time, place=btrim(p_place), place_lat=p_lat, place_lng=p_lng, notes=nullif(btrim(p_notes),''),
    pred=case when teams_changed then null else pred end,
    pred_rank=case when teams_changed then 0 else pred_rank end where id=p_match;
  get diagnostics affected = row_count;
  if affected<>1 then raise exception 'La partita non è più modificabile'; end if;
  if teams_changed then
    delete from public.match_players where match_id=p_match;
    insert into public.match_players(match_id,player_id,team,position)
      select p_match,p,'A',(n-1)::integer from unnest(p_team_a) with ordinality t(p,n)
      union all select p_match,p,'B',(n-1)::integer from unnest(p_team_b) with ordinality t(p,n);
  end if;
end $$;
revoke all on function public.update_planned_match(uuid,date,time,text,text,uuid[],uuid[],jsonb,double precision,double precision) from public,anon;
grant execute on function public.update_planned_match(uuid,date,time,text,text,uuid[],uuid[],jsonb,double precision,double precision) to authenticated;
