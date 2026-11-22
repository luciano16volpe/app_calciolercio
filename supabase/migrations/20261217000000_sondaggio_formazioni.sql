-- Opzioni immutabili per 24 ore dalla pubblicazione della partita.
create table public.formation_polls (
  match_id uuid primary key references public.matches(id) on delete cascade,
  opened_at timestamptz not null default now(),
  closes_at timestamptz not null default now()+interval '24 hours',
  created_by uuid references auth.users(id) on delete set null,
  finalized_at timestamptz,
  winning_option smallint,
  check (closes_at>opened_at)
);
create index formation_polls_due_idx on public.formation_polls(closes_at) where finalized_at is null;
create table public.formation_options (
  match_id uuid not null references public.formation_polls(match_id) on delete cascade,
  option_no smallint not null check (option_no between 1 and 10),
  team_a uuid[] not null,
  team_b uuid[] not null,
  metrics jsonb not null,
  stats jsonb not null,
  module_a jsonb,
  module_b jsonb,
  pred_rank smallint not null,
  primary key(match_id,option_no)
);
create table public.formation_votes (
  match_id uuid not null references public.formation_polls(match_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_no smallint not null,
  updated_at timestamptz not null default now(),
  primary key(match_id,user_id),
  foreign key(match_id,option_no) references public.formation_options(match_id,option_no) on delete cascade
);
create index formation_votes_option_idx on public.formation_votes(match_id,option_no);
alter table public.formation_polls enable row level security;
alter table public.formation_options enable row level security;
alter table public.formation_votes enable row level security;
revoke all on public.formation_polls,public.formation_options,public.formation_votes from anon,authenticated;

-- La partita e tutte le opzioni si salvano in una sola transazione.
create function public.create_match_with_formation_poll(p_match jsonb,p_options jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare lid uuid := (p_match->>'league_id')::uuid; mid uuid; item jsonb; first_item jsonb;
  a uuid[]; b uuid[]; roster uuid[]; candidate uuid[]; first_size_a integer; first_size_b integer;
  option_no integer := 0; split_key text; seen text[] := '{}';
begin
  if auth.uid() is null or not public.is_league_admin(lid) then raise exception 'Solo l’amministratore può pubblicare le squadre'; end if;
  if (p_match->>'score_a') is not null or (p_match->>'score_b') is not null then
    raise exception 'Il sondaggio richiede una partita senza risultato'; end if;
  if jsonb_typeof(p_options)<>'array' or jsonb_array_length(p_options) not between 1 and 10 then
    raise exception 'Servono da 1 a 10 formazioni'; end if;
  first_item := p_options->0;
  if jsonb_typeof(first_item->'team_a')<>'array' or jsonb_typeof(first_item->'team_b')<>'array' then
    raise exception 'Squadre non valide'; end if;
  a := array(select value::uuid from jsonb_array_elements_text(first_item->'team_a'));
  b := array(select value::uuid from jsonb_array_elements_text(first_item->'team_b'));
  first_size_a := cardinality(a); first_size_b := cardinality(b);
  roster := array(select id from unnest(a||b) id order by id);
  if cardinality(a)=0 or cardinality(b)=0 or cardinality(roster)<>cardinality(array(select distinct id from unnest(roster) id)) then
    raise exception 'Giocatori duplicati o squadre vuote'; end if;
  mid := public.create_match_with_teams(p_match || jsonb_build_object(
    'pred',((first_item->'metrics'->>'sA')::numeric-(first_item->'metrics'->>'sB')::numeric),
    'pred_rank',coalesce((first_item->>'rank')::smallint,1)),a,b);
  insert into formation_polls(match_id,created_by) values(mid,auth.uid());
  for item in select value from jsonb_array_elements(p_options) loop
    option_no := option_no+1;
    if jsonb_typeof(item->'team_a')<>'array' or jsonb_typeof(item->'team_b')<>'array'
      or jsonb_typeof(item->'metrics')<>'object' or jsonb_typeof(item->'stats')<>'array'
      or jsonb_array_length(item->'stats')<>11 then raise exception 'Formazione non valida'; end if;
    a := array(select value::uuid from jsonb_array_elements_text(item->'team_a'));
    b := array(select value::uuid from jsonb_array_elements_text(item->'team_b'));
    candidate := array(select id from unnest(a||b) id order by id);
    if cardinality(a)<>first_size_a or cardinality(b)<>first_size_b
      or candidate<>roster then raise exception 'Le opzioni devono contenere gli stessi convocati'; end if;
    split_key := (select string_agg(id::text,',' order by id) from unnest(a) id)||'/'||
      (select string_agg(id::text,',' order by id) from unnest(b) id);
    if split_key=any(seen) then raise exception 'Formazione duplicata'; end if;
    seen := array_append(seen,split_key);
    insert into formation_options(match_id,option_no,team_a,team_b,metrics,stats,module_a,module_b,pred_rank)
      values(mid,option_no,a,b,item->'metrics',item->'stats',item->'module_a',item->'module_b',coalesce((item->>'rank')::smallint,option_no::smallint));
  end loop;
  return mid;
end $$;
revoke all on function public.create_match_with_formation_poll(jsonb,jsonb) from public,anon;
grant execute on function public.create_match_with_formation_poll(jsonb,jsonb) to authenticated;

create function public.formation_poll_list(p_league uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if auth.uid() is null or not exists(select 1 from league_members where league_id=p_league and user_id=auth.uid()) then
    raise exception 'Permesso negato'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('match_id',p.match_id,'date',m.date,'closes_at',p.closes_at)
    order by p.closes_at),'[]'::jsonb) into result
    from formation_polls p join matches m on m.id=p.match_id
    where m.league_id=p_league and p.finalized_at is null and p.closes_at>now();
  return result;
end $$;
revoke all on function public.formation_poll_list(uuid) from public,anon;
grant execute on function public.formation_poll_list(uuid) to authenticated;

create function public.formation_poll_state(p_match uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare poll formation_polls%rowtype; lid uuid; options jsonb; mine smallint;
begin
  select * into poll from formation_polls where match_id=p_match;
  if not found or auth.uid() is null then return null; end if;
  select league_id into lid from matches where id=p_match;
  if not exists(select 1 from league_members where league_id=lid and user_id=auth.uid()) then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('option_no',o.option_no,'team_a',o.team_a,'team_b',o.team_b,
    'metrics',o.metrics,'stats',o.stats,'module_a',o.module_a,'module_b',o.module_b,'rank',o.pred_rank)
    order by o.option_no),'[]'::jsonb) into options from formation_options o where o.match_id=p_match;
  select option_no into mine from formation_votes where match_id=p_match and user_id=auth.uid();
  return jsonb_build_object('match_id',p_match,'opened_at',poll.opened_at,'closes_at',poll.closes_at,
    'is_open',poll.finalized_at is null and now()<poll.closes_at,
    'finalized_at',poll.finalized_at,'winning_option',poll.winning_option,
    'has_premium',public.has_premium(auth.uid()),'my_vote',mine,'options',options);
