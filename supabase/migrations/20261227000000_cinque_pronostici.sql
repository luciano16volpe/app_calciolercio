-- Pronostici avanzati: al massimo 5 pronostici per giocatore e partita (prima 10).
-- Le partite che hanno già le regole della versione 1 restano a 10; le regole nuove (versione 2) valgono per le partite
-- che ricevono i pronostici da ora in poi. I limiti ora vengono dalla configurazione della partita, non da un numero fisso.
insert into public.advanced_prediction_configurations(version,rules)
select 2, jsonb_set(jsonb_set(jsonb_set(jsonb_set(rules,'{version}','2'::jsonb),'{maxAssignments}','5'::jsonb),
    '{desiredDistribution}','{"COMMON":2,"UNCOMMON":1,"RARE":1,"EPIC":1,"LEGENDARY":0}'::jsonb),
    '{multipliers}','[{"wins":5,"basisPoints":20000},{"wins":4,"basisPoints":15000},{"wins":3,"basisPoints":12500}]'::jsonb)
from public.advanced_prediction_configurations where version=1
on conflict (version) do nothing;

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
  if jsonb_typeof(p_rows)<>'array' then raise exception 'Assegnazioni non valide'; end if;
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
  -- il massimo di pronostici per giocatore viene dalla configurazione della partita (10 nelle partite vecchie, 5 dalla versione 2)
  if jsonb_array_length(p_rows)>coalesce((config->>'maxAssignments')::integer,10) then raise exception 'Assegnazioni non valide'; end if;
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

