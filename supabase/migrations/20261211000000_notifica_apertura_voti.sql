-- Una notifica ai partecipanti quando l'admin apre la finestra di voto.
-- La consegna usa il job eventi già attivo e il registro push_sent: un solo invio per utente e partita.
create index community_vote_settings_started_at_idx on public.community_vote_settings(started_at);

create function public.push_community_vote_due_at(p_now timestamptz)
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
  where p_now>=v.started_at and p_now<v.started_at+interval '24 hours'
    and coalesce(pf.enabled,true) and coalesce(pf.ratings,true)
    and not exists(select 1 from push_sent sent where sent.kind='community_vote_open'
      and sent.match_id=m.id and sent.user_id=p.user_id)
  order by p.user_id,m.id,s.endpoint,mp.position;
$$;
revoke all on function public.push_community_vote_due_at(timestamptz) from public,anon,authenticated;
grant execute on function public.push_community_vote_due_at(timestamptz) to service_role;

create or replace function public.push_due(p_today date default (now() at time zone 'Europe/Rome')::date)
returns table(kind text,user_id uuid,match_id uuid,league_name text,league_slug text,match_date date,play_time time,place text,
  team text,score_a smallint,score_b smallint,endpoint text,p256dh text,auth text)
language sql stable security definer set search_path=public as $$
  select * from public.push_due_at(now(),p_today)
  union all
  select * from public.push_community_vote_due_at(now());
$$;
