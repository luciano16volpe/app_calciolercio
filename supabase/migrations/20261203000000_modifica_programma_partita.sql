-- Programma e squadre si modificano insieme, solo prima di registrare dati di gioco.
-- Il limite Standard riguarda lo storico: gli incontri futuri restano visibili
-- anche quando vengono rinviati alla stagione successiva.
create or replace function public.history_date_visible(p_date date)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((auth.uid() is not null and public.feature_allowed('history'))
    or p_date >= (public.current_season_start() - interval '3 months')::date, false);
$$;

create function public.update_planned_match(p_match uuid, p_date date, p_time time, p_place text,
  p_notes text, p_team_a uuid[], p_team_b uuid[], p_original jsonb)
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
  update public.matches set date=p_date, play_time=p_time, place=btrim(p_place), notes=nullif(btrim(p_notes),''),
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
revoke all on function public.update_planned_match(uuid,date,time,text,text,uuid[],uuid[],jsonb) from public,anon;
grant execute on function public.update_planned_match(uuid,date,time,text,text,uuid[],uuid[],jsonb) to authenticated;
