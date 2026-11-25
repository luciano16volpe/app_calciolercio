-- L'ADMIN può sospendere e ripristinare Bet per qualsiasi partita, senza cancellare le giocate.
create function public.set_match_betting(p_match uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path=public as $$
declare m public.matches%rowtype;
begin
  select * into m from public.matches where id=p_match for update;
  if auth.uid() is null or not found or not public.is_league_admin(m.league_id) then
    raise exception 'Partita non trovata o permesso negato';
  end if;
  if p_enabled is null then raise exception 'Scelta Bet non valida'; end if;
  if p_enabled and not exists(select 1 from public.advanced_prediction_league_settings
      where league_id=m.league_id and enabled) then
    raise exception 'Bet non attivo per questa lega';
  end if;
  if m.betting_enabled is distinct from p_enabled then
    update public.matches set betting_enabled=p_enabled where id=p_match;
    perform public.audit_event('match.betting_'||case when p_enabled then 'enabled' else 'disabled' end,
      'matches',p_match::text,m.league_id,'Bet partita','impostazioni',
      jsonb_build_object('betting_enabled',m.betting_enabled),auth.uid());
  end if;
end $$;
revoke all on function public.set_match_betting(uuid,boolean) from public,anon;
grant execute on function public.set_match_betting(uuid,boolean) to authenticated;

-- Dopo la sospensione i risultati possono ancora essere consolidati dal sistema.
-- Restano bloccate nuove assegnazioni e selezioni finché Bet è spento.
create or replace function public.betting_guard_assignment_write()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    if not exists(select 1 from public.matches where id=new.match_id and betting_enabled) then
      raise exception 'Bet non attivo per questa partita';
    end if;
  elsif (new.status in ('AVAILABLE','SELECTED') and new.status is distinct from old.status)
      or (new.selected_at is not null and new.selected_at is distinct from old.selected_at) then
    if not exists(select 1 from public.matches where id=new.match_id and betting_enabled) then
      raise exception 'Bet non attivo per questa partita';
    end if;
  end if;
  return new;
end $$;

-- Le statistiche pubbliche ignorano le partite con Bet sospeso.
create or replace function public.advanced_prediction_leaderboard(p_league uuid,p_season text,p_kind text default 'PROFETA',p_limit integer default 50,p_offset integer default 0)
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
    from advanced_prediction_match_summaries s join matches m on m.id=s.match_id and m.betting_enabled
    where s.league_id=p_league and s.season_key=p_season and s.consolidated_at is not null
    group by s.predictor_player_id
  ), details as (
    select a.predictor_player_id as player_id,count(*)::integer as received_count,
      avg(a.weight) filter(where r.outcome in ('WON','LOST')) as average_difficulty,
      count(*) filter(where r.outcome='WON' and a.difficulty in ('EPIC','LEGENDARY'))::integer as oracle_wins
    from advanced_prediction_assignments a join matches am on am.id=a.match_id and am.betting_enabled left join advanced_prediction_results r on r.assignment_id=a.id
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

create or replace function public.advanced_prediction_my_stats(p_league uuid,p_season text)
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
      from advanced_prediction_match_summaries s join matches m on m.id=s.match_id and m.betting_enabled
      where s.league_id=p_league and s.season_key=p_season and s.predictor_player_id=mine
        and s.consolidated_at is not null),'[]'::jsonb),
    'categories',coalesce((select jsonb_object_agg(category,jsonb_build_object('validated',validated,
      'won',won,'net_units',net_units)) from (
        select x.category,count(*) filter(where z.outcome in ('WON','LOST')) as validated,
          count(*) filter(where z.outcome='WON') as won,coalesce(sum(z.points_units),0) as net_units
        from advanced_prediction_assignments x join matches xm on xm.id=x.match_id and xm.betting_enabled left join advanced_prediction_results z on z.assignment_id=x.id
        where x.league_id=p_league and x.season_key=p_season and x.predictor_player_id=mine group by x.category
      ) categories),'{}'::jsonb),
    'difficulties',coalesce((select jsonb_object_agg(difficulty,jsonb_build_object('validated',validated,
      'won',won,'net_units',net_units)) from (
        select x.difficulty,count(*) filter(where z.outcome in ('WON','LOST')) as validated,
          count(*) filter(where z.outcome='WON') as won,coalesce(sum(z.points_units),0) as net_units
        from advanced_prediction_assignments x join matches xm on xm.id=x.match_id and xm.betting_enabled left join advanced_prediction_results z on z.assignment_id=x.id
        where x.league_id=p_league and x.season_key=p_season and x.predictor_player_id=mine group by x.difficulty
      ) difficulties),'{}'::jsonb)
  ) into result from advanced_prediction_assignments a join matches am on am.id=a.match_id and am.betting_enabled left join advanced_prediction_results r on r.assignment_id=a.id
    where a.league_id=p_league and a.season_key=p_season and a.predictor_player_id=mine;
  return result;
