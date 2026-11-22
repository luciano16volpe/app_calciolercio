-- L'avviso parte soltanto dopo la finalizzazione atomica delle squadre.
-- I sondaggi gia' chiusi prima del rilascio non generano avvisi retroattivi.
alter table public.formation_polls
  add column final_notice_enabled boolean not null default true;
update public.formation_polls set final_notice_enabled=false where finalized_at is not null;

create index formation_polls_final_notice_idx on public.formation_polls(finalized_at)
  where finalized_at is not null and final_notice_enabled;

-- La convocazione alla creazione mostrerebbe una squadra ancora provvisoria.
update public.push_invite_created ic set notify_created=false
  from public.formation_polls fp where fp.match_id=ic.match_id;
create function public.suppress_provisional_invitation()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  update push_invite_created set notify_created=false where match_id=new.match_id;
  return new;
end $$;
create trigger suppress_provisional_invitation after insert on public.formation_polls
  for each row execute function public.suppress_provisional_invitation();

create function public.push_formation_published_due_at(p_now timestamptz)
returns table(kind text,user_id uuid,match_id uuid,league_name text,league_slug text,match_date date,play_time time,place text,
  team text,score_a smallint,score_b smallint,endpoint text,p256dh text,auth text)
language sql stable security definer set search_path=public as $$
  select distinct on (p.user_id,m.id,s.endpoint)
    'formation_published'::text,p.user_id,m.id,l.name,l.slug,m.date,m.play_time,m.place,
    mp.team,m.score_a,m.score_b,s.endpoint,s.p256dh,s.auth
  from formation_polls fp
    join matches m on m.id=fp.match_id
    join leagues l on l.id=m.league_id
    join match_players mp on mp.match_id=m.id
    join players p on p.id=mp.player_id and p.user_id is not null
    join league_members lm on lm.league_id=m.league_id and lm.user_id=p.user_id
    join push_subscriptions s on s.user_id=p.user_id
    left join push_prefs pf on pf.user_id=p.user_id
  where fp.final_notice_enabled and fp.finalized_at between p_now-interval '1 day' and p_now
    and fp.winning_option is not null
    and coalesce(pf.enabled,true) and coalesce(pf.reminder,true)
    and not exists(select 1 from push_sent sent where sent.kind='formation_published'
      and sent.match_id=m.id and sent.user_id=p.user_id)
  order by p.user_id,m.id,s.endpoint,mp.position;
$$;
revoke all on function public.push_formation_published_due_at(timestamptz) from public,anon,authenticated;
grant execute on function public.push_formation_published_due_at(timestamptz) to service_role;

-- Il job eventi esistente invia la nuova push. Per le partite con sondaggio, l'avviso
-- definitivo sostituisce la convocazione iniziale e quella della vigilia; il promemoria
-- del giorno stesso resta, se le squadre erano definitive almeno un'ora prima
-- dell'ora configurata (altrimenti l'avviso finale lo sostituisce).
create or replace function public.push_due(p_today date default (now() at time zone 'Europe/Rome')::date)
returns table(kind text,user_id uuid,match_id uuid,league_name text,league_slug text,match_date date,play_time time,place text,
  team text,score_a smallint,score_b smallint,endpoint text,p256dh text,auth text)
language sql stable security definer set search_path=public as $$
  select d.* from public.push_due_at(now(),p_today) d
    where (d.kind <> 'ratings' or not exists(
      select 1 from community_vote_settings v where v.match_id=d.match_id))
    and not exists (
      select 1 from formation_polls fp where fp.match_id=d.match_id and (
        d.kind in ('invitation_created','invitation_eve')
        or (d.kind='reminder' and (fp.finalized_at is null or fp.finalized_at >=
          ((d.match_date + make_time(coalesce((select reminder_hour from push_prefs where user_id=d.user_id),8),0,0)) at time zone 'Europe/Rome') - interval '1 hour'))
        or (d.kind like 'change:%' and exists (
          select 1 from push_program_changes c where c.match_id=d.match_id and c.user_id=d.user_id
            and fp.finalized_at is not null and c.changed_at between fp.finalized_at and fp.finalized_at+interval '1 minute'))
      )
    )
  union all
  select * from public.push_community_vote_due_at(now())
  union all
  select * from public.push_community_vote_published_due_at(now())
  union all
  select * from public.push_formation_published_due_at(now());
$$;
