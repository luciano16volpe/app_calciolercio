begin;
lock table supabase_migrations.schema_migrations in share row exclusive mode;
do $check$ begin
  assert (select max(version)='20261203000000' from supabase_migrations.schema_migrations), 'Storico migrazioni inatteso';
end $check$;
create temporary table saved_push_preferences on commit drop as select user_id,reminder,result,ratings,gazzetta from public.push_prefs;
-- Notifiche di base per tutti; tipi e anticipo personalizzabili con Premium.
-- Le disattivazioni esistenti restano valide anche alla scadenza di Premium.
alter table public.push_prefs
  add column enabled boolean not null default true,
  add column change boolean not null default true,
  add column reminder_minutes integer check (reminder_minutes in (60,120,180,1440));
revoke insert,update,delete on public.push_prefs from anon,authenticated;

drop function public.my_push_prefs();
create function public.my_push_prefs()
returns table(reminder boolean,result boolean,ratings boolean,gazzetta boolean,
  enabled boolean,change boolean,reminder_minutes integer,customizable boolean)
language sql stable security definer set search_path=public as $$
  select coalesce(p.reminder,true),coalesce(p.result,true),coalesce(p.ratings,true),coalesce(p.gazzetta,true),
    coalesce(p.enabled,true),coalesce(p.change,true),p.reminder_minutes,public.has_premium(auth.uid())
  from (select 1) x left join push_prefs p on p.user_id=auth.uid();
$$;
revoke all on function public.my_push_prefs() from public,anon;
grant execute on function public.my_push_prefs() to authenticated;

