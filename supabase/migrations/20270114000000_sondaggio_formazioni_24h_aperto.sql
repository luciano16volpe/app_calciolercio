-- Sondaggio formazioni: tutti i membri votano, l'admin può riaprire,
-- e un pareggio premia l'opzione col rango di precisione migliore.
alter table public.formation_polls
  add column reopened_at timestamptz,
  add column reopened_by uuid references auth.users(id) on delete set null;

create or replace function public.submit_formation_vote(p_match uuid,p_option smallint)
returns void language plpgsql security definer set search_path=public as $$
declare poll formation_polls%rowtype; lid uuid;
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  select * into poll from formation_polls where match_id=p_match for update;
  if not found or poll.finalized_at is not null or now()>=poll.closes_at then raise exception 'Sondaggio chiuso'; end if;
  select league_id into lid from matches where id=p_match;
  if not exists(select 1 from league_members where league_id=lid and user_id=auth.uid()) then
    raise exception 'Non fai parte della lega'; end if;
  if not exists(select 1 from formation_options where match_id=p_match and option_no=p_option) then
    raise exception 'Formazione non valida'; end if;
  insert into formation_votes(match_id,user_id,option_no) values(p_match,auth.uid(),p_option)
    on conflict(match_id,user_id) do update set option_no=excluded.option_no,updated_at=now();
end $$;

