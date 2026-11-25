-- L'ADMIN decide alla creazione se la partita partecipa al Bet.
-- Le partite esistenti restano abilitate; la creazione applicativa passa esplicitamente la scelta.
alter table public.matches add column if not exists betting_enabled boolean not null default true;

create or replace function public.create_match_with_teams(p_match jsonb, p_team_a uuid[], p_team_b uuid[])
returns uuid language plpgsql security invoker set search_path=public as $$
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
  insert into matches(league_id, date, play_time, place, place_lat, place_lng, place_url, notes, score_a, score_b, pred, pred_rank, betting_enabled)
    values (lid, (p_match->>'date')::date, (p_match->>'play_time')::time,
      nullif(btrim(p_match->>'place'), ''), (p_match->>'place_lat')::double precision, (p_match->>'place_lng')::double precision, nullif(btrim(p_match->>'place_url'), ''),
      nullif(p_match->>'notes', ''),
      (p_match->>'score_a')::smallint, (p_match->>'score_b')::smallint,
      (p_match->>'pred')::numeric, (p_match->>'pred_rank')::smallint,
      coalesce((p_match->>'betting_enabled')::boolean,false) and public.advanced_prediction_enabled(lid))
    returning id into mid;
  insert into match_players(match_id, player_id, team, position)
    select mid, p, 'A', (n - 1)::integer from unnest(p_team_a) with ordinality t(p, n)
    union all
    select mid, p, 'B', (n - 1)::integer from unnest(p_team_b) with ordinality t(p, n);
  return mid;
end $$;

-- Protezione anche per chiamate RPC dirette, indipendente dalla visibilità delle card.
create function public.betting_guard_prediction_write()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from matches m join advanced_prediction_league_settings s
      on s.league_id=m.league_id and s.enabled
      where m.id=new.match_id and m.betting_enabled) then
    raise exception 'Bet non attivo per questa partita';
  end if;
  return new;
end $$;
create trigger betting_guard_prediction_write
  before insert or update on public.match_predictions
  for each row execute function public.betting_guard_prediction_write();

create function public.betting_guard_assignment_write()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from matches where id=new.match_id and betting_enabled) then
    raise exception 'Bet non attivo per questa partita';
  end if;
  return new;
end $$;
create trigger betting_guard_assignment_write
  before insert or update of status,selected_at on public.advanced_prediction_assignments
  for each row execute function public.betting_guard_assignment_write();

-- La lista Bet non comprende le partite escluse, anche se sono nella stessa lega.
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
    from (select * from matches where league_id=p_league and betting_enabled
      order by date desc,play_time desc,id limit 30) m;
  return result;
end $$;
