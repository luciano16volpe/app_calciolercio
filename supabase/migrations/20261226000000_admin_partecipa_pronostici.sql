-- L'ADMIN partecipante puo' giocare come gli altri; le correzioni ufficiali restano auditate.
create or replace function public.advanced_prediction_generate(p_match uuid,p_predictor uuid,p_configuration_version integer,p_rows jsonb)
returns setof public.advanced_prediction_assignments
language plpgsql security definer set search_path=public as $$
declare m record; side text; item jsonb; count_rows integer; season text; config jsonb; rule_version integer;
begin
  select * into m from matches where id=p_match for update;
  if not found then raise exception 'Partita non trovata'; end if;
  if not exists(select 1 from advanced_prediction_league_settings where league_id=m.league_id and enabled) then
    raise exception 'Pronostici avanzati non attivi'; end if;
  if m.play_time is null or m.score_a is not null or m.score_b is not null
    or now()>=(m.date+m.play_time) at time zone 'Europe/Rome' then
    raise exception 'Selezioni chiuse'; end if;
  if exists(select 1 from formation_polls where match_id=p_match and finalized_at is null) then
    raise exception 'Formazioni non ancora definitive'; end if;
  select team into side from match_players where match_id=p_match and player_id=p_predictor;
  if side is null then raise exception 'Pronosticatore non convocato'; end if;
  if exists(select 1 from advanced_prediction_generations where match_id=p_match and predictor_player_id=p_predictor) then
    return query select * from advanced_prediction_assignments
      where match_id=p_match and predictor_player_id=p_predictor order by assigned_at,id;
    return;
  end if;
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>10 then raise exception 'Assegnazioni non valide'; end if;
  count_rows:=jsonb_array_length(p_rows);
  season:=case when extract(month from m.date) between 3 and 5 then extract(year from m.date)::integer||'-PRI'
    when extract(month from m.date) between 6 and 8 then extract(year from m.date)::integer||'-EST'
    when extract(month from m.date) between 9 and 11 then extract(year from m.date)::integer||'-AUT'
    else (extract(year from m.date)::integer-case when extract(month from m.date)<3 then 1 else 0 end)||'-INV' end;
  select configuration_version,rules_snapshot into rule_version,config from advanced_prediction_match_rules where match_id=p_match;
  if rule_version is null then
    select version,rules into rule_version,config from advanced_prediction_configurations order by version desc limit 1;
    insert into advanced_prediction_match_rules(match_id,configuration_version,rules_snapshot)
      values(p_match,rule_version,config);
  end if;
  if p_configuration_version is distinct from rule_version then raise exception 'Configurazione cambiata: riprova'; end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    if (item->>'template_id')::integer not between 1 and 140
      or (item->>'weight')::integer is distinct from (config->'weights'->>(item->>'difficulty'))::integer
      or jsonb_typeof(item->'condition')<>'object'
      or jsonb_typeof(item->'parameters')<>'object'
      or not exists(select 1 from match_players mp join league_players lp
        on lp.player_id=mp.player_id and lp.league_id=m.league_id
        where mp.match_id=p_match and mp.player_id=(item->>'target_player_id')::uuid and mp.team<>side) then
      raise exception 'Pronostico incompatibile'; end if;
    insert into advanced_prediction_assignments(league_id,match_id,season_key,predictor_player_id,target_player_id,
      template_id,template_code,template_version,category,description,condition_snapshot,parameters_snapshot,
      configuration_version,rules_snapshot,difficulty,weight,estimated_probability,historical_sample_size,
      estimation_method,historical_snapshot)
    values(m.league_id,p_match,season,p_predictor,(item->>'target_player_id')::uuid,
      (item->>'template_id')::smallint,item->>'template_code',1,item->>'category',item->>'description',
      item->'condition',item->'parameters',rule_version,config,item->>'difficulty',(item->>'weight')::smallint,
      (item->>'estimated_probability')::numeric,coalesce((item->>'historical_sample_size')::integer,0),
      item->>'estimation_method',coalesce(item->'historical_snapshot','{}'::jsonb));
  end loop;
  insert into advanced_prediction_generations(match_id,predictor_player_id,assignment_count) values(p_match,p_predictor,count_rows);
  insert into advanced_prediction_audit(match_id,action,new_values)
    values(p_match,'GENERATE',jsonb_build_object('predictor_player_id',p_predictor,'count',count_rows));
  return query select * from advanced_prediction_assignments
    where match_id=p_match and predictor_player_id=p_predictor order by assigned_at,id;
end $$;