end $$;
revoke all on function public.formation_poll_state(uuid) from public,anon;
grant execute on function public.formation_poll_state(uuid) to authenticated;

create function public.submit_formation_vote(p_match uuid,p_option smallint)
returns void language plpgsql security definer set search_path=public as $$
declare poll formation_polls%rowtype; lid uuid;
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  select * into poll from formation_polls where match_id=p_match for update;
  if not found or poll.finalized_at is not null or now()>=poll.closes_at then raise exception 'Sondaggio chiuso'; end if;
  select league_id into lid from matches where id=p_match;
  if not exists(select 1 from league_members where league_id=lid and user_id=auth.uid()) then raise exception 'Non fai parte della lega'; end if;
  if not public.has_premium(auth.uid()) then raise exception 'Serve Premium attivo'; end if;
  if not exists(select 1 from formation_options where match_id=p_match and option_no=p_option) then raise exception 'Formazione non valida'; end if;
  insert into formation_votes(match_id,user_id,option_no) values(p_match,auth.uid(),p_option)
    on conflict(match_id,user_id) do update set option_no=excluded.option_no,updated_at=now();
end $$;
revoke all on function public.submit_formation_vote(uuid,smallint) from public,anon;
grant execute on function public.submit_formation_vote(uuid,smallint) to authenticated;

