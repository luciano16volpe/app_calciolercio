-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · notifiche push (passo 2): risultato inserito, pagelle pronte, Gazzetta caricata + interruttori per tipo
--   · match_stamps : quando è stato inserito il risultato / sono stati scritti i testi delle pagelle (scritta dai trigger,
--                    fuori dalla tabella delle partite così il registro attività non si riempie di rumore)
--   · push_prefs   : quali tipi di notifica vuole ognuno (assente = tutti)
--   · push_due()   : cosa c'è da mandare adesso e a chi (promemoria incluso). Regole:
--       - solo ai giocatori in quella partita, con un account collegato e un telefono iscritto;
--       - risultato: 1 minuto dopo l'inserimento · pagelle: 2 minuti dopo l'ultima modifica E tutte le pagelle con voto hanno
--         titolo o descrizione · Gazzetta: 30 secondi dopo il caricamento;
--       - solo per partite degli ultimi 3 giorni e modifiche delle ultime 24 ore (niente avvisi per le partite vecchie);
--       - ogni tipo una sola volta per persona e partita (push_sent); niente per le importazioni dal vecchio sistema.
--   · push_events_run(): ogni minuto, se c'è qualcosa da mandare, sveglia il servizio che invia.
--  Applicare con:  npx supabase db push --linked
-- ═══════════════════════════════════════════════════════════════════════════

-- ── interruttori per tipo ──────────────────────────────────────────────────
create table if not exists public.push_prefs (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  reminder boolean not null default true,
  result   boolean not null default true,
  ratings  boolean not null default true,
  gazzetta boolean not null default true
);
alter table public.push_prefs enable row level security;
drop policy if exists push_prefs_select on public.push_prefs;
create policy push_prefs_select on public.push_prefs for select to authenticated using (user_id = auth.uid());