create or replace function public.advanced_prediction_refresh(p_match uuid,p_predictor uuid,p_rows jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare m matches%rowtype; side text; old_row advanced_prediction_assignments%rowtype;
  item jsonb; remaining integer; config jsonb; rule_version integer;
begin
  select * into m from matches where id=p_match for update;
  if not found or m.play_time is null or m.score_a is not null or m.score_b is not null
    or now()>=(m.date+m.play_time) at time zone 'Europe/Rome' then raise exception 'Selezioni chiuse'; end if;
  if not exists(select 1 from advanced_prediction_generations
      where match_id=p_match and predictor_player_id=p_predictor) then raise exception 'Estrazione assente'; end if;
  select team into side from match_players where match_id=p_match and player_id=p_predictor;
  if side is null then raise exception 'Pronosticatore non convocato'; end if;
  if jsonb_typeof(p_rows)<>'array' then raise exception 'Sostituzioni non valide'; end if;
  for old_row in select a.* from advanced_prediction_assignments a
    where a.match_id=p_match and a.predictor_player_id=p_predictor and a.status in ('AVAILABLE','SELECTED')
      and not exists(select 1 from match_players target join league_players lp
        on lp.player_id=target.player_id and lp.league_id=m.league_id where target.match_id=p_match
        and target.player_id=a.target_player_id and target.team<>side) for update loop
    update advanced_prediction_assignments set status='VOID',selected_at=null,locked_at=now() where id=old_row.id;
    insert into advanced_prediction_audit(assignment_id,match_id,action,old_values,new_values,reason)
      values(old_row.id,p_match,'VOID',jsonb_build_object('status',old_row.status),
        jsonb_build_object('status','VOID'),'Formazione modificata prima della partita');
  end loop;
  select configuration_version,rules_snapshot into rule_version,config from advanced_prediction_match_rules where match_id=p_match;
  select coalesce((config->>'maxAssignments')::integer,10)-count(*) into remaining from advanced_prediction_assignments
    where match_id=p_match and predictor_player_id=p_predictor and status in ('AVAILABLE','SELECTED');
  if jsonb_array_length(p_rows)>remaining then raise exception 'Troppe sostituzioni'; end if;
  select configuration_version,rules_snapshot into rule_version,config from advanced_prediction_match_rules where match_id=p_match;
  for item in select value from jsonb_array_elements(p_rows) loop
    if (item->>'template_id')::integer not between 1 and 140
      or (item->>'weight')::integer is distinct from (config->'weights'->>(item->>'difficulty'))::integer
      or not exists(select 1 from match_players target join league_players lp
        on lp.player_id=target.player_id and lp.league_id=m.league_id where target.match_id=p_match
        and target.player_id=(item->>'target_player_id')::uuid and target.team<>side) then
      raise exception 'Sostituzione incompatibile'; end if;
    insert into advanced_prediction_assignments(league_id,match_id,season_key,predictor_player_id,target_player_id,
      template_id,template_code,template_version,category,description,condition_snapshot,parameters_snapshot,
      configuration_version,rules_snapshot,difficulty,weight,estimated_probability,historical_sample_size,
      estimation_method,historical_snapshot)
    select m.league_id,p_match,a.season_key,p_predictor,(item->>'target_player_id')::uuid,
      (item->>'template_id')::smallint,item->>'template_code',1,item->>'category',item->>'description',
      item->'condition',item->'parameters',rule_version,config,item->>'difficulty',(item->>'weight')::smallint,
      (item->>'estimated_probability')::numeric,coalesce((item->>'historical_sample_size')::integer,0),
      item->>'estimation_method',coalesce(item->'historical_snapshot','{}'::jsonb)
    from advanced_prediction_assignments a where a.match_id=p_match and a.predictor_player_id=p_predictor limit 1;
    insert into advanced_prediction_audit(match_id,action,new_values,reason)
      values(p_match,'GENERATE',item,'Sostituzione dopo modifica della formazione');
  end loop;
end $$;

create or replace function public.advanced_prediction_select(p_assignment uuid,p_selected boolean)
returns void language plpgsql security definer set search_path=public as $$
declare a advanced_prediction_assignments%rowtype; m matches%rowtype; owner_user uuid;
begin
  if auth.uid() is null then raise exception 'Devi accedere'; end if;
  select * into a from advanced_prediction_assignments where id=p_assignment;
  if not found then raise exception 'Pronostico non trovato'; end if;
  select * into m from matches where id=a.match_id for update;
  select * into a from advanced_prediction_assignments where id=p_assignment for update;
  select user_id into owner_user from players where id=a.predictor_player_id;
  if owner_user is distinct from auth.uid() or not exists(select 1 from league_members
      where league_id=m.league_id and user_id=auth.uid()) then raise exception 'Permesso negato'; end if;
  if not exists(select 1 from advanced_prediction_league_settings
      where league_id=m.league_id and enabled) then raise exception 'Pronostici avanzati non attivi'; end if;
  if m.play_time is null or m.score_a is not null or m.score_b is not null
    or now()>=(m.date+m.play_time) at time zone 'Europe/Rome' then raise exception 'Selezioni chiuse'; end if;
  if not exists(select 1 from match_players predictor join match_players target
      on target.match_id=predictor.match_id and target.player_id=a.target_player_id
      where predictor.match_id=a.match_id and predictor.player_id=a.predictor_player_id
        and predictor.team<>target.team) then raise exception 'Formazione modificata: pronostico non compatibile'; end if;
  if a.status not in ('AVAILABLE','SELECTED') then raise exception 'Pronostico non modificabile'; end if;
  if p_selected and a.status='AVAILABLE' and
    (select count(*) from advanced_prediction_assignments where match_id=a.match_id
      and predictor_player_id=a.predictor_player_id and status='SELECTED')>=coalesce((a.rules_snapshot->>'maxAssignments')::integer,10) then
    raise exception 'Limite di pronostici raggiunto'; end if;
  if (a.status='SELECTED')=p_selected then return; end if;
  update advanced_prediction_assignments set status=case when p_selected then 'SELECTED' else 'AVAILABLE' end,
    selected_at=case when p_selected then now() else null end where id=p_assignment;
  insert into advanced_prediction_audit(assignment_id,match_id,actor_user_id,action,old_values,new_values)
    values(p_assignment,a.match_id,auth.uid(),case when p_selected then 'SELECT' else 'DESELECT' end,
      jsonb_build_object('status',a.status),jsonb_build_object('status',case when p_selected then 'SELECTED' else 'AVAILABLE' end));
end $$;