create or replace function public.formation_poll_state(p_match uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare poll formation_polls%rowtype; m matches%rowtype; options jsonb; mine smallint;
  admin boolean; may_reopen boolean;
begin
  select * into poll from formation_polls where match_id=p_match;
  if not found or auth.uid() is null then return null; end if;
  select * into m from matches where id=p_match;
  if not exists(select 1 from league_members where league_id=m.league_id and user_id=auth.uid()) then return null; end if;
  admin := public.is_league_admin(m.league_id);
  may_reopen := admin and (poll.finalized_at is not null or now()>=poll.closes_at)
    and m.score_a is null and m.score_b is null
    and (m.play_time is null or now()<(m.date+m.play_time) at time zone 'Europe/Rome')
    and not exists(select 1 from match_players mp where mp.match_id=p_match
      and (mp.rating is not null or mp.goals<>0 or mp.assist<>0 or mp.autogol<>0
        or mp.meta<>0 or mp.rigori_sbagliati<>0));
  select coalesce(jsonb_agg(jsonb_build_object('option_no',o.option_no,'team_a',o.team_a,'team_b',o.team_b,
    'metrics',o.metrics,'stats',o.stats,'module_a',o.module_a,'module_b',o.module_b,'rank',o.pred_rank)
    order by o.option_no),'[]'::jsonb) into options from formation_options o where o.match_id=p_match;
  select option_no into mine from formation_votes where match_id=p_match and user_id=auth.uid();
  return jsonb_build_object('match_id',p_match,'opened_at',poll.opened_at,'closes_at',poll.closes_at,
    'is_open',poll.finalized_at is null and now()<poll.closes_at,
    'is_admin',admin,'can_close',admin and poll.finalized_at is null and now()<poll.closes_at,
    'can_reopen',may_reopen,'voter_count',(select count(*) from formation_votes where match_id=p_match),
    'closed_early_at',poll.closed_early_at,
    'closed_early_by_name',case when poll.closed_early_by is null then null else public.audit_user_name(poll.closed_early_by) end,
    'finalized_at',poll.finalized_at,'winning_option',poll.winning_option,
    'my_vote',mine,'options',options);
end $$;

-- Durante il voto tutti vedono il numero di votanti; i nomi e le scelte
-- diventano pubblici dopo la finalizzazione. L'admin può leggerli anche prima.
create or replace function public.formation_poll_votes(p_match uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare lid uuid; finished timestamptz; result jsonb;
begin
  select m.league_id,p.finalized_at into lid,finished from formation_polls p
    join matches m on m.id=p.match_id where p.match_id=p_match;
  if lid is null or auth.uid() is null or not exists(select 1 from league_members
      where league_id=lid and user_id=auth.uid()) then raise exception 'Permesso negato'; end if;
  if finished is null and not public.is_league_admin(lid) then
    return jsonb_build_object('total',(select count(*) from formation_votes where match_id=p_match),
      'options','[]'::jsonb);
  end if;
  select jsonb_build_object(
    'total',(select count(*) from formation_votes v where v.match_id=p_match),
    'options',coalesce((select jsonb_agg(jsonb_build_object('option_no',o.option_no,
      'voters',coalesce((select jsonb_agg(jsonb_build_object('user_id',v.user_id,
        'name',coalesce(nullif(p.display_name,''),u.email::text,'Account'),
        'updated_at',v.updated_at)
        order by coalesce(nullif(p.display_name,''),u.email::text,'Account'),v.user_id)
        from formation_votes v join auth.users u on u.id=v.user_id
        left join profiles p on p.id=v.user_id
        where v.match_id=p_match and v.option_no=o.option_no),'[]'::jsonb))
      order by o.option_no) from formation_options o where o.match_id=p_match),'[]'::jsonb)
  ) into result;
  return result;
end $$;

-- La chiusura automatica e anticipata usano lo stesso criterio.
-- In ogni parità, compreso zero voti, vince il pred_rank più basso.
create or replace function public.finalize_formation_polls(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path=public as $$
declare item record; top_option smallint; chosen formation_options%rowtype;
  completed integer := 0; previous_uid text;
begin
  previous_uid := current_setting('request.jwt.claim.sub',true);
  perform set_config('request.jwt.claim.sub','',true);
  for item in select p.match_id from formation_polls p where p.finalized_at is null and p.closes_at<=p_now
    order by p.closes_at for update skip locked loop
    select o.option_no into top_option from formation_options o
      left join formation_votes v on v.match_id=o.match_id and v.option_no=o.option_no
      where o.match_id=item.match_id group by o.option_no,o.pred_rank
      order by count(v.user_id) desc,o.pred_rank asc,o.option_no asc limit 1;
    -- Una partita già compilata conserva le squadre sul campo.
    if exists(select 1 from matches m where m.id=item.match_id and (m.score_a is not null or m.score_b is not null))
      or exists(select 1 from match_players mp where mp.match_id=item.match_id and
        (mp.rating is not null or mp.goals<>0 or mp.assist<>0 or mp.autogol<>0 or mp.meta<>0 or mp.rigori_sbagliati<>0)) then
      top_option:=1;
    else
      select * into chosen from formation_options where match_id=item.match_id and option_no=top_option;
      update match_players mp set team=assignment.team,position=assignment.position
        from (select player_id,'A'::text as team,(n-1)::integer as position
          from unnest(chosen.team_a) with ordinality t(player_id,n)
          union all
          select player_id,'B'::text,(n-1)::integer from unnest(chosen.team_b) with ordinality t(player_id,n)
        ) assignment where mp.match_id=item.match_id and mp.player_id=assignment.player_id;
      update matches set pred=(chosen.metrics->>'sA')::numeric-(chosen.metrics->>'sB')::numeric,
        pred_rank=chosen.pred_rank where id=item.match_id;
    end if;
    update formation_polls set finalized_at=p_now,winning_option=top_option where match_id=item.match_id;
    completed:=completed+1;
  end loop;
  perform set_config('request.jwt.claim.sub',coalesce(previous_uid,''),true);
  return completed;
end $$;

create function public.reopen_formation_poll(p_match uuid)
returns void language plpgsql security definer set search_path=public as $$
declare m matches%rowtype; poll formation_polls%rowtype; moment timestamptz; deadline timestamptz;
begin
  select * into m from matches where id=p_match for update;
  if not found or auth.uid() is null or not public.is_league_admin(m.league_id) then
    raise exception 'Permesso negato: solo l’amministratore riapre il sondaggio'; end if;
  select * into poll from formation_polls where match_id=p_match for update;
  if not found then raise exception 'Sondaggio non trovato'; end if;
  moment:=clock_timestamp();
  if poll.finalized_at is null and moment<poll.closes_at then raise exception 'Sondaggio già aperto'; end if;
  if m.score_a is not null or m.score_b is not null or
    (m.play_time is not null and moment>=(m.date+m.play_time) at time zone 'Europe/Rome')
    or exists(select 1 from match_players mp where mp.match_id=p_match and
      (mp.rating is not null or mp.goals<>0 or mp.assist<>0 or mp.autogol<>0
        or mp.meta<>0 or mp.rigori_sbagliati<>0)) then
    raise exception 'Partita già iniziata o compilata: non si può riaprire'; end if;
  deadline:=moment+interval '24 hours';
  if m.play_time is not null then
    deadline:=least(deadline,(m.date+m.play_time) at time zone 'Europe/Rome');
  end if;
  update formation_polls set closes_at=deadline,finalized_at=null,winning_option=null,
    closed_early_at=null,closed_early_by=null,reopened_at=moment,reopened_by=auth.uid()
    where match_id=p_match;
  perform public.audit_event('formation_polls.reopen','matches',p_match::text,m.league_id,
    public.audit_match_label(p_match),'partite',null,auth.uid());
end $$;
revoke all on function public.reopen_formation_poll(uuid) from public,anon;
grant execute on function public.reopen_formation_poll(uuid) to authenticated;