create or replace function public.my_push_prefs()
returns table (reminder boolean, result boolean, ratings boolean, gazzetta boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(p.reminder, true), coalesce(p.result, true), coalesce(p.ratings, true), coalesce(p.gazzetta, true)
    from (select 1) x left join push_prefs p on p.user_id = auth.uid();
$$;
revoke all on function public.my_push_prefs() from public, anon;
grant execute on function public.my_push_prefs() to authenticated;

create or replace function public.set_push_pref(p_kind text, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  if p_kind not in ('reminder', 'result', 'ratings', 'gazzetta') then raise exception 'Tipo di notifica sconosciuto'; end if;
  insert into push_prefs(user_id) values (auth.uid()) on conflict (user_id) do nothing;
  update push_prefs set
    reminder = case when p_kind = 'reminder' then p_on else reminder end,
    result   = case when p_kind = 'result'   then p_on else result end,
    ratings  = case when p_kind = 'ratings'  then p_on else ratings end,
    gazzetta = case when p_kind = 'gazzetta' then p_on else gazzetta end
  where user_id = auth.uid();
end $$;
revoke all on function public.set_push_pref(text, boolean) from public, anon;
grant execute on function public.set_push_pref(text, boolean) to authenticated;

-- ── quando è successo qualcosa (per i trigger) ─────────────────────────────
create table if not exists public.match_stamps (
  match_id        uuid primary key references public.matches(id) on delete cascade,
  result_at       timestamptz,
  ratings_text_at timestamptz
);
alter table public.match_stamps enable row level security;   -- nessuna regola: la toccano solo i trigger e il servizio che invia

create or replace function public.stamp_result()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.score_a is not null and new.score_b is not null
     and (tg_op = 'INSERT' or old.score_a is distinct from new.score_a or old.score_b is distinct from new.score_b)
     and coalesce((select src from public.audit_ctx()), 'app') <> 'import' then
    insert into match_stamps(match_id, result_at) values (new.id, now()) on conflict (match_id) do update set result_at = now();
  end if;
  return null;
end $$;
drop trigger if exists stamp_result on public.matches;
create trigger stamp_result after insert or update of score_a, score_b on public.matches
  for each row execute function public.stamp_result();

create or replace function public.stamp_ratings_text()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and (coalesce(new.titolo, '') <> '' or coalesce(new.descrizione, '') <> ''))
     or (tg_op = 'UPDATE' and (new.titolo is distinct from old.titolo or new.descrizione is distinct from old.descrizione)) then
    if coalesce((select src from public.audit_ctx()), 'app') <> 'import' then
      insert into match_stamps(match_id, ratings_text_at) values (new.match_id, now()) on conflict (match_id) do update set ratings_text_at = now();
    end if;
  end if;
  return null;
end $$;
drop trigger if exists stamp_ratings_text on public.match_players;
create trigger stamp_ratings_text after insert or update of titolo, descrizione on public.match_players
  for each row execute function public.stamp_ratings_text();

-- ── cosa mandare adesso, e a chi ───────────────────────────────────────────
create or replace function public.push_due(p_today date default (now() at time zone 'Europe/Rome')::date)
returns table (kind text, user_id uuid, match_id uuid, league_name text, league_slug text, match_date date, play_time time, place text,
               team text, score_a smallint, score_b smallint, endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  with base as (
    select m.id as match_id, l.name as league_name, l.slug as league_slug, m.date as match_date, m.play_time, m.place,
           mp.team, m.score_a, m.score_b, pl.user_id
      from matches m
      join leagues l on l.id = m.league_id
      join match_players mp on mp.match_id = m.id
      join players pl on pl.id = mp.player_id and pl.user_id is not null
  ), ev as (
    -- promemoria: partite di OGGI senza risultato
    select 'reminder'::text as kind, b.* from base b
     where b.match_date = p_today and b.score_a is null and b.score_b is null
    union all
    -- risultato inserito (1 minuto dopo, per raccogliere le correzioni)
    select 'result', b.* from base b join match_stamps s on s.match_id = b.match_id
     where b.score_a is not null and b.score_b is not null and b.match_date >= p_today - 3
       and s.result_at between now() - interval '1 day' and now() - interval '1 minute'
    union all
    -- pagelle pronte: tutte quelle con voto hanno titolo o descrizione, e nessuna modifica negli ultimi 2 minuti
    select 'ratings', b.* from base b join match_stamps s on s.match_id = b.match_id
     where b.match_date >= p_today - 3
       and s.ratings_text_at between now() - interval '1 day' and now() - interval '2 minutes'
       and exists (select 1 from match_players r where r.match_id = b.match_id and r.rating is not null)
       and not exists (select 1 from match_players r where r.match_id = b.match_id and r.rating is not null
                          and coalesce(btrim(r.titolo), '') = '' and coalesce(btrim(r.descrizione), '') = '')
    union all
    -- Gazzetta caricata (30 secondi dopo)
    select 'gazzetta', b.* from base b join gazzette g on g.match_id = b.match_id
     where b.match_date >= p_today - 3
       and g.uploaded_at between now() - interval '1 day' and now() - interval '30 seconds'
  )
  select ev.kind, ev.user_id, ev.match_id, ev.league_name, ev.league_slug, ev.match_date, ev.play_time, ev.place,
         ev.team, ev.score_a, ev.score_b, s.endpoint, s.p256dh, s.auth
    from ev
    join push_subscriptions s on s.user_id = ev.user_id
    left join push_prefs pf on pf.user_id = ev.user_id
   where coalesce(case ev.kind when 'reminder' then pf.reminder when 'result' then pf.result when 'ratings' then pf.ratings when 'gazzetta' then pf.gazzetta end, true)
     and not exists (select 1 from push_sent x where x.kind = ev.kind and x.match_id = ev.match_id and x.user_id = ev.user_id)
$$;
revoke all on function public.push_due(date) from public, anon, authenticated;
grant execute on function public.push_due(date) to service_role;

-- il promemoria è un caso di push_due (una sola regola per tutti)
create or replace function public.push_reminders_due(p_today date default (now() at time zone 'Europe/Rome')::date)
returns table (user_id uuid, match_id uuid, league_name text, league_slug text, play_time time, place text, team text,
               endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  select d.user_id, d.match_id, d.league_name, d.league_slug, d.play_time, d.place, d.team, d.endpoint, d.p256dh, d.auth
    from public.push_due(p_today) d where d.kind = 'reminder'
$$;
revoke all on function public.push_reminders_due(date) from public, anon, authenticated;
grant execute on function public.push_reminders_due(date) to service_role;

-- ── pg_cron: ogni minuto, se c'è qualcosa da mandare, sveglia il servizio ──
create or replace function public.push_events_run()
returns void language plpgsql security definer set search_path = public, extensions as $$
declare secret text;
begin
  if not exists (select 1 from public.push_due() d where d.kind <> 'reminder') then return; end if;
  select value into secret from private_config where key = 'cron_secret';
  if secret is null then raise warning 'push_events_run: segreto non impostato'; return; end if;
  perform net.http_post(
    url := 'https://ivrwqpuikbnvnxgvgegd.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{"job":"events"}'::jsonb,
    timeout_milliseconds := 20000);
end $$;
revoke all on function public.push_events_run() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'push-events';
    perform cron.schedule('push-events', '* * * * *', 'select public.push_events_run()');
  else
    raise warning 'pg_cron non attivo: le notifiche degli eventi vanno pianificate a mano';
  end if;
end $$;

-- fine ✔
