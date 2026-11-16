-- Orario locale unico per il giorno della partita e la vigilia; le vecchie preferenze
-- relative in minuti non governano più gli invii.
alter table public.push_prefs add column reminder_hour smallint not null default 8
  check (reminder_hour between 0 and 23);

create or replace function public.set_push_reminder_hour(p_hour integer)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  if p_hour is null or p_hour < 0 or p_hour > 23 then raise exception 'Orario non valido'; end if;
  insert into push_prefs(user_id,reminder_hour) values(auth.uid(),p_hour)
    on conflict(user_id) do update set reminder_hour=excluded.reminder_hour;
end $$;
revoke all on function public.set_push_reminder_hour(integer) from public,anon;
grant execute on function public.set_push_reminder_hour(integer) to authenticated;

drop function public.my_push_prefs();
create function public.my_push_prefs()
returns table(reminder boolean,result boolean,ratings boolean,gazzetta boolean,
  enabled boolean,change boolean,reminder_minutes integer,customizable boolean,reminder_hour smallint)
language sql stable security definer set search_path=public as $$
  select coalesce(p.reminder,true),coalesce(p.result,true),coalesce(p.ratings,true),coalesce(p.gazzetta,true),
    coalesce(p.enabled,true),coalesce(p.change,true),p.reminder_minutes,public.has_premium(auth.uid()),coalesce(p.reminder_hour,8)
  from (select 1) x left join push_prefs p on p.user_id=auth.uid();
$$;
revoke all on function public.my_push_prefs() from public,anon;
grant execute on function public.my_push_prefs() to authenticated;

-- Solo le nuove partite generano una convocazione alla creazione; le importazioni sono escluse.
create table public.push_invite_created (
  match_id uuid primary key references public.matches(id) on delete cascade,
  created_at timestamptz not null default now(),
  notify_created boolean not null default true
);
alter table public.push_invite_created enable row level security;
revoke all on public.push_invite_created from anon,authenticated;
-- Le partite già programmate conservano il promemoria della vigilia, senza un falso
-- avviso di nuova convocazione al momento del rilascio.
insert into public.push_invite_created(match_id,created_at,notify_created)
select id,created_at,false from public.matches
where date >= (now() at time zone 'Europe/Rome')::date and score_a is null and score_b is null;
create function public.stamp_invite_created()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if coalesce((select src from public.audit_ctx()),'app') <> 'import' then
    insert into public.push_invite_created(match_id) values(new.id);
  end if;
  return new;
end $$;
create trigger push_invite_created after insert on public.matches
for each row execute function public.stamp_invite_created();

create or replace function public.push_due_at(p_now timestamptz,p_today date default null)
returns table(kind text,user_id uuid,match_id uuid,league_name text,league_slug text,match_date date,play_time time,place text,
  team text,score_a smallint,score_b smallint,endpoint text,p256dh text,auth text)
language sql stable security definer set search_path=public as $$
  with base as (
    select m.id as match_id,l.name as league_name,l.slug as league_slug,m.date as match_date,m.play_time,m.place,
      mp.team,m.score_a,m.score_b,pl.user_id,
      (m.date+coalesce(m.play_time,'23:59'::time)) at time zone 'Europe/Rome' as kickoff,
      (m.date + make_time(coalesce(pf.reminder_hour,8),0,0)) at time zone 'Europe/Rome' as reminder_at
    from matches m join leagues l on l.id=m.league_id join match_players mp on mp.match_id=m.id
      join players pl on pl.id=mp.player_id and pl.user_id is not null
      join league_members lm on lm.league_id=l.id and lm.user_id=pl.user_id
      left join push_prefs pf on pf.user_id=pl.user_id
  ), ev as (
    select 'reminder'::text as kind,b.match_id,b.league_name,b.league_slug,b.match_date,b.play_time,b.place,b.team,b.score_a,b.score_b,b.user_id
      from base b where b.score_a is null and b.score_b is null and p_now>=b.reminder_at and p_now<b.kickoff
        and b.match_date>=coalesce(p_today,(p_now at time zone 'Europe/Rome')::date)
    union all
    select 'invitation_created',b.match_id,b.league_name,b.league_slug,b.match_date,b.play_time,b.place,b.team,b.score_a,b.score_b,b.user_id
      from base b join push_invite_created ic on ic.match_id=b.match_id
      where b.score_a is null and b.score_b is null and ic.notify_created and p_now>=ic.created_at
        and p_now<ic.created_at+interval '1 day' and p_now<b.kickoff
    union all
    select 'invitation_eve',b.match_id,b.league_name,b.league_slug,b.match_date,b.play_time,b.place,b.team,b.score_a,b.score_b,b.user_id
      from base b join push_invite_created ic on ic.match_id=b.match_id
      where b.score_a is null and b.score_b is null and b.match_date=(p_now at time zone 'Europe/Rome')::date+1
        and ic.created_at <= (b.match_date-1 + make_time(coalesce((select reminder_hour from push_prefs where user_id=b.user_id),8),0,0)) at time zone 'Europe/Rome'
        and p_now >= (b.match_date-1 + make_time(coalesce((select reminder_hour from push_prefs where user_id=b.user_id),8),0,0)) at time zone 'Europe/Rome'
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
    when 'reminder' then pf.reminder when 'invitation_created' then pf.reminder when 'invitation_eve' then pf.reminder when 'result' then pf.result when 'ratings' then pf.ratings
    when 'gazzetta' then pf.gazzetta when 'change' then pf.change end,true)
    and not exists(select 1 from push_sent sent where sent.kind=ev.kind and sent.match_id=ev.match_id and sent.user_id=ev.user_id);
$$;

create or replace function public.push_reminder_run()
returns void language plpgsql security definer set search_path=public,extensions as $$
declare secret text;
begin
  if not exists(select 1 from public.push_due() where kind in ('reminder','invitation_eve')) then return; end if;
  select value into secret from private_config where key='cron_secret';
  if secret is null then raise warning 'push_reminder_run: segreto non impostato'; return; end if;
  perform net.http_post(url:='https://ivrwqpuikbnvnxgvgegd.supabase.co/functions/v1/push',
    headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',secret),
    body:='{"job":"reminders"}'::jsonb,timeout_milliseconds:=20000);
end $$;