-- Durante il sondaggio l'admin può correggere data e luogo, ma non cambiare i convocati
-- o le squadre: le opzioni pubblicate devono rimanere coerenti con la partita.
create function public.guard_formation_poll_teams()
returns trigger language plpgsql security definer set search_path=public as $$
declare mid uuid;
begin
  mid := case when tg_op='DELETE' then old.match_id else new.match_id end;
  if auth.uid() is not null and exists (
    select 1 from formation_polls where match_id=mid and finalized_at is null
  ) and (tg_op<>'UPDATE' or new.player_id is distinct from old.player_id
    or new.team is distinct from old.team or new.position is distinct from old.position) then
    raise exception 'Le squadre sono in votazione: attendi la chiusura prima di modificarle';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger guard_formation_poll_teams before insert or update or delete on public.match_players
  for each row execute function public.guard_formation_poll_teams();

-- Finale atomico e ripetibile. Un pareggio o zero voti conserva l'opzione 1 dell'admin.
create function public.finalize_formation_polls(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path=public as $$
declare item record; top_option smallint; top_count bigint; tied integer; chosen formation_options%rowtype;
  completed integer := 0; previous_uid text;
begin
  previous_uid := current_setting('request.jwt.claim.sub',true);
  perform set_config('request.jwt.claim.sub','',true);
  for item in select p.match_id from formation_polls p where p.finalized_at is null and p.closes_at<=p_now
    order by p.closes_at for update skip locked loop
    select o.option_no,count(v.user_id) into top_option,top_count
      from formation_options o left join formation_votes v on v.match_id=o.match_id and v.option_no=o.option_no
      where o.match_id=item.match_id group by o.option_no order by count(v.user_id) desc,o.option_no limit 1;
    select count(*) into tied from (
      select o.option_no from formation_options o left join formation_votes v on v.match_id=o.match_id and v.option_no=o.option_no
      where o.match_id=item.match_id group by o.option_no having count(v.user_id)=top_count
    ) same_count;
    if top_count=0 or tied<>1 then top_option:=1; end if;
    -- Se la partita è già stata giocata o compilata, le squadre sul campo restano quelle iniziali.
    if exists(select 1 from matches m where m.id=item.match_id and (m.score_a is not null or m.score_b is not null))
      or exists(select 1 from match_players mp where mp.match_id=item.match_id and
        (mp.rating is not null or mp.goals<>0 or mp.assist<>0 or mp.autogol<>0 or mp.meta<>0 or mp.rigori_sbagliati<>0)) then
      top_option:=1;
    end if;
    if top_option<>1 then
      select * into chosen from formation_options where match_id=item.match_id and option_no=top_option;
      update match_players mp set team=assignment.team,position=assignment.position
        from (
          select player_id,'A'::text as team,(n-1)::integer as position from unnest(chosen.team_a) with ordinality t(player_id,n)
          union all
          select player_id,'B'::text,(n-1)::integer from unnest(chosen.team_b) with ordinality t(player_id,n)
        ) assignment
        where mp.match_id=item.match_id and mp.player_id=assignment.player_id;
      update matches set pred=(chosen.metrics->>'sA')::numeric-(chosen.metrics->>'sB')::numeric,
        pred_rank=chosen.pred_rank where id=item.match_id;
    end if;
    update formation_polls set finalized_at=p_now,winning_option=top_option where match_id=item.match_id;
    completed:=completed+1;
  end loop;
  perform set_config('request.jwt.claim.sub',coalesce(previous_uid,''),true);
  return completed;
end $$;
revoke all on function public.finalize_formation_polls(timestamptz) from public,anon,authenticated;
grant execute on function public.finalize_formation_polls(timestamptz) to service_role;

do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('formation-poll-finalize','* * * * *','select public.finalize_formation_polls()');
  else
    raise warning 'pg_cron non attivo: finalizzare manualmente i sondaggi delle formazioni';
  end if;
end $$;