end $$;

create or replace function public.advanced_prediction_my_history(p_league uuid,p_season text default null,p_limit integer default 50,p_offset integer default 0,
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
        join matches m on m.id=a.match_id and m.betting_enabled
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

create or replace function public.advanced_prediction_balance(p_league uuid,p_season text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare output jsonb;
begin
  if auth.uid() is null or not public.is_league_admin(p_league) then raise exception 'Permesso negato'; end if;
  select jsonb_build_object(
    'by_difficulty',coalesce((select jsonb_agg(to_jsonb(d) order by d.difficulty) from (
      select a.difficulty,count(*) as assigned,count(*) filter(where a.selected_at is not null) as selected,
        count(*) filter(where r.outcome='WON') as won,count(*) filter(where r.outcome='LOST') as lost,
        count(*) filter(where r.outcome='VOID') as void
      from advanced_prediction_assignments a join matches am on am.id=a.match_id and am.betting_enabled join advanced_prediction_match_summaries s
        on s.match_id=a.match_id and s.predictor_player_id=a.predictor_player_id and s.consolidated_at is not null
      left join advanced_prediction_results r on r.assignment_id=a.id
      where a.league_id=p_league and a.season_key=p_season group by a.difficulty
    ) d),'[]'::jsonb),
    'by_template',coalesce((select jsonb_agg(to_jsonb(t) order by t.assigned desc,t.template_id) from (
      select a.template_id,a.template_code,count(*) as assigned,
        count(*) filter(where a.selected_at is not null) as selected,
        count(*) filter(where r.outcome='WON') as won
      from advanced_prediction_assignments a join matches am on am.id=a.match_id and am.betting_enabled join advanced_prediction_match_summaries s
        on s.match_id=a.match_id and s.predictor_player_id=a.predictor_player_id and s.consolidated_at is not null
      left join advanced_prediction_results r on r.assignment_id=a.id
      where a.league_id=p_league and a.season_key=p_season group by a.template_id,a.template_code
    ) t),'[]'::jsonb),
    'default_estimates',(select count(*) from advanced_prediction_assignments a
      join matches am on am.id=a.match_id and am.betting_enabled
      join advanced_prediction_match_summaries s on s.match_id=a.match_id and s.predictor_player_id=a.predictor_player_id
      where a.league_id=p_league and a.season_key=p_season and s.consolidated_at is not null
        and a.estimation_method='DEFAULT'),
    'average_final_units',(select round(avg(s.final_units),2) from advanced_prediction_match_summaries s join matches sm on sm.id=s.match_id and sm.betting_enabled
      where s.league_id=p_league and s.season_key=p_season and s.consolidated_at is not null),
    'multiplied_matches',(select count(*) from advanced_prediction_match_summaries s join matches sm on sm.id=s.match_id and sm.betting_enabled
      where s.league_id=p_league and s.season_key=p_season and s.consolidated_at is not null
        and s.multiplier_basis_points>10000)
  ) into output;
  return output;
end $$;

