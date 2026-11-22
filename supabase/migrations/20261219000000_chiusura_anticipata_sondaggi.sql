-- Chiusura anticipata dei due sondaggi (voti ai giocatori e scelta delle formazioni) da parte dell'admin della lega.
-- Alla scadenza (24 ore) o alla chiusura anticipata il risultato si pubblica con la stessa finalizzazione atomica e una volta sola:
-- le notifiche dei passi 2 (medie pubblicate) e 5 (squadre definitive) leggono già `finalized_at`, quindi partono in entrambi i casi,
-- senza duplicati grazie a push_sent. Chi ha chiuso e quando restano salvati e finiscono anche nel registro attività.

alter table public.community_vote_settings
  add column closed_early_at timestamptz,
  add column closed_early_by uuid references auth.users(id) on delete set null;
alter table public.formation_polls
  add column closed_early_at timestamptz,
  add column closed_early_by uuid references auth.users(id) on delete set null;

-- Scadenza effettiva del voto ai giocatori: 24 ore dall'apertura, oppure prima se l'admin chiude.
create function public.community_vote_deadline(p_started timestamptz, p_early timestamptz)
returns timestamptz language sql stable set search_path=public as $$
  select least(p_started+interval '24 hours', coalesce(p_early,'infinity'::timestamptz));
$$;

