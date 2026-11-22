-- La push parte solo dopo che il job ha scritto le medie e finalizzato la votazione.
-- I voti individuali restano privati; il registro push_sent evita nuovi invii dopo il primo successo.
-- Le votazioni già concluse prima del rilascio non generano avvisi retroattivi.
alter table public.community_vote_settings
  add column publication_notice_enabled boolean not null default true;
update public.community_vote_settings set publication_notice_enabled=false where finalized_at is not null;

create index community_vote_settings_finalized_at_idx
  on public.community_vote_settings(finalized_at) where finalized_at is not null;

create function public.push_community_vote_published_due_at(p_now timestamptz)
returns table(kind text,user_id uuid,match_id uuid,league_name text,league_slug text,match_date date,play_time time,place text,
  team text,score_a smallint,score_b smallint,endpoint text,p256dh text,auth text)
language sql stable security definer set search_path=public as $$
  select distinct on (p.user_id,m.id,s.endpoint)
    'community_vote_published'::text,p.user_id,m.id,l.name,l.slug,m.date,m.play_time,m.place,
    mp.team,m.score_a,m.score_b,s.endpoint,s.p256dh,s.auth
  from community_vote_settings v
    join matches m on m.id=v.match_id
    join leagues l on l.id=m.league_id
    join match_players mp on mp.match_id=m.id
    join players p on p.id=mp.player_id and p.user_id is not null
    join league_members lm on lm.league_id=m.league_id and lm.user_id=p.user_id
    join push_subscriptions s on s.user_id=p.user_id
    left join push_prefs pf on pf.user_id=p.user_id
  where v.publication_notice_enabled
    and v.finalized_at between p_now-interval '1 day' and p_now
    and exists(select 1 from match_players rated where rated.match_id=m.id and rated.rating is not null)
    and coalesce(pf.enabled,true) and coalesce(pf.ratings,true)
    and not exists(select 1 from push_sent sent where sent.kind='community_vote_published'
      and sent.match_id=m.id and sent.user_id=p.user_id)
  order by p.user_id,m.id,s.endpoint,mp.position;
$$;
revoke all on function public.push_community_vote_published_due_at(timestamptz) from public,anon,authenticated;
grant execute on function public.push_community_vote_published_due_at(timestamptz) to service_role;

-- Le pagelle redazionali continuano a usare il loro avviso; quelle dei partecipanti
-- ricevono soltanto l'avviso di pubblicazione delle medie.
create or replace function public.push_due(p_today date default (now() at time zone 'Europe/Rome')::date)
returns table(kind text,user_id uuid,match_id uuid,league_name text,league_slug text,match_date date,play_time time,place text,
  team text,score_a smallint,score_b smallint,endpoint text,p256dh text,auth text)
language sql stable security definer set search_path=public as $$
  select d.* from public.push_due_at(now(),p_today) d
    where d.kind <> 'ratings' or not exists(
      select 1 from community_vote_settings v where v.match_id=d.match_id)
  union all
  select * from public.push_community_vote_due_at(now())
  union all
  select * from public.push_community_vote_published_due_at(now());
$$;
