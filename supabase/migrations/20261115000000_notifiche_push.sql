-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · notifiche push (passo 1: promemoria della mattina della partita, alle 7 ora italiana)
--   · push_subscriptions : i telefoni che hanno attivato le notifiche (uno o più per persona)
--   · push_sent          : cosa è già stato mandato (niente doppioni)
--   · private_config     : segreti del database (illeggibili da fuori; il valore si inserisce a mano, non sta nel repository)
--   · push_reminders_due(): chi deve ricevere il promemoria di oggi (la legge solo il servizio che invia)
--   · push_reminder_run(): la chiama pg_cron; alle 7 in Italia sveglia il servizio che invia
--  Applicare con:  npx supabase db push --linked
-- ═══════════════════════════════════════════════════════════════════════════
create extension if not exists pg_net with schema extensions;

-- ── telefoni con le notifiche attive ───────────────────────────────────────
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz
);
create index if not exists push_subscriptions_user on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
-- ognuno vede (e toglie) solo i propri telefoni; si aggiungono con la funzione qui sotto
drop policy if exists push_subs_select on public.push_subscriptions;
create policy push_subs_select on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
drop policy if exists push_subs_delete on public.push_subscriptions;
create policy push_subs_delete on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_ua text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Iscrizione alle notifiche non valida';
  end if;
  -- lo stesso telefono può passare da un account all'altro: l'iscrizione segue chi ha fatto l'accesso
  insert into push_subscriptions(user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_ua, 300))
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end $$;
revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

create or replace function public.remove_push_subscription(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end $$;
revoke all on function public.remove_push_subscription(text) from public, anon;
grant execute on function public.remove_push_subscription(text) to authenticated;

-- ── registro degli invii e segreti: chiusi a tutti (le righe le toccano solo le funzioni e il servizio che invia) ──
create table if not exists public.push_sent (
  kind     text not null,
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  sent_at  timestamptz not null default now(),
  primary key (kind, match_id, user_id)
);
alter table public.push_sent enable row level security;

create table if not exists public.private_config (key text primary key, value text not null);
alter table public.private_config enable row level security;

-- ── chi riceve il promemoria di oggi ───────────────────────────────────────
-- Partite di OGGI (ora italiana) non ancora giocate (senza risultato), con i giocatori che hanno un account
-- collegato e almeno un telefono con le notifiche; si salta chi l'ha già ricevuto.
create or replace function public.push_reminders_due(p_today date default (now() at time zone 'Europe/Rome')::date)
returns table (user_id uuid, match_id uuid, league_name text, league_slug text, play_time time, place text, team text,
               endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  select pl.user_id, m.id, l.name, l.slug, m.play_time, m.place, mp.team, s.endpoint, s.p256dh, s.auth
    from matches m
    join leagues l on l.id = m.league_id
    join match_players mp on mp.match_id = m.id
    join players pl on pl.id = mp.player_id and pl.user_id is not null
    join push_subscriptions s on s.user_id = pl.user_id
   where m.date = p_today
     and m.score_a is null and m.score_b is null
     and not exists (select 1 from push_sent x where x.kind = 'reminder' and x.match_id = m.id and x.user_id = pl.user_id)
$$;
revoke all on function public.push_reminders_due(date) from public, anon, authenticated;
grant execute on function public.push_reminders_due(date) to service_role;

-- ── pg_cron → sveglia il servizio che invia, ma solo quando in Italia sono le 7 ──
create or replace function public.push_reminder_run()
returns void language plpgsql security definer set search_path = public, extensions as $$
declare secret text;
begin
  if extract(hour from now() at time zone 'Europe/Rome') <> 7 then return; end if;   -- (cron gira alle 5 e alle 6 UTC: una sola vale)
  select value into secret from private_config where key = 'cron_secret';
  if secret is null then raise warning 'push_reminder_run: segreto non impostato'; return; end if;
  perform net.http_post(
    url := 'https://ivrwqpuikbnvnxgvgegd.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{"job":"reminders"}'::jsonb,
    timeout_milliseconds := 20000);
end $$;
revoke all on function public.push_reminder_run() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'push-reminders';
    perform cron.schedule('push-reminders', '0 5,6 * * *', 'select public.push_reminder_run()');
  else
    raise warning 'pg_cron non attivo: il promemoria va pianificato a mano';
  end if;
end $$;

-- fine ✔
