-- Giocata unica: 1-X-2, risultato esatto e i 5 pronostici sui giocatori contano nello stesso punteggio.
--  · 1-X-2 indovinato = 3 punti; risultato esatto indovinato = altri 5 punti (si sommano, 8 in tutto); sbagliare non toglie punti.
--  · Entrambi contano come pronostici per le soglie del moltiplicatore (fino a 7 elementi) e per la precisione del 70%.
--  · Moltiplicatore sui 7 elementi: 3-4 indovinati x1,25 · 5 x1,50 · 6 x1,75 · 7 x2.
--  · Valgono per le partite non ancora iniziate (regole versione 4); le partite già giocate restano come sono.
insert into public.advanced_prediction_configurations(version,rules)
select 4, jsonb_set(jsonb_set(jsonb_set(rules,'{version}','4'::jsonb),
    '{matchPoints}','{"outcome":3,"exact":5}'::jsonb),
    '{multipliers}','[{"wins":7,"basisPoints":20000},{"wins":6,"basisPoints":17500},{"wins":5,"basisPoints":15000},{"wins":3,"basisPoints":12500}]'::jsonb)
from public.advanced_prediction_configurations where version=3
on conflict (version) do nothing;

do $$
declare cfg jsonb; open_matches uuid[];
begin
  select rules into cfg from advanced_prediction_configurations where version=4;
  select coalesce(array_agg(m.id),'{}') into open_matches
  from matches m join advanced_prediction_match_rules mr on mr.match_id=m.id
  where mr.configuration_version<4 and m.score_a is null and m.score_b is null
    and (m.play_time is null or now()<(m.date+m.play_time) at time zone 'Europe/Rome');
  update advanced_prediction_assignments set configuration_version=4,rules_snapshot=cfg
    where match_id=any(open_matches) and status in ('AVAILABLE','SELECTED');
  update advanced_prediction_match_rules set configuration_version=4,rules_snapshot=cfg where match_id=any(open_matches);
end $$;

create or replace function public.advanced_prediction_reconcile(p_match uuid,p_results jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare m matches%rowtype; item jsonb; assigned advanced_prediction_assignments%rowtype;
  previous advanced_prediction_results%rowtype; stats_hash text; result_count integer; selected_count integer;
  person record; wins integer; losses integer; voids integer; positive integer; negative integer;
  base integer; multiplier integer; tier jsonb; rules jsonb;
  pred match_predictions%rowtype; actual text; season text; has_gen boolean; pts_outcome integer; pts_exact integer;
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
  season:=case when extract(month from m.date) between 3 and 5 then extract(year from m.date)::integer||'-PRI'
    when extract(month from m.date) between 6 and 8 then extract(year from m.date)::integer||'-EST'
    when extract(month from m.date) between 9 and 11 then extract(year from m.date)::integer||'-AUT'
    else (extract(year from m.date)::integer-case when extract(month from m.date)<3 then 1 else 0 end)||'-INV' end;
  actual:=case when m.score_a>m.score_b then '1' when m.score_a<m.score_b then '2' else 'X' end;
  select rules_snapshot into rules from advanced_prediction_match_rules where match_id=p_match;
  if rules is null then
    select r.rules into rules from advanced_prediction_configurations r order by r.version desc limit 1;
  end if;
  pts_outcome:=coalesce((rules#>>'{matchPoints,outcome}')::integer,3);
  pts_exact:=coalesce((rules#>>'{matchPoints,exact}')::integer,5);
  -- Giocata unica: chi ha i pronostici sui giocatori e chi ha un pronostico 1-X-2 (con un giocatore collegato alla lega).
  for person in
    select g.predictor_player_id from advanced_prediction_generations g where g.match_id=p_match
    union
    select p.id from match_predictions mp join players p on p.user_id=mp.user_id
      join league_players lp on lp.player_id=p.id and lp.league_id=m.league_id where mp.match_id=p_match
  loop
    has_gen:=exists(select 1 from advanced_prediction_generations g
      where g.match_id=p_match and g.predictor_player_id=person.predictor_player_id);
    select count(*) filter(where r.outcome='WON'),count(*) filter(where r.outcome='LOST'),
      count(*) filter(where r.outcome='VOID'),
      coalesce(sum(r.points_units) filter(where r.points_units>0),0),
      coalesce(-sum(r.points_units) filter(where r.points_units<0),0)
      into wins,losses,voids,positive,negative
      from advanced_prediction_assignments a join advanced_prediction_results r on r.assignment_id=a.id
      where a.match_id=p_match and a.predictor_player_id=person.predictor_player_id;
    -- 1-X-2 e risultato esatto valgono solo con le regole che li prevedono (versione 4 in poi); sbagliare non toglie punti
    if rules ? 'matchPoints' then
      select mp.* into pred from match_predictions mp join players p on p.user_id=mp.user_id
        where mp.match_id=p_match and p.id=person.predictor_player_id limit 1;
      if pred.match_id is not null then
        if pred.outcome=actual then wins:=wins+1; positive:=positive+pts_outcome*10000; else losses:=losses+1; end if;
        if pred.score_a is not null then
          if pred.score_a=m.score_a and pred.score_b=m.score_b then wins:=wins+1; positive:=positive+pts_exact*10000;
          else losses:=losses+1; end if;
        end if;
      end if;
    end if;
    if not has_gen and wins+losses=0 then continue; end if;
    base:=positive-negative;
    multiplier:=10000;
    if base>0 and wins>=3 and wins*10000 >= (wins+losses)*coalesce((rules->>'minAccuracyBasisPoints')::integer,7000) then
      for tier in select value from jsonb_array_elements(rules->'multipliers') loop
        if wins>=(tier->>'wins')::integer then multiplier:=(tier->>'basisPoints')::integer; exit; end if;
      end loop;
    end if;
    insert into advanced_prediction_match_summaries(match_id,league_id,season_key,predictor_player_id,
      selected_count,won_count,lost_count,void_count,positive_units,negative_units,base_units,
      multiplier_basis_points,bonus_units,final_units,consolidated_at)
    values(p_match,m.league_id,season,person.predictor_player_id,wins+losses+voids,wins,losses,voids,
      positive,negative,base,multiplier,base::bigint*(multiplier-10000)/10000,base::bigint*multiplier/10000,now())
    on conflict(match_id,predictor_player_id) do update set
      selected_count=excluded.selected_count,won_count=excluded.won_count,lost_count=excluded.lost_count,
      void_count=excluded.void_count,positive_units=excluded.positive_units,negative_units=excluded.negative_units,
      base_units=excluded.base_units,multiplier_basis_points=excluded.multiplier_basis_points,
      bonus_units=excluded.bonus_units,final_units=excluded.final_units,consolidated_at=excluded.consolidated_at;
  end loop;
  delete from advanced_prediction_dirty_matches where match_id=p_match;
end $$;

create or replace function public.advanced_prediction_mark_dirty()
returns trigger language plpgsql security definer set search_path=public as $$
declare mid uuid;
begin
  mid:=coalesce(new.match_id,old.match_id);
  if exists(select 1 from advanced_prediction_generations where match_id=mid)
    or exists(select 1 from match_predictions where match_id=mid) then
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
