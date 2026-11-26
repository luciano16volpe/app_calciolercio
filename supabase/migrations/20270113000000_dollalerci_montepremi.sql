-- Punto 3: montepremi per partita, ricalcolabile dopo correzioni ufficiali.
create table public.wallet_match_pools (
  match_id uuid primary key references public.matches(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  staked integer not null check (staked>=0),
  returned integer not null check (returned>=0),
  paid integer not null check (paid>=0),
  remainder integer not null check (remainder>=0),
  settled_at timestamptz not null default now(),
  check (staked=returned+paid+remainder)
);
create table public.wallet_settlements (
  match_id uuid not null references public.matches(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  element_key text not null,
  outcome text not null check (outcome in ('WON','LOST','VOID')),
  weight integer not null check (weight between 1 and 5),
  payout integer not null check (payout>=0),
  primary key (match_id,user_id,element_key)
);
create index wallet_settlements_league_user_idx on public.wallet_settlements(league_id,user_id);
alter table public.wallet_match_pools enable row level security;
alter table public.wallet_settlements enable row level security;
revoke all on public.wallet_match_pools,public.wallet_settlements from anon,authenticated;

-- Le scelte annullate prima del calcio d'inizio vengono tolte e rimborsate.
-- Dopo il calcio d'inizio restano nel fondo: il conguaglio le rimborsa se VOID.
create or replace function public.wallet_assignment_release()
returns trigger language plpgsql security definer set search_path=public as $$
declare owner_user uuid; can_refund boolean;
begin
  if old.selected_at is null then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_op='UPDATE' and new.selected_at is not null and new.status not in ('VOID','EXPIRED') then return new; end if;
  select m.score_a is null and m.score_b is null and m.play_time is not null
      and now()<(m.date+m.play_time) at time zone 'Europe/Rome'
    into can_refund from matches m where m.id=old.match_id;
  if can_refund then
    select user_id into owner_user from players where id=old.predictor_player_id;
    if owner_user is not null then
      perform public.wallet_release_stake(owner_user,old.match_id,'ASSIGNMENT:'||old.id::text);
    end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;

create or replace function public.wallet_prediction_release()
returns trigger language plpgsql security definer set search_path=public as $$
declare can_refund boolean;
begin
  select m.score_a is null and m.score_b is null and m.play_time is not null
      and now()<(m.date+m.play_time) at time zone 'Europe/Rome'
    into can_refund from matches m where m.id=old.match_id;
  if can_refund then
    perform public.wallet_release_stake(old.user_id,old.match_id,'OUTCOME');
    perform public.wallet_release_stake(old.user_id,old.match_id,'EXACT');
  end if;
  return old;
end $$;

create function public.wallet_settle_match(p_match uuid)
returns void language plpgsql security definer set search_path=public as $$
declare m matches%rowtype; item jsonb; calculated jsonb; old_payout integer; delta integer;
  staked_count integer; returned_count integer; paid_count integer; remainder_count integer;
  existing record;
begin
  select * into m from matches where id=p_match for update;
  if not found or m.score_a is null or m.score_b is null then raise exception 'Partita non conclusa'; end if;
  if not public.advanced_prediction_ready(p_match) then raise exception 'Statistiche non consolidate'; end if;

  with evaluated as (
    select s.user_id,s.element_key,
      case when s.element_key='OUTCOME' then 3 when s.element_key='EXACT' then 5
        else coalesce(a.weight,1) end as weight,
      case
        when s.element_key='OUTCOME' then case when p.outcome is null then 'VOID'
          when p.outcome=case when m.score_a>m.score_b then '1' when m.score_a<m.score_b then '2' else 'X' end
            then 'WON' else 'LOST' end
        when s.element_key='EXACT' then case when p.score_a is null then 'VOID'
          when p.score_a=m.score_a and p.score_b=m.score_b then 'WON' else 'LOST' end
        else case when a.id is null or a.selected_at is null then 'VOID'
          else coalesce(r.outcome,'VOID') end
      end as outcome
    from wallet_stakes s
    left join match_predictions p on p.match_id=s.match_id and p.user_id=s.user_id
    left join advanced_prediction_assignments a on s.element_key='ASSIGNMENT:'||a.id::text and a.match_id=s.match_id
    left join advanced_prediction_results r on r.assignment_id=a.id
    where s.match_id=p_match
  ), totals as (
    select count(*)::integer as staked,count(*) filter(where outcome='WON')::integer as winners,
      count(*) filter(where outcome='LOST')::integer as losers,
      coalesce(sum(weight) filter(where outcome='WON'),0)::integer as winning_weight
    from evaluated
  ), amounts as (
    select e.user_id,e.element_key,e.outcome,e.weight,
      case when e.outcome='VOID' or t.winners=0 then 1
        when e.outcome='WON' then 1+(t.losers*e.weight/t.winning_weight)
        else 0 end::integer as payout
    from evaluated e cross join totals t
  )
  select coalesce(jsonb_agg(to_jsonb(amounts) order by user_id,element_key),'[]'::jsonb)
    into calculated from amounts;

  for item in select value from jsonb_array_elements(calculated) loop
    select payout into old_payout from wallet_settlements
      where match_id=p_match and user_id=(item->>'user_id')::uuid and element_key=item->>'element_key';
    delta:=(item->>'payout')::integer-coalesce(old_payout,0);
    if delta<>0 then
      insert into wallet_transactions(league_id,user_id,match_id,amount,kind,note)
        values(m.league_id,(item->>'user_id')::uuid,p_match,delta,'PAYOUT','SETTLEMENT:'||(item->>'element_key'));
    end if;
    insert into wallet_settlements(match_id,league_id,user_id,element_key,outcome,weight,payout)
      values(p_match,m.league_id,(item->>'user_id')::uuid,item->>'element_key',item->>'outcome',
        (item->>'weight')::integer,(item->>'payout')::integer)
      on conflict(match_id,user_id,element_key) do update set outcome=excluded.outcome,
        weight=excluded.weight,payout=excluded.payout;
  end loop;
  for existing in select * from wallet_settlements where match_id=p_match
      and not exists(select 1 from jsonb_array_elements(calculated) x
        where (x->>'user_id')::uuid=wallet_settlements.user_id and x->>'element_key'=wallet_settlements.element_key)
  loop
    if existing.payout<>0 then
      insert into wallet_transactions(league_id,user_id,match_id,amount,kind,note)
        values(m.league_id,existing.user_id,p_match,-existing.payout,'PAYOUT','SETTLEMENT:'||existing.element_key);
    end if;
    delete from wallet_settlements where match_id=p_match and user_id=existing.user_id and element_key=existing.element_key;
  end loop;
  select count(*)::integer,
    count(*) filter(where outcome='VOID' or not exists(select 1 from wallet_settlements w
      where w.match_id=p_match and w.outcome='WON'))::integer,
    coalesce(sum(payout) filter(where outcome<>'VOID' and exists(select 1 from wallet_settlements w
      where w.match_id=p_match and w.outcome='WON')),0)::integer
    into staked_count,returned_count,paid_count from wallet_settlements where match_id=p_match;
  remainder_count:=staked_count-returned_count-paid_count;
  insert into wallet_match_pools(match_id,league_id,staked,returned,paid,remainder,settled_at)
    values(p_match,m.league_id,staked_count,returned_count,paid_count,remainder_count,now())
    on conflict(match_id) do update set staked=excluded.staked,returned=excluded.returned,
      paid=excluded.paid,remainder=excluded.remainder,settled_at=excluded.settled_at;
end $$;
revoke all on function public.wallet_settle_match(uuid) from public,anon,authenticated;

-- Il calcolo del Bet e il conguaglio dei dollalerci devono essere atomici.
alter function public.advanced_prediction_reconcile(uuid,jsonb) rename to advanced_prediction_reconcile_core;
revoke all on function public.advanced_prediction_reconcile_core(uuid,jsonb) from public,anon,authenticated,service_role;
create function public.advanced_prediction_reconcile(p_match uuid,p_results jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.advanced_prediction_reconcile_core(p_match,p_results);
  perform public.wallet_settle_match(p_match);
end $$;
revoke all on function public.advanced_prediction_reconcile(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.advanced_prediction_reconcile(uuid,jsonb) to service_role;

-- Cancellare la partita annulla gli eventuali premi e restituisce le puntate.
create function public.wallet_settlement_reverse_delete()
returns trigger language plpgsql security definer set search_path=public as $$
declare item record;
begin
  for item in select user_id,element_key,payout from wallet_settlements where match_id=old.id and payout<>0 loop
    insert into wallet_transactions(league_id,user_id,match_id,amount,kind,note)
      values(old.league_id,item.user_id,old.id,-item.payout,'PAYOUT','SETTLEMENT:'||item.element_key);
  end loop;
  return old;
end $$;
create trigger wallet_settlement_reverse_delete before delete on public.matches
  for each row execute function public.wallet_settlement_reverse_delete();

-- Tutti i membri vedono solo partite consolidate; niente scelte altrui prima della chiusura.
create function public.wallet_match_receipt(p_match uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare m matches%rowtype; result jsonb;
begin
  select * into m from matches where id=p_match;
  if auth.uid() is null or not found or not exists(select 1 from league_members
      where league_id=m.league_id and user_id=auth.uid()) then raise exception 'Permesso negato'; end if;
  if not exists(select 1 from wallet_match_pools where match_id=p_match) then return null; end if;
  select jsonb_build_object('staked',pool.staked,'returned',pool.returned,'paid',pool.paid,
    'remainder',pool.remainder,'settled_at',pool.settled_at,
    'boldest',(select jsonb_build_object('name',coalesce(public.audit_user_name(s.user_id),'Account'),
      'description',a.description,'weight',s.weight)
      from wallet_settlements s join advanced_prediction_assignments a
        on s.element_key='ASSIGNMENT:'||a.id::text and a.match_id=s.match_id
      where s.match_id=p_match and s.outcome='WON'
      order by s.weight desc,a.estimated_probability asc nulls last,s.user_id limit 1),
    'best',(select jsonb_build_object('name',coalesce(public.audit_user_name(w.user_id),'Account'),
      'net',w.net) from (select user_id,sum(payout)-count(*) as net
        from wallet_settlements where match_id=p_match group by user_id) w
      where w.net>0 order by w.net desc,w.user_id limit 1),
    'mine',coalesce((select jsonb_agg(jsonb_build_object('element_key',s.element_key,
      'outcome',s.outcome,'weight',s.weight,'payout',s.payout) order by s.element_key)
      from wallet_settlements s where s.match_id=p_match and s.user_id=auth.uid()),'[]'::jsonb))
    into result from wallet_match_pools pool where pool.match_id=p_match;
  return result;
end $$;
revoke all on function public.wallet_match_receipt(uuid) from public,anon;
grant execute on function public.wallet_match_receipt(uuid) to authenticated;

create function public.wallet_leaderboard(p_league uuid,p_season text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if auth.uid() is null or not exists(select 1 from league_members
      where league_id=p_league and user_id=auth.uid()) then raise exception 'Permesso negato'; end if;
  with scores as (
    select s.user_id,
      (sum(s.payout)-count(*))::integer as net,
      count(*)::integer as staked,
      sum(s.payout)::integer as won
    from wallet_settlements s join matches m on m.id=s.match_id and m.betting_enabled
      join wallet_match_pools pool on pool.match_id=m.id
    where s.league_id=p_league
      and (p_season is null or case when extract(month from m.date) between 3 and 5 then extract(year from m.date)::integer||'-PRI'
        when extract(month from m.date) between 6 and 8 then extract(year from m.date)::integer||'-EST'
        when extract(month from m.date) between 9 and 11 then extract(year from m.date)::integer||'-AUT'
        else (extract(year from m.date)::integer-case when extract(month from m.date)<3 then 1 else 0 end)||'-INV' end=p_season)
    group by s.user_id
  ), ranked as (
    select row_number() over(order by s.net desc,s.won desc,s.user_id)::integer as position,
      s.user_id,coalesce(public.audit_user_name(s.user_id),'Account') as name,s.net,s.staked,s.won
    from scores s where s.staked>0
  )
  select coalesce(jsonb_agg(to_jsonb(ranked) order by position),'[]'::jsonb) into result from ranked;
  return result;
end $$;
revoke all on function public.wallet_leaderboard(uuid,text) from public,anon;
grant execute on function public.wallet_leaderboard(uuid,text) to authenticated;

-- Dopo il calcio d'inizio tutti i membri possono confrontare le scelte 1-X-2.
create or replace function public.betting_board(p_league uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if auth.uid() is null or not exists(select 1 from league_members
      where league_id=p_league and user_id=auth.uid()) then raise exception 'Permesso negato'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'match_id',m.id,'date',m.date,'play_time',m.play_time,'score_a',m.score_a,'score_b',m.score_b,
    'is_open',m.play_time is not null and m.score_a is null and m.score_b is null
      and now() < (m.date+m.play_time) at time zone 'Europe/Rome',
    'my_prediction',(select jsonb_build_object('outcome',v.outcome,'score_a',v.score_a,'score_b',v.score_b)
      from match_predictions v where v.match_id=m.id and v.user_id=auth.uid()),
    'total',(select count(*) from match_predictions v where v.match_id=m.id),
    'entries',case when m.play_time is not null
        and now()>=(m.date+m.play_time) at time zone 'Europe/Rome' then
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

-- Recupera le partite già consolidate durante il periodo fra punto 2 e punto 3.
-- Quelle ancora da ricalcolare saranno gestite dal job tramite il nuovo wrapper.
do $$
declare previous_match record;
begin
  for previous_match in select distinct s.match_id from wallet_stakes s
    join matches m on m.id=s.match_id
    where m.score_a is not null and m.score_b is not null
      and public.advanced_prediction_ready(m.id)
      and not exists(select 1 from advanced_prediction_dirty_matches d where d.match_id=m.id)
  loop
    perform public.wallet_settle_match(previous_match.match_id);
  end loop;
end $$;