create function public.set_push_enabled(p_on boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  if p_on is null then raise exception 'Preferenza non valida'; end if;
  insert into push_prefs(user_id,enabled) values(auth.uid(),p_on)
    on conflict(user_id) do update set enabled=excluded.enabled;
end $$;
revoke all on function public.set_push_enabled(boolean) from public,anon;
grant execute on function public.set_push_enabled(boolean) to authenticated;

create or replace function public.set_push_pref(p_kind text,p_on boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  if not public.has_premium(auth.uid()) then raise exception 'La personalizzazione delle notifiche richiede Premium'; end if;
  if p_kind is null or p_kind not in ('reminder','result','ratings','gazzetta','change') or p_on is null then
    raise exception 'Preferenza non valida';
  end if;
  insert into push_prefs(user_id) values(auth.uid()) on conflict(user_id) do nothing;
  update push_prefs set
    reminder=case when p_kind='reminder' then p_on else reminder end,
    result=case when p_kind='result' then p_on else result end,
    ratings=case when p_kind='ratings' then p_on else ratings end,
    gazzetta=case when p_kind='gazzetta' then p_on else gazzetta end,
    change=case when p_kind='change' then p_on else change end where user_id=auth.uid();
end $$;

create function public.set_push_reminder(p_minutes integer)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  if not public.has_premium(auth.uid()) then raise exception 'La personalizzazione delle notifiche richiede Premium'; end if;
  if p_minutes is not null and p_minutes not in (60,120,180,1440) then raise exception 'Anticipo non valido'; end if;
  insert into push_prefs(user_id,reminder_minutes) values(auth.uid(),p_minutes)
    on conflict(user_id) do update set reminder_minutes=excluded.reminder_minutes;
end $$;
revoke all on function public.set_push_reminder(integer) from public,anon;
grant execute on function public.set_push_reminder(integer) to authenticated;

-- Foto del programma e ultima modifica in attesa per persona/partita.
-- Trigger differiti: un salvataggio con DELETE/INSERT dei convocati genera un solo confronto finale.
create table public.push_program_state (
  match_id uuid primary key references matches(id) on delete cascade,
  snapshot jsonb not null
);
create table public.push_program_changes (
  match_id uuid references matches(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  revision uuid not null default gen_random_uuid(),
  changed_at timestamptz not null default now(),
  before_state jsonb not null,
  primary key(match_id,user_id)
);
create index push_program_changes_due on public.push_program_changes(changed_at);
alter table public.push_program_state enable row level security;
alter table public.push_program_changes enable row level security;
revoke all on public.push_program_state,public.push_program_changes from anon,authenticated;

create function public.push_program_snapshot(p_match uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('date',m.date,'time',m.play_time,'place',coalesce(m.place,''),
    'A',coalesce(jsonb_agg(mp.player_id order by mp.player_id) filter(where mp.team='A'),'[]'),
    'B',coalesce(jsonb_agg(mp.player_id order by mp.player_id) filter(where mp.team='B'),'[]'))
  from matches m left join match_players mp on mp.match_id=m.id where m.id=p_match group by m.id;
$$;
revoke all on function public.push_program_snapshot(uuid) from public,anon,authenticated;
insert into public.push_program_state select id,public.push_program_snapshot(id) from public.matches;

create function public.stamp_program_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare mid uuid; previous jsonb; current_state jsonb; m public.matches%rowtype;
begin
  if tg_table_name='matches' then mid:=new.id;
  elsif tg_op='DELETE' then mid:=old.match_id; else mid:=new.match_id; end if;
  select * into m from matches where id=mid for update;
  if not found then return null; end if;
  current_state:=public.push_program_snapshot(mid);
  select snapshot into previous from push_program_state where match_id=mid;
  insert into push_program_state values(mid,current_state) on conflict(match_id) do update set snapshot=excluded.snapshot;
  if previous is null or previous=current_state or m.score_a is not null or m.score_b is not null
    or coalesce((select src from public.audit_ctx()),'app')='import'
    or (m.date+coalesce(m.play_time,'23:59'::time)) at time zone 'Europe/Rome' <= now() then return null; end if;
  insert into push_program_changes(match_id,user_id,before_state)
    select distinct mid,p.user_id,previous from players p
      join league_members lm on lm.user_id=p.user_id and lm.league_id=m.league_id
    where p.id::text in (select jsonb_array_elements_text(previous->'A') union select jsonb_array_elements_text(previous->'B')
      union select jsonb_array_elements_text(current_state->'A') union select jsonb_array_elements_text(current_state->'B'))
    on conflict(match_id,user_id) do update set
      before_state=case when exists(select 1 from push_sent s where s.kind='change:'||push_program_changes.revision::text
        and s.match_id=mid and s.user_id=push_program_changes.user_id) then excluded.before_state else push_program_changes.before_state end,
      revision=gen_random_uuid(),changed_at=now();
  -- Un ritorno al programma iniziale prima dell'invio non deve notificare nulla.
  delete from push_program_changes where match_id=mid and before_state=current_state;
  return null;
end $$;
revoke all on function public.stamp_program_change() from public,anon,authenticated;
create constraint trigger push_program_match after insert or update on public.matches
  deferrable initially deferred for each row execute function public.stamp_program_change();
create constraint trigger push_program_players after insert or update or delete on public.match_players
  deferrable initially deferred for each row execute function public.stamp_program_change();

-- Un orologio esplicito rende verificabili anticipo, mezzanotte e ora legale.
create function public.push_due_at(p_now timestamptz,p_today date default null)
returns table(kind text,user_id uuid,match_id uuid,league_name text,league_slug text,match_date date,play_time time,place text,
  team text,score_a smallint,score_b smallint,endpoint text,p256dh text,auth text)
language sql stable security definer set search_path=public as $$
  with base as (
    select m.id as match_id,l.name as league_name,l.slug as league_slug,m.date as match_date,m.play_time,m.place,
      mp.team,m.score_a,m.score_b,pl.user_id,
      (m.date+coalesce(m.play_time,'23:59'::time)) at time zone 'Europe/Rome' as kickoff,
      case when public.has_premium(pl.user_id) and pf.reminder_minutes is not null and m.play_time is not null
        then (m.date+m.play_time) at time zone 'Europe/Rome' - make_interval(mins=>pf.reminder_minutes)
        else (m.date+'07:00'::time) at time zone 'Europe/Rome' end as reminder_at
    from matches m join leagues l on l.id=m.league_id join match_players mp on mp.match_id=m.id
      join players pl on pl.id=mp.player_id and pl.user_id is not null
      join league_members lm on lm.league_id=l.id and lm.user_id=pl.user_id
      left join push_prefs pf on pf.user_id=pl.user_id
  ), ev as (
    select 'reminder'::text as kind,b.match_id,b.league_name,b.league_slug,b.match_date,b.play_time,b.place,b.team,b.score_a,b.score_b,b.user_id
      from base b where b.score_a is null and b.score_b is null and p_now>=b.reminder_at and p_now<b.kickoff
        and b.match_date>=coalesce(p_today,(p_now at time zone 'Europe/Rome')::date)
    union all
    select 'result',b.match_id,b.league_name,b.league_slug,b.match_date,b.play_time,b.place,b.team,b.score_a,b.score_b,b.user_id
      from base b join match_stamps s on s.match_id=b.match_id where b.score_a is not null and b.score_b is not null
        and b.match_date>=coalesce(p_today,(p_now at time zone 'Europe/Rome')::date)-3
        and s.result_at between p_now-interval '1 day' and p_now-interval '1 minute'
    union all
    select 'ratings',b.match_id,b.league_name,b.league_slug,b.match_date,b.play_time,b.place,b.team,b.score_a,b.score_b,b.user_id
      from base b join match_stamps s on s.match_id=b.match_id
      where b.match_date>=coalesce(p_today,(p_now at time zone 'Europe/Rome')::date)-3
        and s.ratings_text_at between p_now-interval '1 day' and p_now-interval '2 minutes'
        and exists(select 1 from match_players r where r.match_id=b.match_id and r.rating is not null)
        and not exists(select 1 from match_players r where r.match_id=b.match_id and r.rating is not null
          and coalesce(btrim(r.titolo),'')='' and coalesce(btrim(r.descrizione),'')='')
    union all
    select 'gazzetta',b.match_id,b.league_name,b.league_slug,b.match_date,b.play_time,b.place,b.team,b.score_a,b.score_b,b.user_id
      from base b join gazzette g on g.match_id=b.match_id where public.has_premium(b.user_id)
        and b.match_date>=coalesce(p_today,(p_now at time zone 'Europe/Rome')::date)-3
        and g.uploaded_at between p_now-interval '1 day' and p_now-interval '30 seconds'
    union all
    select 'change:'||c.revision::text,m.id,l.name,l.slug,m.date,m.play_time,m.place,
      coalesce((select mp.team from match_players mp join players p on p.id=mp.player_id
        where mp.match_id=m.id and p.user_id=c.user_id limit 1),'out'),m.score_a,m.score_b,c.user_id
      from push_program_changes c join matches m on m.id=c.match_id join leagues l on l.id=m.league_id
        join league_members lm on lm.league_id=l.id and lm.user_id=c.user_id
      where c.changed_at between p_now-interval '1 day' and p_now-interval '1 minute'
        and m.score_a is null and m.score_b is null
        and (m.date+coalesce(m.play_time,'23:59'::time)) at time zone 'Europe/Rome'>p_now
  )
  select ev.kind,ev.user_id,ev.match_id,ev.league_name,ev.league_slug,ev.match_date,ev.play_time,ev.place,ev.team,ev.score_a,ev.score_b,
    s.endpoint,s.p256dh,s.auth from ev join push_subscriptions s on s.user_id=ev.user_id left join push_prefs pf on pf.user_id=ev.user_id
  where coalesce(pf.enabled,true) and coalesce(case split_part(ev.kind,':',1)
    when 'reminder' then pf.reminder when 'result' then pf.result when 'ratings' then pf.ratings
    when 'gazzetta' then pf.gazzetta when 'change' then pf.change end,true)
    and not exists(select 1 from push_sent sent where sent.kind=ev.kind and sent.match_id=ev.match_id and sent.user_id=ev.user_id);
$$;
revoke all on function public.push_due_at(timestamptz,date) from public,anon,authenticated;
grant execute on function public.push_due_at(timestamptz,date) to service_role;

create or replace function public.push_due(p_today date default (now() at time zone 'Europe/Rome')::date)
returns table(kind text,user_id uuid,match_id uuid,league_name text,league_slug text,match_date date,play_time time,place text,
  team text,score_a smallint,score_b smallint,endpoint text,p256dh text,auth text)
language sql stable security definer set search_path=public as $$ select * from public.push_due_at(now(),p_today); $$;

-- Il controllo ogni minuto serve anche agli anticipi Premium e recupera i ritardi del job.
create or replace function public.push_reminder_run()
returns void language plpgsql security definer set search_path=public,extensions as $$
declare secret text;
begin
  if not exists(select 1 from public.push_due() where kind='reminder') then return; end if;
  select value into secret from private_config where key='cron_secret';
  if secret is null then raise warning 'push_reminder_run: segreto non impostato'; return; end if;
  perform net.http_post(url:='https://ivrwqpuikbnvnxgvgegd.supabase.co/functions/v1/push',
    headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',secret),
    body:='{"job":"reminders"}'::jsonb,timeout_milliseconds:=20000);
end $$;
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='push-reminders';
    perform cron.schedule('push-reminders','* * * * *','select public.push_reminder_run()');
  end if;
end $$;

do $check$ begin
  assert not exists(select * from saved_push_preferences except select user_id,reminder,result,ratings,gazzetta from public.push_prefs), 'Preferenze preesistenti alterate';
  assert (select count(*) from saved_push_preferences)=(select count(*) from public.push_prefs), 'Numero preferenze alterato';
end $check$;
insert into supabase_migrations.schema_migrations(version,name,statements)
values ('20261204000000','notifiche_standard_premium',array[$migration$
-- Notifiche di base per tutti; tipi e anticipo personalizzabili con Premium.
-- Le disattivazioni esistenti restano valide anche alla scadenza di Premium.
alter table public.push_prefs
  add column enabled boolean not null default true,
  add column change boolean not null default true,
  add column reminder_minutes integer check (reminder_minutes in (60,120,180,1440));
revoke insert,update,delete on public.push_prefs from anon,authenticated;

drop function public.my_push_prefs();
create function public.my_push_prefs()
returns table(reminder boolean,result boolean,ratings boolean,gazzetta boolean,
  enabled boolean,change boolean,reminder_minutes integer,customizable boolean)
language sql stable security definer set search_path=public as $$
  select coalesce(p.reminder,true),coalesce(p.result,true),coalesce(p.ratings,true),coalesce(p.gazzetta,true),
    coalesce(p.enabled,true),coalesce(p.change,true),p.reminder_minutes,public.has_premium(auth.uid())
  from (select 1) x left join push_prefs p on p.user_id=auth.uid();
$$;
revoke all on function public.my_push_prefs() from public,anon;
grant execute on function public.my_push_prefs() to authenticated;

create function public.set_push_enabled(p_on boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  if p_on is null then raise exception 'Preferenza non valida'; end if;
  insert into push_prefs(user_id,enabled) values(auth.uid(),p_on)
    on conflict(user_id) do update set enabled=excluded.enabled;
end $$;
revoke all on function public.set_push_enabled(boolean) from public,anon;
grant execute on function public.set_push_enabled(boolean) to authenticated;

create or replace function public.set_push_pref(p_kind text,p_on boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  if not public.has_premium(auth.uid()) then raise exception 'La personalizzazione delle notifiche richiede Premium'; end if;
  if p_kind is null or p_kind not in ('reminder','result','ratings','gazzetta','change') or p_on is null then
    raise exception 'Preferenza non valida';
  end if;
  insert into push_prefs(user_id) values(auth.uid()) on conflict(user_id) do nothing;
  update push_prefs set
    reminder=case when p_kind='reminder' then p_on else reminder end,
    result=case when p_kind='result' then p_on else result end,
    ratings=case when p_kind='ratings' then p_on else ratings end,
    gazzetta=case when p_kind='gazzetta' then p_on else gazzetta end,
    change=case when p_kind='change' then p_on else change end where user_id=auth.uid();
end $$;

create function public.set_push_reminder(p_minutes integer)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  if not public.has_premium(auth.uid()) then raise exception 'La personalizzazione delle notifiche richiede Premium'; end if;
  if p_minutes is not null and p_minutes not in (60,120,180,1440) then raise exception 'Anticipo non valido'; end if;
  insert into push_prefs(user_id,reminder_minutes) values(auth.uid(),p_minutes)
    on conflict(user_id) do update set reminder_minutes=excluded.reminder_minutes;
end $$;
revoke all on function public.set_push_reminder(integer) from public,anon;
grant execute on function public.set_push_reminder(integer) to authenticated;

-- Foto del programma e ultima modifica in attesa per persona/partita.
-- Trigger differiti: un salvataggio con DELETE/INSERT dei convocati genera un solo confronto finale.
create table public.push_program_state (
  match_id uuid primary key references matches(id) on delete cascade,
  snapshot jsonb not null
);
create table public.push_program_changes (
  match_id uuid references matches(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  revision uuid not null default gen_random_uuid(),
  changed_at timestamptz not null default now(),
  before_state jsonb not null,
  primary key(match_id,user_id)
);
create index push_program_changes_due on public.push_program_changes(changed_at);
alter table public.push_program_state enable row level security;
alter table public.push_program_changes enable row level security;
revoke all on public.push_program_state,public.push_program_changes from anon,authenticated;

create function public.push_program_snapshot(p_match uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('date',m.date,'time',m.play_time,'place',coalesce(m.place,''),
    'A',coalesce(jsonb_agg(mp.player_id order by mp.player_id) filter(where mp.team='A'),'[]'),
    'B',coalesce(jsonb_agg(mp.player_id order by mp.player_id) filter(where mp.team='B'),'[]'))
  from matches m left join match_players mp on mp.match_id=m.id where m.id=p_match group by m.id;
$$;
revoke all on function public.push_program_snapshot(uuid) from public,anon,authenticated;
insert into public.push_program_state select id,public.push_program_snapshot(id) from public.matches;

create function public.stamp_program_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare mid uuid; previous jsonb; current_state jsonb; m public.matches%rowtype;
begin
  if tg_table_name='matches' then mid:=new.id;
  elsif tg_op='DELETE' then mid:=old.match_id; else mid:=new.match_id; end if;
  select * into m from matches where id=mid for update;
  if not found then return null; end if;
  current_state:=public.push_program_snapshot(mid);
  select snapshot into previous from push_program_state where match_id=mid;
  insert into push_program_state values(mid,current_state) on conflict(match_id) do update set snapshot=excluded.snapshot;
  if previous is null or previous=current_state or m.score_a is not null or m.score_b is not null
    or coalesce((select src from public.audit_ctx()),'app')='import'
    or (m.date+coalesce(m.play_time,'23:59'::time)) at time zone 'Europe/Rome' <= now() then return null; end if;
  insert into push_program_changes(match_id,user_id,before_state)
    select distinct mid,p.user_id,previous from players p
      join league_members lm on lm.user_id=p.user_id and lm.league_id=m.league_id
    where p.id::text in (select jsonb_array_elements_text(previous->'A') union select jsonb_array_elements_text(previous->'B')
      union select jsonb_array_elements_text(current_state->'A') union select jsonb_array_elements_text(current_state->'B'))
    on conflict(match_id,user_id) do update set
      before_state=case when exists(select 1 from push_sent s where s.kind='change:'||push_program_changes.revision::text
        and s.match_id=mid and s.user_id=push_program_changes.user_id) then excluded.before_state else push_program_changes.before_state end,
      revision=gen_random_uuid(),changed_at=now();
  -- Un ritorno al programma iniziale prima dell'invio non deve notificare nulla.
  delete from push_program_changes where match_id=mid and before_state=current_state;
  return null;
end $$;
revoke all on function public.stamp_program_change() from public,anon,authenticated;
create constraint trigger push_program_match after insert or update on public.matches
  deferrable initially deferred for each row execute function public.stamp_program_change();
create constraint trigger push_program_players after insert or update or delete on public.match_players
  deferrable initially deferred for each row execute function public.stamp_program_change();

-- Un orologio esplicito rende verificabili anticipo, mezzanotte e ora legale.
create function public.push_due_at(p_now timestamptz,p_today date default null)
returns table(kind text,user_id uuid,match_id uuid,league_name text,league_slug text,match_date date,play_time time,place text,
  team text,score_a smallint,score_b smallint,endpoint text,p256dh text,auth text)
language sql stable security definer set search_path=public as $$
  with base as (
    select m.id as match_id,l.name as league_name,l.slug as league_slug,m.date as match_date,m.play_time,m.place,
      mp.team,m.score_a,m.score_b,pl.user_id,
      (m.date+coalesce(m.play_time,'23:59'::time)) at time zone 'Europe/Rome' as kickoff,
      case when public.has_premium(pl.user_id) and pf.reminder_minutes is not null and m.play_time is not null
        then (m.date+m.play_time) at time zone 'Europe/Rome' - make_interval(mins=>pf.reminder_minutes)
        else (m.date+'07:00'::time) at time zone 'Europe/Rome' end as reminder_at
    from matches m join leagues l on l.id=m.league_id join match_players mp on mp.match_id=m.id
      join players pl on pl.id=mp.player_id and pl.user_id is not null
      join league_members lm on lm.league_id=l.id and lm.user_id=pl.user_id
      left join push_prefs pf on pf.user_id=pl.user_id
  ), ev as (
    select 'reminder'::text as kind,b.match_id,b.league_name,b.league_slug,b.match_date,b.play_time,b.place,b.team,b.score_a,b.score_b,b.user_id
      from base b where b.score_a is null and b.score_b is null and p_now>=b.reminder_at and p_now<b.kickoff
        and b.match_date>=coalesce(p_today,(p_now at time zone 'Europe/Rome')::date)
    union all
    select 'result',b.match_id,b.league_name,b.league_slug,b.match_date,b.play_time,b.place,b.team,b.score_a,b.score_b,b.user_id
      from base b join match_stamps s on s.match_id=b.match_id where b.score_a is not null and b.score_b is not null
        and b.match_date>=coalesce(p_today,(p_now at time zone 'Europe/Rome')::date)-3
        and s.result_at between p_now-interval '1 day' and p_now-interval '1 minute'
    union all
    select 'ratings',b.match_id,b.league_name,b.league_slug,b.match_date,b.play_time,b.place,b.team,b.score_a,b.score_b,b.user_id
      from base b join match_stamps s on s.match_id=b.match_id
      where b.match_date>=coalesce(p_today,(p_now at time zone 'Europe/Rome')::date)-3
        and s.ratings_text_at between p_now-interval '1 day' and p_now-interval '2 minutes'
        and exists(select 1 from match_players r where r.match_id=b.match_id and r.rating is not null)
        and not exists(select 1 from match_players r where r.match_id=b.match_id and r.rating is not null
          and coalesce(btrim(r.titolo),'')='' and coalesce(btrim(r.descrizione),'')='')
    union all
    select 'gazzetta',b.match_id,b.league_name,b.league_slug,b.match_date,b.play_time,b.place,b.team,b.score_a,b.score_b,b.user_id
      from base b join gazzette g on g.match_id=b.match_id where public.has_premium(b.user_id)
        and b.match_date>=coalesce(p_today,(p_now at time zone 'Europe/Rome')::date)-3
        and g.uploaded_at between p_now-interval '1 day' and p_now-interval '30 seconds'
    union all
    select 'change:'||c.revision::text,m.id,l.name,l.slug,m.date,m.play_time,m.place,
      coalesce((select mp.team from match_players mp join players p on p.id=mp.player_id
        where mp.match_id=m.id and p.user_id=c.user_id limit 1),'out'),m.score_a,m.score_b,c.user_id
      from push_program_changes c join matches m on m.id=c.match_id join leagues l on l.id=m.league_id
        join league_members lm on lm.league_id=l.id and lm.user_id=c.user_id
      where c.changed_at between p_now-interval '1 day' and p_now-interval '1 minute'
        and m.score_a is null and m.score_b is null
        and (m.date+coalesce(m.play_time,'23:59'::time)) at time zone 'Europe/Rome'>p_now
  )
  select ev.kind,ev.user_id,ev.match_id,ev.league_name,ev.league_slug,ev.match_date,ev.play_time,ev.place,ev.team,ev.score_a,ev.score_b,
    s.endpoint,s.p256dh,s.auth from ev join push_subscriptions s on s.user_id=ev.user_id left join push_prefs pf on pf.user_id=ev.user_id
  where coalesce(pf.enabled,true) and coalesce(case split_part(ev.kind,':',1)
    when 'reminder' then pf.reminder when 'result' then pf.result when 'ratings' then pf.ratings
    when 'gazzetta' then pf.gazzetta when 'change' then pf.change end,true)
    and not exists(select 1 from push_sent sent where sent.kind=ev.kind and sent.match_id=ev.match_id and sent.user_id=ev.user_id);
$$;
revoke all on function public.push_due_at(timestamptz,date) from public,anon,authenticated;
grant execute on function public.push_due_at(timestamptz,date) to service_role;

create or replace function public.push_due(p_today date default (now() at time zone 'Europe/Rome')::date)
returns table(kind text,user_id uuid,match_id uuid,league_name text,league_slug text,match_date date,play_time time,place text,
  team text,score_a smallint,score_b smallint,endpoint text,p256dh text,auth text)
language sql stable security definer set search_path=public as $$ select * from public.push_due_at(now(),p_today); $$;

-- Il controllo ogni minuto serve anche agli anticipi Premium e recupera i ritardi del job.
create or replace function public.push_reminder_run()
returns void language plpgsql security definer set search_path=public,extensions as $$
declare secret text;
begin
  if not exists(select 1 from public.push_due() where kind='reminder') then return; end if;
  select value into secret from private_config where key='cron_secret';
  if secret is null then raise warning 'push_reminder_run: segreto non impostato'; return; end if;
  perform net.http_post(url:='https://ivrwqpuikbnvnxgvgegd.supabase.co/functions/v1/push',
    headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',secret),
    body:='{"job":"reminders"}'::jsonb,timeout_milliseconds:=20000);
end $$;
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='push-reminders';
    perform cron.schedule('push-reminders','* * * * *','select public.push_reminder_run()');
  end if;
end $$;

$migration$]);
notify pgrst, 'reload schema';
commit;
select version,name from supabase_migrations.schema_migrations where version='20261204000000';