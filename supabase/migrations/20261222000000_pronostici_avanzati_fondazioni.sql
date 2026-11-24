-- Foundation only. No client grants or live generation are enabled by this migration.
-- Existing 1/X/2 predictions remain in match_predictions.
create table public.advanced_prediction_configurations (
  version integer primary key check (version > 0),
  rules jsonb not null check (jsonb_typeof(rules) = 'object'),
  created_at timestamptz not null default now()
);
create table public.advanced_prediction_match_rules (
  match_id uuid primary key references public.matches(id) on delete cascade,
  configuration_version integer not null references public.advanced_prediction_configurations(version),
  rules_snapshot jsonb not null check (jsonb_typeof(rules_snapshot)='object'),
  frozen_at timestamptz not null default now()
);

create table public.advanced_prediction_league_settings (
  league_id uuid primary key references public.leagues(id) on delete cascade,
  enabled boolean not null default false,
  show_disaster_board boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.advanced_prediction_assignments (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  season_key text not null check (season_key ~ '^20[0-9]{2}-(PRI|EST|AUT|INV)$'),
  predictor_player_id uuid not null references public.players(id) on delete cascade,
  target_player_id uuid not null references public.players(id) on delete cascade,
  template_id smallint not null check (template_id between 1 and 140),
  template_code text not null,
  template_version integer not null check (template_version > 0),
  category text not null,
  description text not null,
  condition_snapshot jsonb not null check (jsonb_typeof(condition_snapshot) = 'object'),
  parameters_snapshot jsonb not null check (jsonb_typeof(parameters_snapshot) = 'object'),
  configuration_version integer not null references public.advanced_prediction_configurations(version),
  rules_snapshot jsonb not null check (jsonb_typeof(rules_snapshot) = 'object'),
  difficulty text not null check (difficulty in ('COMMON','UNCOMMON','RARE','EPIC','LEGENDARY')),
  weight smallint not null check (weight > 0),
  estimated_probability numeric(6,5) check (estimated_probability between 0 and 1),
  historical_sample_size integer not null default 0 check (historical_sample_size >= 0),
  estimation_method text not null check (estimation_method in ('INDIVIDUAL','LEAGUE','DEFAULT')),
  historical_snapshot jsonb not null default '{}'::jsonb,
  assigned_at timestamptz not null default now(),
  selected_at timestamptz,
  locked_at timestamptz,
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE','SELECTED','PENDING','WON','LOST','VOID','EXPIRED')),
  check (predictor_player_id <> target_player_id),
  unique(match_id,predictor_player_id,template_id,target_player_id,parameters_snapshot)
);
create index advanced_prediction_assignments_player_idx on public.advanced_prediction_assignments(league_id,season_key,predictor_player_id,match_id);
create index advanced_prediction_assignments_match_idx on public.advanced_prediction_assignments(match_id,status);
create index advanced_prediction_assignments_target_idx on public.advanced_prediction_assignments(target_player_id,template_id,assigned_at desc);

create table public.advanced_prediction_generations (
  match_id uuid not null references public.matches(id) on delete cascade,
  predictor_player_id uuid not null references public.players(id) on delete cascade,
  generated_at timestamptz not null default now(),
  assignment_count smallint not null check (assignment_count between 0 and 10),
  primary key(match_id,predictor_player_id)
);

create table public.advanced_prediction_stat_confirmations (
  match_id uuid primary key references public.matches(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  confirmed_by uuid references auth.users(id) on delete set null
);

create table public.advanced_prediction_dirty_matches (
  match_id uuid primary key references public.matches(id) on delete cascade,
  changed_at timestamptz not null default now()
);

create table public.advanced_prediction_results (
  assignment_id uuid primary key references public.advanced_prediction_assignments(id) on delete cascade,
  outcome text not null check (outcome in ('WON','LOST','VOID')),
  observed_values jsonb not null default '{}'::jsonb,
  reason text not null,
  points_units integer not null,
  official_stats_version text not null,
  evaluation_version integer not null check (evaluation_version > 0),
  revision integer not null default 1 check (revision > 0),
  validated_at timestamptz not null default now()
);

create table public.advanced_prediction_match_summaries (
  match_id uuid not null references public.matches(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  season_key text not null,
  predictor_player_id uuid not null references public.players(id) on delete cascade,
  selected_count smallint not null default 0,
  won_count smallint not null default 0,
  lost_count smallint not null default 0,
  void_count smallint not null default 0,
  positive_units integer not null default 0,
  negative_units integer not null default 0,
  base_units integer not null default 0,
  multiplier_basis_points integer not null default 10000,
  bonus_units integer not null default 0,
  final_units integer not null default 0,
  consolidated_at timestamptz,
  primary key(match_id,predictor_player_id),
  check (selected_count between 0 and 10),
  check (won_count + lost_count + void_count <= selected_count)
);
create index advanced_prediction_summary_season_idx on public.advanced_prediction_match_summaries(league_id,season_key,final_units desc);

create table public.advanced_prediction_audit (
  id bigint generated always as identity primary key,
  assignment_id uuid references public.advanced_prediction_assignments(id) on delete set null,
  match_id uuid not null references public.matches(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('GENERATE','SELECT','DESELECT','LOCK','VALIDATE','VOID','RECALCULATE','CORRECT')),
  old_values jsonb,
  new_values jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index advanced_prediction_audit_match_idx on public.advanced_prediction_audit(match_id,created_at desc);

alter table public.advanced_prediction_configurations enable row level security;
alter table public.advanced_prediction_match_rules enable row level security;
alter table public.advanced_prediction_league_settings enable row level security;
alter table public.advanced_prediction_assignments enable row level security;
alter table public.advanced_prediction_generations enable row level security;
alter table public.advanced_prediction_stat_confirmations enable row level security;
alter table public.advanced_prediction_dirty_matches enable row level security;
alter table public.advanced_prediction_results enable row level security;
alter table public.advanced_prediction_match_summaries enable row level security;
alter table public.advanced_prediction_audit enable row level security;
revoke all on public.advanced_prediction_configurations,public.advanced_prediction_match_rules,public.advanced_prediction_league_settings,
  public.advanced_prediction_assignments,public.advanced_prediction_generations,
  public.advanced_prediction_stat_confirmations,public.advanced_prediction_dirty_matches,public.advanced_prediction_results,
  public.advanced_prediction_match_summaries,public.advanced_prediction_audit from anon,authenticated;

insert into public.advanced_prediction_configurations(version,rules) values (1,'{
  "version":1,"maxAssignments":10,"desiredDistribution":{"COMMON":3,"UNCOMMON":3,"RARE":2,"EPIC":1,"LEGENDARY":1},
  "weights":{"COMMON":1,"UNCOMMON":2,"RARE":3,"EPIC":4,"LEGENDARY":5},
  "probabilityThresholds":{"common":0.65,"uncommon":0.45,"rare":0.25,"epic":0.10},
  "minIndividualSample":10,"historyWindow":20,"rotationWindow":3,"minAccuracyBasisPoints":7000,
  "multipliers":[{"wins":9,"basisPoints":20000},{"wins":7,"basisPoints":17500},{"wins":5,"basisPoints":15000},{"wins":3,"basisPoints":12500}]
}'::jsonb);

-- One transaction and a row lock ensure retry-safe generation, including an empty candidate pool.
-- Only the trusted Edge Function may call this RPC. Browser requests cannot supply conditions or weights.
create function public.advanced_prediction_generate(p_match uuid,p_predictor uuid,p_configuration_version integer,p_rows jsonb)
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
  if exists(select 1 from match_players mp join players p on p.id=mp.player_id
      join league_members lm on lm.user_id=p.user_id and lm.league_id=m.league_id
      where mp.match_id=p_match and mp.player_id=p_predictor and lm.role='admin') then
    raise exception 'Conflitto di interessi: ADMIN partecipante'; end if;
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

create function public.advanced_prediction_leaderboard(p_league uuid,p_season text,p_kind text default 'PROFETA',p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare output jsonb;
begin
  if auth.uid() is null or not exists(select 1 from league_members where league_id=p_league and user_id=auth.uid()) then
    raise exception 'Permesso negato'; end if;
  if p_kind not in ('PROFETA','CHIRURGO','CORAGGIOSO','ORACOLO','COMBO','VEGGENTE','DISASTRO')
    or p_limit not between 1 and 100 or p_offset<0 then raise exception 'Filtro non valido'; end if;
  if p_kind='DISASTRO' and not exists(select 1 from advanced_prediction_league_settings
      where league_id=p_league and show_disaster_board) then raise exception 'Classifica non attiva'; end if;
  with totals as (
    select s.predictor_player_id as player_id,
      sum(s.selected_count)::integer as selected_count,sum(s.won_count)::integer as won_count,
      sum(s.lost_count)::integer as lost_count,sum(s.void_count)::integer as void_count,
      sum(s.positive_units)::bigint as positive_units,sum(s.negative_units)::bigint as negative_units,
      sum(s.base_units)::bigint as base_units,sum(s.bonus_units)::bigint as bonus_units,
      sum(s.final_units)::bigint as final_units,
      count(*) filter(where s.won_count+s.lost_count>0)::integer as played_matches,
      max(s.final_units) as best_match_units,
      count(*) filter(where s.won_count+s.lost_count>=4 and
        s.won_count*4 >= (s.won_count+s.lost_count)*3)::integer as strong_matches,
      (array_agg(s.final_units order by m.date desc,m.id desc))[1] as last_match_units
    from advanced_prediction_match_summaries s join matches m on m.id=s.match_id
    where s.league_id=p_league and s.season_key=p_season and s.consolidated_at is not null
    group by s.predictor_player_id
  ), details as (
    select a.predictor_player_id as player_id,count(*)::integer as received_count,
      avg(a.weight) filter(where r.outcome in ('WON','LOST')) as average_difficulty,
      count(*) filter(where r.outcome='WON' and a.difficulty in ('EPIC','LEGENDARY'))::integer as oracle_wins
    from advanced_prediction_assignments a left join advanced_prediction_results r on r.assignment_id=a.id
    where a.league_id=p_league and a.season_key=p_season group by a.predictor_player_id
  ), scoped as (
    select t.*,d.received_count,d.average_difficulty,d.oracle_wins,p.name,p.photo_path,
      case when t.won_count+t.lost_count>0 then t.won_count::numeric/(t.won_count+t.lost_count) else 0 end as accuracy
    from totals t join details d on d.player_id=t.player_id join players p on p.id=t.player_id
    where t.won_count+t.lost_count>0
      and (p_kind not in ('CHIRURGO','CORAGGIOSO') or t.won_count+t.lost_count>=20)
  ), ordered as (
    select s.*,rank() over(order by
      case when p_kind='PROFETA' then s.final_units when p_kind='DISASTRO' then -s.final_units
        when p_kind='COMBO' then s.bonus_units when p_kind='VEGGENTE' then s.strong_matches
        when p_kind='ORACOLO' then s.oracle_wins end desc nulls last,
      case when p_kind='CHIRURGO' then s.accuracy when p_kind='CORAGGIOSO' then s.average_difficulty
        else s.accuracy end desc nulls last,s.won_count desc) as position
    from scoped s
  )
  select coalesce(jsonb_agg(to_jsonb(row) order by row.position,row.player_id),'[]'::jsonb) into output
    from (select * from ordered order by position,player_id limit p_limit offset p_offset) row;
  return output;
end $$;
revoke all on function public.advanced_prediction_leaderboard(uuid,text,text,integer,integer) from public,anon;
grant execute on function public.advanced_prediction_leaderboard(uuid,text,text,integer,integer) to authenticated;

create function public.advanced_prediction_my_stats(p_league uuid,p_season text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare mine uuid; result jsonb;
begin
  if auth.uid() is null or not exists(select 1 from league_members
      where league_id=p_league and user_id=auth.uid()) then raise exception 'Permesso negato'; end if;
  select p.id into mine from players p join league_players lp on lp.player_id=p.id and lp.league_id=p_league
    where p.user_id=auth.uid() limit 1;
  if mine is null then return '{}'::jsonb; end if;
  select jsonb_build_object(
    'received',count(*),'selected',count(*) filter(where a.selected_at is not null),
    'won',count(*) filter(where r.outcome='WON'),'lost',count(*) filter(where r.outcome='LOST'),
    'void',count(*) filter(where r.outcome='VOID'),
    'weighted_accuracy',case when coalesce(sum(a.weight) filter(where r.outcome in ('WON','LOST')),0)>0
      then round(coalesce(sum(a.weight) filter(where r.outcome='WON'),0)::numeric /
        sum(a.weight) filter(where r.outcome in ('WON','LOST'))*100,2) else null end,
    'average_difficulty',round(avg(a.weight) filter(where r.outcome in ('WON','LOST')),2),
    'matches',coalesce((select jsonb_agg(jsonb_build_object('selected',s.selected_count,
      'won',s.won_count,'lost',s.lost_count,'final_units',s.final_units,
      'multiplier_basis_points',s.multiplier_basis_points) order by m.date,m.id)
      from advanced_prediction_match_summaries s join matches m on m.id=s.match_id
      where s.league_id=p_league and s.season_key=p_season and s.predictor_player_id=mine
        and s.consolidated_at is not null),'[]'::jsonb),
    'categories',coalesce((select jsonb_object_agg(category,jsonb_build_object('validated',validated,
      'won',won,'net_units',net_units)) from (
        select x.category,count(*) filter(where z.outcome in ('WON','LOST')) as validated,
          count(*) filter(where z.outcome='WON') as won,coalesce(sum(z.points_units),0) as net_units
        from advanced_prediction_assignments x left join advanced_prediction_results z on z.assignment_id=x.id
        where x.league_id=p_league and x.season_key=p_season and x.predictor_player_id=mine group by x.category
      ) categories),'{}'::jsonb),
    'difficulties',coalesce((select jsonb_object_agg(difficulty,jsonb_build_object('validated',validated,
      'won',won,'net_units',net_units)) from (
        select x.difficulty,count(*) filter(where z.outcome in ('WON','LOST')) as validated,
          count(*) filter(where z.outcome='WON') as won,coalesce(sum(z.points_units),0) as net_units
        from advanced_prediction_assignments x left join advanced_prediction_results z on z.assignment_id=x.id
        where x.league_id=p_league and x.season_key=p_season and x.predictor_player_id=mine group by x.difficulty
      ) difficulties),'{}'::jsonb)
  ) into result from advanced_prediction_assignments a left join advanced_prediction_results r on r.assignment_id=a.id
    where a.league_id=p_league and a.season_key=p_season and a.predictor_player_id=mine;
  return result;
end $$;
revoke all on function public.advanced_prediction_my_stats(uuid,text) from public,anon;
grant execute on function public.advanced_prediction_my_stats(uuid,text) to authenticated;

create function public.advanced_prediction_my_history(p_league uuid,p_season text default null,p_limit integer default 50,p_offset integer default 0,
  p_match uuid default null,p_category text default null,p_target uuid default null,p_difficulty text default null,p_outcome text default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare output jsonb;
begin
  if auth.uid() is null or not exists(select 1 from league_members
      where league_id=p_league and user_id=auth.uid()) then raise exception 'Permesso negato'; end if;
  if p_limit not between 1 and 100 or p_offset<0 then raise exception 'Paginazione non valida'; end if;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.date desc,item.assignment_id),'[]'::jsonb) into output
    from (select a.id as assignment_id,a.match_id,m.date,a.season_key,a.category,a.difficulty,
      a.target_player_id,target.name as target_name,a.description,a.status,
      r.outcome,r.points_units,r.reason
      from advanced_prediction_assignments a join players p on p.id=a.predictor_player_id
        join players target on target.id=a.target_player_id
        join matches m on m.id=a.match_id
        left join advanced_prediction_results r on r.assignment_id=a.id
      where a.league_id=p_league and p.user_id=auth.uid() and m.score_a is not null and m.score_b is not null
        and (p_season is null or a.season_key=p_season)
        and (p_match is null or a.match_id=p_match)
        and (p_category is null or a.category=p_category)
        and (p_target is null or a.target_player_id=p_target)
        and (p_difficulty is null or a.difficulty=p_difficulty)
        and (p_outcome is null or r.outcome=p_outcome or (p_outcome='PENDING' and a.selected_at is not null and r.outcome is null)
          or (p_outcome='EXPIRED' and a.status='EXPIRED'))
      order by m.date desc,a.id limit p_limit offset p_offset) item;
  return output;
end $$;
revoke all on function public.advanced_prediction_my_history(uuid,text,integer,integer,uuid,text,uuid,text,text) from public,anon;
grant execute on function public.advanced_prediction_my_history(uuid,text,integer,integer,uuid,text,uuid,text,text) to authenticated;

create function public.advanced_prediction_admin_results(p_match uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare m matches%rowtype; output jsonb;
begin
  select * into m from matches where id=p_match;
  if auth.uid() is null or not found or not public.is_league_admin(m.league_id) then raise exception 'Permesso negato'; end if;
  if m.score_a is null or m.score_b is null or not public.advanced_prediction_ready(p_match) then
    return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'predictor',p.name,'target',target.name,'description',a.description,'difficulty',a.difficulty,
    'outcome',r.outcome,'points_units',r.points_units)
    order by p.name,a.assigned_at,a.id),'[]'::jsonb) into output
    from advanced_prediction_assignments a join players p on p.id=a.predictor_player_id
      join players target on target.id=a.target_player_id
      left join advanced_prediction_results r on r.assignment_id=a.id
    where a.match_id=p_match and a.selected_at is not null;
  return output;
end $$;
revoke all on function public.advanced_prediction_admin_results(uuid) from public,anon;
grant execute on function public.advanced_prediction_admin_results(uuid) to authenticated;

create function public.advanced_prediction_balance(p_league uuid,p_season text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare output jsonb;
begin
  if auth.uid() is null or not public.is_league_admin(p_league) then raise exception 'Permesso negato'; end if;
  select jsonb_build_object(
    'by_difficulty',coalesce((select jsonb_agg(to_jsonb(d) order by d.difficulty) from (
      select a.difficulty,count(*) as assigned,count(*) filter(where a.selected_at is not null) as selected,
        count(*) filter(where r.outcome='WON') as won,count(*) filter(where r.outcome='LOST') as lost,
        count(*) filter(where r.outcome='VOID') as void
      from advanced_prediction_assignments a join advanced_prediction_match_summaries s
        on s.match_id=a.match_id and s.predictor_player_id=a.predictor_player_id and s.consolidated_at is not null
      left join advanced_prediction_results r on r.assignment_id=a.id
      where a.league_id=p_league and a.season_key=p_season group by a.difficulty
    ) d),'[]'::jsonb),
    'by_template',coalesce((select jsonb_agg(to_jsonb(t) order by t.assigned desc,t.template_id) from (
      select a.template_id,a.template_code,count(*) as assigned,
        count(*) filter(where a.selected_at is not null) as selected,
        count(*) filter(where r.outcome='WON') as won
      from advanced_prediction_assignments a join advanced_prediction_match_summaries s
        on s.match_id=a.match_id and s.predictor_player_id=a.predictor_player_id and s.consolidated_at is not null
      left join advanced_prediction_results r on r.assignment_id=a.id
      where a.league_id=p_league and a.season_key=p_season group by a.template_id,a.template_code
    ) t),'[]'::jsonb),
    'default_estimates',(select count(*) from advanced_prediction_assignments a
      join advanced_prediction_match_summaries s on s.match_id=a.match_id and s.predictor_player_id=a.predictor_player_id
      where a.league_id=p_league and a.season_key=p_season and s.consolidated_at is not null
        and a.estimation_method='DEFAULT'),
    'average_final_units',(select round(avg(s.final_units),2) from advanced_prediction_match_summaries s
      where s.league_id=p_league and s.season_key=p_season and s.consolidated_at is not null),
    'multiplied_matches',(select count(*) from advanced_prediction_match_summaries s
      where s.league_id=p_league and s.season_key=p_season and s.consolidated_at is not null
        and s.multiplier_basis_points>10000)
  ) into output;
  return output;
end $$;
revoke all on function public.advanced_prediction_balance(uuid,text) from public,anon;
grant execute on function public.advanced_prediction_balance(uuid,text) to authenticated;
revoke all on function public.advanced_prediction_generate(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.advanced_prediction_generate(uuid,uuid,integer,jsonb) to service_role;

create function public.advanced_prediction_refresh(p_match uuid,p_predictor uuid,p_rows jsonb)
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
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>10 then raise exception 'Sostituzioni non valide'; end if;
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
  select 10-count(*) into remaining from advanced_prediction_assignments
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
revoke all on function public.advanced_prediction_refresh(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.advanced_prediction_refresh(uuid,uuid,jsonb) to service_role;

create function public.advanced_prediction_lock_due(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path=public as $$
declare match_row record; locked integer:=0; affected integer;
begin
  for match_row in select m.id from matches m
    where m.play_time is not null and (m.date+m.play_time) at time zone 'Europe/Rome'<=p_now
      and exists(select 1 from advanced_prediction_assignments a where a.match_id=m.id
        and a.status in ('AVAILABLE','SELECTED'))
    for update skip locked loop
    update advanced_prediction_assignments set status=case when selected_at is null then 'EXPIRED' else 'PENDING' end,
      locked_at=p_now where match_id=match_row.id and status in ('AVAILABLE','SELECTED');
    get diagnostics affected=row_count;
    locked:=locked+affected;
    insert into advanced_prediction_audit(match_id,action,new_values)
      values(match_row.id,'LOCK',jsonb_build_object('assignments',affected));
  end loop;
  return locked;
end $$;
revoke all on function public.advanced_prediction_lock_due(timestamptz) from public,anon,authenticated;
grant execute on function public.advanced_prediction_lock_due(timestamptz) to service_role;
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('advanced-prediction-lock','* * * * *','select public.advanced_prediction_lock_due()');
  end if;
end $$;

create function public.advanced_prediction_select(p_assignment uuid,p_selected boolean)
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
      and predictor_player_id=a.predictor_player_id and status='SELECTED')>=10 then
    raise exception 'Limite di pronostici raggiunto'; end if;
  if (a.status='SELECTED')=p_selected then return; end if;
  update advanced_prediction_assignments set status=case when p_selected then 'SELECTED' else 'AVAILABLE' end,
    selected_at=case when p_selected then now() else null end where id=p_assignment;
  insert into advanced_prediction_audit(assignment_id,match_id,actor_user_id,action,old_values,new_values)
    values(p_assignment,a.match_id,auth.uid(),case when p_selected then 'SELECT' else 'DESELECT' end,
      jsonb_build_object('status',a.status),jsonb_build_object('status',case when p_selected then 'SELECTED' else 'AVAILABLE' end));
end $$;
revoke all on function public.advanced_prediction_select(uuid,boolean) from public,anon;
grant execute on function public.advanced_prediction_select(uuid,boolean) to authenticated;

create function public.advanced_prediction_my_board(p_match uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare lid uuid; mine uuid;
begin
  select league_id into lid from matches where id=p_match;
  if auth.uid() is null or lid is null or not exists(select 1 from league_members
      where league_id=lid and user_id=auth.uid()) then raise exception 'Permesso negato'; end if;
  select mp.player_id into mine from match_players mp join players p on p.id=mp.player_id
    where mp.match_id=p_match and p.user_id=auth.uid() limit 1;
  if mine is null then raise exception 'Non partecipi alla partita'; end if;
  return jsonb_build_object('assignments',coalesce((select jsonb_agg(to_jsonb(a) order by a.assigned_at,a.id)
    from advanced_prediction_assignments a where a.match_id=p_match and a.predictor_player_id=mine),'[]'::jsonb),
    'summary',(select to_jsonb(s) from advanced_prediction_match_summaries s
      where s.match_id=p_match and s.predictor_player_id=mine));
end $$;
revoke all on function public.advanced_prediction_my_board(uuid) from public,anon;
grant execute on function public.advanced_prediction_my_board(uuid) to authenticated;

create function public.advanced_prediction_enabled(p_league uuid)
returns boolean language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not exists(select 1 from league_members
      where league_id=p_league and user_id=auth.uid()) then raise exception 'Permesso negato'; end if;
  return exists(select 1 from advanced_prediction_league_settings where league_id=p_league and enabled);
end $$;
revoke all on function public.advanced_prediction_enabled(uuid) from public,anon;
grant execute on function public.advanced_prediction_enabled(uuid) to authenticated;

create function public.advanced_prediction_set_enabled(p_league uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.is_league_admin(p_league) then raise exception 'Permesso negato'; end if;
  insert into advanced_prediction_league_settings(league_id,enabled) values(p_league,p_enabled)
    on conflict(league_id) do update set enabled=excluded.enabled,updated_at=now();
  perform public.audit_event('advanced_predictions.'||case when p_enabled then 'enable' else 'disable' end,
    'leagues',p_league::text,p_league,'Pronostici avanzati','impostazioni',null,auth.uid());
end $$;
revoke all on function public.advanced_prediction_set_enabled(uuid,boolean) from public,anon;
grant execute on function public.advanced_prediction_set_enabled(uuid,boolean) to authenticated;

create function public.advanced_prediction_ready(p_match uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from community_vote_settings where match_id=p_match and finalized_at is not null)
    or exists(select 1 from advanced_prediction_stat_confirmations where match_id=p_match);
$$;
revoke all on function public.advanced_prediction_ready(uuid) from public,anon,authenticated;
grant execute on function public.advanced_prediction_ready(uuid) to service_role;

create function public.advanced_prediction_confirm_stats(p_match uuid)
returns void language plpgsql security definer set search_path=public as $$
declare m matches%rowtype;
begin
  select * into m from matches where id=p_match for update;
  if auth.uid() is null or not found or not public.is_league_admin(m.league_id) then
    raise exception 'Solo l’ADMIN della lega può confermare le statistiche'; end if;
  if m.play_time is null or now()<(m.date+m.play_time) at time zone 'Europe/Rome'
    or m.score_a is null or m.score_b is null then raise exception 'Partita non conclusa'; end if;
  if exists(select 1 from community_vote_settings where match_id=p_match and finalized_at is null) then
    raise exception 'Attendi la fine della votazione pagelle'; end if;
  if not exists(select 1 from match_players where match_id=p_match) then raise exception 'Statistiche assenti'; end if;
  insert into advanced_prediction_stat_confirmations(match_id,confirmed_by) values(p_match,auth.uid())
    on conflict(match_id) do update set confirmed_at=now(),confirmed_by=excluded.confirmed_by;
  insert into advanced_prediction_dirty_matches(match_id) values(p_match)
    on conflict(match_id) do update set changed_at=now();
  insert into advanced_prediction_audit(match_id,actor_user_id,action,reason)
    values(p_match,auth.uid(),'CORRECT','Statistiche ufficiali confermate');
end $$;
revoke all on function public.advanced_prediction_confirm_stats(uuid) from public,anon;
grant execute on function public.advanced_prediction_confirm_stats(uuid) to authenticated;

create function public.advanced_prediction_mark_dirty()
returns trigger language plpgsql security definer set search_path=public as $$
declare mid uuid;
begin
  mid:=coalesce(new.match_id,old.match_id);
  if exists(select 1 from advanced_prediction_generations where match_id=mid) then
    if tg_table_name='match_players' and tg_op='UPDATE' and
      (new.goals,new.assist,new.autogol,new.meta) is distinct from
      (old.goals,old.assist,old.autogol,old.meta) then
      delete from advanced_prediction_stat_confirmations where match_id=mid;
    end if;
    insert into advanced_prediction_dirty_matches(match_id) values(mid)
      on conflict(match_id) do update set changed_at=now();
  end if;
  return coalesce(new,old);
end $$;
create trigger advanced_prediction_stats_dirty after update on public.match_players
  for each row when (new.goals is distinct from old.goals or new.assist is distinct from old.assist
    or new.autogol is distinct from old.autogol or new.meta is distinct from old.meta or new.rating is distinct from old.rating)
  execute function public.advanced_prediction_mark_dirty();
create trigger advanced_prediction_poll_dirty after update on public.community_vote_settings
  for each row when (new.finalized_at is distinct from old.finalized_at)
  execute function public.advanced_prediction_mark_dirty();

-- Replaces the whole match result, then derives every summary from stored rows.
-- This makes retries and official-stat corrections idempotent instead of incrementing points.
create function public.advanced_prediction_reconcile(p_match uuid,p_results jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare m matches%rowtype; item jsonb; assigned advanced_prediction_assignments%rowtype;
  previous advanced_prediction_results%rowtype; stats_hash text; result_count integer; selected_count integer;
  person record; wins integer; losses integer; voids integer; positive integer; negative integer;
  base integer; multiplier integer; tier jsonb; rules jsonb;
begin
  select * into m from matches where id=p_match for update;
  if not found or not public.advanced_prediction_ready(p_match) then raise exception 'Statistiche non consolidate'; end if;
  if m.score_a is null or m.score_b is null then raise exception 'Risultato mancante'; end if;
  if jsonb_typeof(p_results)<>'array' then raise exception 'Risultati non validi'; end if;
  select count(*) into selected_count from advanced_prediction_assignments
    where match_id=p_match and selected_at is not null;
  result_count:=jsonb_array_length(p_results);
  if result_count<>selected_count or exists(select 1 from jsonb_array_elements(p_results) x
      group by x->>'assignment_id' having count(*)>1) then raise exception 'Risultati incompleti o duplicati'; end if;
  select md5(coalesce(jsonb_agg(jsonb_build_object('player',mp.player_id,'team',mp.team,
    'goals',mp.goals,'assists',mp.assist,'ownGoals',mp.autogol,'metas',mp.meta,'rating',mp.rating)
    order by mp.player_id)::text,'[]')||':'||m.score_a||':'||m.score_b)
    into stats_hash from match_players mp where mp.match_id=p_match;
  for item in select value from jsonb_array_elements(p_results) loop
    select * into assigned from advanced_prediction_assignments
      where id=(item->>'assignment_id')::uuid and match_id=p_match and selected_at is not null;
    if not found or item->>'outcome' not in ('WON','LOST','VOID') then raise exception 'Esito non valido'; end if;
    select * into previous from advanced_prediction_results where assignment_id=assigned.id;
    if previous.assignment_id is null or previous.outcome is distinct from item->>'outcome'
      or previous.observed_values is distinct from coalesce(item->'observed_values','{}'::jsonb)
      or previous.official_stats_version is distinct from stats_hash then
      insert into advanced_prediction_results(assignment_id,outcome,observed_values,reason,points_units,
        official_stats_version,evaluation_version,revision,validated_at)
      values(assigned.id,item->>'outcome',coalesce(item->'observed_values','{}'::jsonb),coalesce(item->>'reason','Valutazione automatica'),
        case item->>'outcome' when 'WON' then assigned.weight*10000 when 'LOST' then -assigned.weight*10000 else 0 end,
        stats_hash,1,coalesce(previous.revision,0)+1,now())
      on conflict(assignment_id) do update set outcome=excluded.outcome,observed_values=excluded.observed_values,
        reason=excluded.reason,points_units=excluded.points_units,official_stats_version=excluded.official_stats_version,
        evaluation_version=excluded.evaluation_version,revision=excluded.revision,validated_at=excluded.validated_at;
      insert into advanced_prediction_audit(assignment_id,match_id,action,old_values,new_values,reason)
        values(assigned.id,p_match,case when previous.assignment_id is null then 'VALIDATE' else 'RECALCULATE' end,
          case when previous.assignment_id is null then null else to_jsonb(previous) end,
          jsonb_build_object('outcome',item->>'outcome','stats_version',stats_hash),item->>'reason');
    end if;
    update advanced_prediction_assignments set status=item->>'outcome',locked_at=coalesce(locked_at,now()) where id=assigned.id;
  end loop;
  update advanced_prediction_assignments set status='EXPIRED',locked_at=coalesce(locked_at,now())
    where match_id=p_match and selected_at is null and status='AVAILABLE';
  for person in select * from advanced_prediction_generations where match_id=p_match loop
    select count(*) filter(where r.outcome='WON'),count(*) filter(where r.outcome='LOST'),
      count(*) filter(where r.outcome='VOID'),
      coalesce(sum(r.points_units) filter(where r.points_units>0),0),
      coalesce(-sum(r.points_units) filter(where r.points_units<0),0)
      into wins,losses,voids,positive,negative
      from advanced_prediction_assignments a join advanced_prediction_results r on r.assignment_id=a.id
      where a.match_id=p_match and a.predictor_player_id=person.predictor_player_id;
    base:=positive-negative;
    multiplier:=10000;
    select rules_snapshot into rules from advanced_prediction_assignments
      where match_id=p_match and predictor_player_id=person.predictor_player_id limit 1;
    if base>0 and wins>=3 and wins*10000 >= (wins+losses)*coalesce((rules->>'minAccuracyBasisPoints')::integer,7000) then
      for tier in select value from jsonb_array_elements(rules->'multipliers') loop
        if wins>=(tier->>'wins')::integer then multiplier:=(tier->>'basisPoints')::integer; exit; end if;
      end loop;
    end if;
    insert into advanced_prediction_match_summaries(match_id,league_id,season_key,predictor_player_id,
      selected_count,won_count,lost_count,void_count,positive_units,negative_units,base_units,
      multiplier_basis_points,bonus_units,final_units,consolidated_at)
    select p_match,m.league_id,a.season_key,person.predictor_player_id,wins+losses+voids,wins,losses,voids,
      positive,negative,base,multiplier,base::bigint*(multiplier-10000)/10000,base::bigint*multiplier/10000,now()
    from advanced_prediction_assignments a where a.match_id=p_match and a.predictor_player_id=person.predictor_player_id limit 1
    on conflict(match_id,predictor_player_id) do update set
      selected_count=excluded.selected_count,won_count=excluded.won_count,lost_count=excluded.lost_count,
      void_count=excluded.void_count,positive_units=excluded.positive_units,negative_units=excluded.negative_units,
      base_units=excluded.base_units,multiplier_basis_points=excluded.multiplier_basis_points,
      bonus_units=excluded.bonus_units,final_units=excluded.final_units,consolidated_at=excluded.consolidated_at;
  end loop;
  delete from advanced_prediction_dirty_matches where match_id=p_match;
end $$;
revoke all on function public.advanced_prediction_reconcile(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.advanced_prediction_reconcile(uuid,jsonb) to service_role;

create function public.advanced_prediction_reconcile_run()
returns void language plpgsql security definer set search_path=public,extensions as $$
declare secret text;
begin
  if not exists(select 1 from advanced_prediction_dirty_matches d
      where public.advanced_prediction_ready(d.match_id)) then return; end if;
  select value into secret from private_config where key='cron_secret';
  if secret is null then raise warning 'advanced_prediction_reconcile_run: cron_secret mancante'; return; end if;
  perform net.http_post(url:='https://ivrwqpuikbnvnxgvgegd.supabase.co/functions/v1/advanced-predictions',
    headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',secret),
    body:='{"action":"reconcile"}'::jsonb,timeout_milliseconds:=20000);
end $$;
revoke all on function public.advanced_prediction_reconcile_run() from public,anon,authenticated;
grant execute on function public.advanced_prediction_reconcile_run() to service_role;
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('advanced-prediction-reconcile','* * * * *','select public.advanced_prediction_reconcile_run()');
  end if;
end $$;

-- The legacy 1/X/2 board also keeps members' choices private until the match has a result.
create or replace function public.betting_board(p_league uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb; admin boolean;
begin
  if auth.uid() is null or not exists(select 1 from league_members where league_id=p_league and user_id=auth.uid()) then
    raise exception 'Permesso negato'; end if;
  admin := public.is_league_admin(p_league);
  select coalesce(jsonb_agg(jsonb_build_object(
    'match_id',m.id,'date',m.date,'play_time',m.play_time,'score_a',m.score_a,'score_b',m.score_b,
    'is_open',m.play_time is not null and m.score_a is null and m.score_b is null
      and now() < (m.date+m.play_time) at time zone 'Europe/Rome',
    'my_prediction',(select jsonb_build_object('outcome',v.outcome,'score_a',v.score_a,'score_b',v.score_b)
      from match_predictions v where v.match_id=m.id and v.user_id=auth.uid()),
    'total',(select count(*) from match_predictions v where v.match_id=m.id),
    'entries',case when admin and m.score_a is not null and m.score_b is not null then
      coalesce((select jsonb_agg(jsonb_build_object(
        'user_id',v.user_id,'name',coalesce(public.audit_user_name(v.user_id),'Account'),
        'outcome',v.outcome,'score_a',v.score_a,'score_b',v.score_b)
        order by coalesce(public.audit_user_name(v.user_id),'Account'),v.user_id)
        from match_predictions v where v.match_id=m.id),'[]'::jsonb) else null end
  ) order by m.date desc,m.play_time desc,m.id),'[]'::jsonb) into result
    from (select * from matches where league_id=p_league order by date desc,play_time desc,id limit 30) m;
  return result;
end $$;