-- ── Voto ai giocatori: stato, invio, finalizzazione e notifica di apertura usano la scadenza effettiva ──
create or replace function public.community_vote_state(p_match uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare lid uuid; score_a smallint; score_b smallint; started timestamptz; early timestamptz; early_by uuid;
  finished timestamptz; ends timestamptz; my_player uuid; my_votes jsonb; premium_active boolean; admin boolean;
begin
  select m.league_id,m.score_a,m.score_b,c.started_at,c.finalized_at,c.closed_early_at,c.closed_early_by
    into lid,score_a,score_b,started,finished,early,early_by
    from matches m left join community_vote_settings c on c.match_id=m.id where m.id=p_match;
  if lid is null or auth.uid() is null or not exists (
    select 1 from league_members where league_id=lid and user_id=auth.uid()) then return null; end if;
  ends := case when started is null then null else public.community_vote_deadline(started,early) end;
  admin := public.is_league_admin(lid);
  select p.id into my_player from match_players mp join players p on p.id=mp.player_id
    where mp.match_id=p_match and p.user_id=auth.uid() limit 1;
  select coalesce(jsonb_object_agg(target_player_id,rating),'{}'::jsonb) into my_votes
    from community_votes where match_id=p_match and voter_user_id=auth.uid();
  premium_active := public.has_premium(auth.uid());
  return jsonb_build_object(
    'enabled',started is not null,
    'is_open',started is not null and finished is null and now()>=started and now()<ends,
    'finalized',finished is not null,
    'open_until',ends,
    'can_activate',admin and started is null
      and score_a is not null and score_b is not null
      and not exists(select 1 from match_players where match_id=p_match and rating is not null),
    'can_vote',started is not null and finished is null and my_player is not null and premium_active
      and now()>=started and now()<ends,
    'can_close',admin and started is not null and finished is null and now()>=started and now()<ends,
    'closed_early_at',early,
    'closed_early_by_name',case when early_by is null then null else public.audit_user_name(early_by) end,
    'has_premium',premium_active,
    'my_player_id',my_player,
    'my_votes',my_votes);
end $$;

create or replace function public.submit_community_votes(p_match uuid,p_votes jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare started timestamptz; early timestamptz; finished timestamptz; lid uuid; my_player uuid; v record;
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  select c.started_at,c.closed_early_at,c.finalized_at,m.league_id into started,early,finished,lid
    from community_vote_settings c join matches m on m.id=c.match_id where c.match_id=p_match for update of c;
  -- finalized_at: chi aspettava il blocco mentre l'admin chiudeva trova la votazione già chiusa
  if started is null or finished is not null or now()<started or now()>=public.community_vote_deadline(started,early) then
    raise exception 'La votazione è chiusa'; end if;
  if not exists(select 1 from league_members where league_id=lid and user_id=auth.uid()) then
    raise exception 'Non fai parte della lega'; end if;
  if not public.has_premium(auth.uid()) then raise exception 'Per votare serve Premium attivo'; end if;
  select p.id into my_player from match_players mp join players p on p.id=mp.player_id
    where mp.match_id=p_match and p.user_id=auth.uid() limit 1;
  if my_player is null then raise exception 'Solo chi ha giocato può votare'; end if;
  if p_votes is null or jsonb_typeof(p_votes)<>'array' or jsonb_array_length(p_votes)=0 then
    raise exception 'Nessun voto da salvare'; end if;
  if exists(select 1 from jsonb_array_elements(p_votes) x
      group by x->>'player_id' having count(*)>1) then raise exception 'Giocatore duplicato'; end if;
  for v in select (x->>'player_id')::uuid as player_id,(x->>'rating')::numeric as rating
    from jsonb_array_elements(p_votes) x loop
    if v.player_id is null or v.player_id=my_player or not exists (
      select 1 from match_players where match_id=p_match and player_id=v.player_id) then
      raise exception 'Puoi votare solo gli altri partecipanti'; end if;
    if v.rating is null or v.rating<1 or v.rating>10 or v.rating*2<>trunc(v.rating*2) then
      raise exception 'Il voto deve essere tra 1 e 10, a passi di mezzo punto'; end if;
  end loop;
  insert into community_votes(match_id,voter_user_id,target_player_id,rating,updated_at)
    select p_match,auth.uid(),(x->>'player_id')::uuid,(x->>'rating')::numeric,now()
    from jsonb_array_elements(p_votes) x
    on conflict(match_id,voter_user_id,target_player_id) do update
      set rating=excluded.rating,updated_at=excluded.updated_at;
end $$;

-- Stessa regola della media di prima (con almeno 5 voti si scartano minimo e massimo); cambia solo la condizione di scadenza.
create or replace function public.finalize_community_votes(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path=public as $$
declare item record; completed integer := 0; previous_uid text;
begin
  previous_uid := current_setting('request.jwt.claim.sub',true);
  perform set_config('request.jwt.claim.sub','',true);
  for item in select c.match_id from community_vote_settings c
    where c.finalized_at is null and public.community_vote_deadline(c.started_at,c.closed_early_at)<=p_now
    order by c.started_at for update skip locked loop
    update match_players mp set rating=(
      select round(avg(ballot.rating),1)
        from (
          select cv.rating,
            count(*) over () as votes_received,
            row_number() over (order by cv.rating,cv.voter_user_id) as lowest_rank,
            row_number() over (order by cv.rating desc,cv.voter_user_id desc) as highest_rank
          from community_votes cv
          where cv.match_id=item.match_id and cv.target_player_id=mp.player_id
        ) ballot
        where ballot.votes_received<5 or (ballot.lowest_rank>1 and ballot.highest_rank>1)
    ) where mp.match_id=item.match_id;
    update community_vote_settings set finalized_at=p_now where match_id=item.match_id;
    completed := completed+1;
  end loop;
  perform set_config('request.jwt.claim.sub',coalesce(previous_uid,''),true);
  return completed;
end $$;

-- Dopo la chiusura anticipata non deve partire l'avviso «votazione aperta».
create or replace function public.push_community_vote_due_at(p_now timestamptz)
returns table(kind text,user_id uuid,match_id uuid,league_name text,league_slug text,match_date date,play_time time,place text,
  team text,score_a smallint,score_b smallint,endpoint text,p256dh text,auth text)
language sql stable security definer set search_path=public as $$
  select distinct on (p.user_id,m.id,s.endpoint)
    'community_vote_open'::text,p.user_id,m.id,l.name,l.slug,m.date,m.play_time,m.place,
    mp.team,m.score_a,m.score_b,s.endpoint,s.p256dh,s.auth
  from community_vote_settings v
    join matches m on m.id=v.match_id
    join leagues l on l.id=m.league_id
    join match_players mp on mp.match_id=m.id
    join players p on p.id=mp.player_id and p.user_id is not null
    join league_members lm on lm.league_id=m.league_id and lm.user_id=p.user_id
    join push_subscriptions s on s.user_id=p.user_id
    left join push_prefs pf on pf.user_id=p.user_id
  where v.finalized_at is null and p_now>=v.started_at and p_now<public.community_vote_deadline(v.started_at,v.closed_early_at)
    and coalesce(pf.enabled,true) and coalesce(pf.ratings,true)
    and not exists(select 1 from push_sent sent where sent.kind='community_vote_open'
      and sent.match_id=m.id and sent.user_id=p.user_id)
  order by p.user_id,m.id,s.endpoint,mp.position;
$$;

-- Chiusura anticipata del voto ai giocatori: solo l'admin della lega; chiude e pubblica le medie nella stessa transazione.
-- Un secondo tocco o una chiusura simultanea trovano la votazione già finalizzata e non fanno nulla.
create function public.close_community_voting(p_match uuid)
returns void language plpgsql security definer set search_path=public as $$
declare lid uuid; c community_vote_settings%rowtype; moment timestamptz := clock_timestamp();
begin
  select league_id into lid from matches where id=p_match;
  if lid is null or auth.uid() is null or not public.is_league_admin(lid) then
    raise exception 'Permesso negato: solo l’amministratore chiude la votazione'; end if;
  select * into c from community_vote_settings where match_id=p_match for update;
  if not found then raise exception 'La votazione non è attiva'; end if;
  if c.finalized_at is not null then return; end if;
  if public.community_vote_deadline(c.started_at,c.closed_early_at)>moment then
    update community_vote_settings set closed_early_at=moment,closed_early_by=auth.uid() where match_id=p_match;
    perform public.audit_event('community_votes.close_early','matches',p_match::text,lid,public.audit_match_label(p_match),'partite',null,auth.uid());
  end if;
  perform public.finalize_community_votes(moment);
end $$;
revoke all on function public.close_community_voting(uuid) from public,anon;
grant execute on function public.close_community_voting(uuid) to authenticated;

-- ── Scelta delle formazioni ──
create or replace function public.formation_poll_state(p_match uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare poll formation_polls%rowtype; lid uuid; options jsonb; mine smallint; admin boolean;
begin
  select * into poll from formation_polls where match_id=p_match;
  if not found or auth.uid() is null then return null; end if;
  select league_id into lid from matches where id=p_match;
  if not exists(select 1 from league_members where league_id=lid and user_id=auth.uid()) then return null; end if;
  admin := public.is_league_admin(lid);
  select coalesce(jsonb_agg(jsonb_build_object('option_no',o.option_no,'team_a',o.team_a,'team_b',o.team_b,
    'metrics',o.metrics,'stats',o.stats,'module_a',o.module_a,'module_b',o.module_b,'rank',o.pred_rank)
    order by o.option_no),'[]'::jsonb) into options from formation_options o where o.match_id=p_match;
  select option_no into mine from formation_votes where match_id=p_match and user_id=auth.uid();
  return jsonb_build_object('match_id',p_match,'opened_at',poll.opened_at,'closes_at',poll.closes_at,
    'is_open',poll.finalized_at is null and now()<poll.closes_at,
    'can_close',admin and poll.finalized_at is null and now()<poll.closes_at,
    'closed_early_at',poll.closed_early_at,
    'closed_early_by_name',case when poll.closed_early_by is null then null else public.audit_user_name(poll.closed_early_by) end,
    'finalized_at',poll.finalized_at,'winning_option',poll.winning_option,
    'has_premium',public.has_premium(auth.uid()),'my_vote',mine,'options',options);
end $$;

-- Chiusura anticipata della scelta formazioni: salva subito la formazione vincente (pareggio o zero voti: quella dell'admin).
create function public.close_formation_poll(p_match uuid)
returns void language plpgsql security definer set search_path=public as $$
declare lid uuid; poll formation_polls%rowtype; moment timestamptz;
begin
  select league_id into lid from matches where id=p_match;
  if lid is null or auth.uid() is null or not public.is_league_admin(lid) then
    raise exception 'Permesso negato: solo l’amministratore chiude il sondaggio'; end if;
  select * into poll from formation_polls where match_id=p_match for update;
  if not found then raise exception 'Sondaggio non trovato'; end if;
  if poll.finalized_at is not null then return; end if;
  -- la scadenza deve restare dopo l'apertura (vincolo della tabella)
  moment := greatest(clock_timestamp(),poll.opened_at+interval '1 millisecond');
  if poll.closes_at>moment then
    update formation_polls set closes_at=moment,closed_early_at=moment,closed_early_by=auth.uid() where match_id=p_match;
    perform public.audit_event('formation_polls.close_early','matches',p_match::text,lid,public.audit_match_label(p_match),'partite',null,auth.uid());
  end if;
  perform public.finalize_formation_polls(moment);
end $$;
revoke all on function public.close_formation_poll(uuid) from public,anon;
grant execute on function public.close_formation_poll(uuid) to authenticated;
