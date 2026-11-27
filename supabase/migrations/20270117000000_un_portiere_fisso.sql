-- Una squadra può avere il portiere fisso anche quando l'altra usa portieri volanti.
alter table public.matches drop constraint if exists matches_two_goalkeepers;
alter table public.matches add constraint matches_up_to_two_goalkeepers check (
  cardinality(goalkeeper_ids) between 0 and 2
  and array_position(goalkeeper_ids, null) is null
  and (cardinality(goalkeeper_ids) < 2 or goalkeeper_ids[1] <> goalkeeper_ids[2])
);

create or replace function public.create_match_with_teams(p_match jsonb, p_team_a uuid[], p_team_b uuid[])
returns uuid language plpgsql security invoker set search_path=public as $$
declare mid uuid; lid uuid := (p_match->>'league_id')::uuid;
  keepers uuid[] := coalesce(array(select value::uuid from jsonb_array_elements_text(coalesce(p_match->'goalkeeper_ids','[]'::jsonb))), '{}'::uuid[]);
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
  if cardinality(keepers) > 2 or
     (cardinality(keepers) = 1 and not (keepers[1] = any(p_team_a) or keepers[1] = any(p_team_b))) or
     (cardinality(keepers) = 2 and (keepers[1] = keepers[2] or not (
       (keepers[1] = any(p_team_a) and keepers[2] = any(p_team_b)) or
       (keepers[2] = any(p_team_a) and keepers[1] = any(p_team_b))))) then
    raise exception 'I portieri fissi devono giocare, uno per squadra se sono due';
  end if;
  insert into matches(league_id, date, play_time, place, place_lat, place_lng, place_url, notes, score_a, score_b, pred, pred_rank, betting_enabled, goalkeeper_ids)
    values (lid, (p_match->>'date')::date, (p_match->>'play_time')::time,
      nullif(btrim(p_match->>'place'), ''), (p_match->>'place_lat')::double precision, (p_match->>'place_lng')::double precision, nullif(btrim(p_match->>'place_url'), ''),
      nullif(p_match->>'notes', ''),
      (p_match->>'score_a')::smallint, (p_match->>'score_b')::smallint,
      (p_match->>'pred')::numeric, (p_match->>'pred_rank')::smallint,
      coalesce((p_match->>'betting_enabled')::boolean,false) and public.advanced_prediction_enabled(lid), keepers)
    returning id into mid;
  insert into match_players(match_id, player_id, team, position)
    select mid, p, 'A', (n - 1)::integer from unnest(p_team_a) with ordinality t(p, n)
    union all
    select mid, p, 'B', (n - 1)::integer from unnest(p_team_b) with ordinality t(p, n);
  return mid;
end $$;

create or replace function public.guard_formation_option_goalkeepers()
returns trigger language plpgsql set search_path=public as $$
declare keepers uuid[];
begin
  select goalkeeper_ids into keepers from matches where id=new.match_id;
  if cardinality(keepers)=1 and not (keepers[1]=any(new.team_a) or keepers[1]=any(new.team_b)) then
    raise exception 'Il portiere fisso deve essere convocato in ogni formazione';
  end if;
  if cardinality(keepers)=2 and not (
    (keepers[1]=any(new.team_a) and keepers[2]=any(new.team_b)) or
    (keepers[2]=any(new.team_a) and keepers[1]=any(new.team_b))
  ) then raise exception 'Ogni formazione deve avere un portiere fisso per squadra'; end if;
  return new;
end $$;
