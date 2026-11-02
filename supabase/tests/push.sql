-- ═══════════════════════════════════════════════════════════════════════════
--  Notifiche push nel database vero, SENZA tracce (alla fine il blocco si interrompe con il resoconto e tutto si annulla):
--  iscrizioni dei telefoni (solo le proprie), chi riceve il promemoria di oggi, tabelle e segreti chiusi a tutti.
--  Eseguire con:  npx supabase db query --linked -f supabase/tests/push.sql
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', case when uid is null then '' else json_build_object('sub', uid, 'role', 'authenticated')::text end, true);
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('request.headers', '{"x-forwarded-for":"203.0.113.80","user-agent":"PushTest/1.0"}', true);
  if uid is null then execute 'reset role'; else execute 'set local role authenticated'; end if;
end $f$;

do $test$
declare
  u_a uuid := gen_random_uuid();   -- collegato a Ada (in squadra oggi, due telefoni)
  u_b uuid := gen_random_uuid();   -- collegato a Bea (in squadra oggi, un telefono)
  u_c uuid := gen_random_uuid();   -- collegato a Carla (partita già giocata)
  u_d uuid := gen_random_uuid();   -- collegato a Dina (partita di domani)
  u_e uuid := gen_random_uuid();   -- collegato a Eva (in squadra oggi ma senza telefoni iscritti)
  l1 uuid := gen_random_uuid(); m_oggi uuid := gen_random_uuid(); m_giocata uuid := gen_random_uuid(); m_domani uuid := gen_random_uuid();
  p uuid[] := array(select gen_random_uuid() from generate_series(1, 6));  -- 1 Ada · 2 Bea · 3 Carla · 4 Dina · 5 Eva · 6 Senza account
  oggi date := (now() at time zone 'Europe/Rome')::date;
  ok boolean; n int; n2 int; msg text; k text;
begin
  create temp table t_res(name text, ok boolean, info text) on commit drop;
  grant all on t_res to authenticated;
  insert into auth.users(id, email, aud, role, instance_id, raw_user_meta_data)
    select u, 'ps-' || i || '@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb
      from unnest(array[u_a, u_b, u_c, u_d, u_e]) with ordinality t(u, i);
  insert into leagues(id, name, is_public, owner_id, created_by) values (l1, 'Lega Push', false, u_a, u_a);
  insert into players(id, name) values (p[1], 'Ada'), (p[2], 'Bea'), (p[3], 'Carla'), (p[4], 'Dina'), (p[5], 'Eva'), (p[6], 'Senza');
  insert into league_players(league_id, player_id) select l1, x from unnest(p) x;
  perform set_config('app.linking', 'on', true);
  update players set user_id = u_a where id = p[1]; update players set user_id = u_b where id = p[2]; update players set user_id = u_c where id = p[3];
  update players set user_id = u_d where id = p[4]; update players set user_id = u_e where id = p[5];
  perform set_config('app.linking', 'off', true);
  insert into matches(id, league_id, date, play_time, place) values (m_oggi, l1, oggi, '21:00', 'Campo Sole'), (m_domani, l1, oggi + 1, '21:00', 'Campo Sole');
  insert into matches(id, league_id, date, play_time, place, score_a, score_b) values (m_giocata, l1, oggi, '18:00', 'Campo Luna', 5, 3);
  insert into match_players(match_id, player_id, team, position) values
    (m_oggi, p[1], 'A', 1), (m_oggi, p[2], 'B', 2), (m_oggi, p[5], 'B', 3), (m_oggi, p[6], 'A', 4),
    (m_giocata, p[3], 'A', 1), (m_domani, p[4], 'A', 1);
  delete from audit_log;

  -- ── iscrizione dei telefoni ──
  perform pg_temp.as_user(u_a);
  perform public.save_push_subscription('https://push.example/ada-1', 'P256', 'AUTH', 'iPhone');
  perform public.save_push_subscription('https://push.example/ada-2', 'P256', 'AUTH', 'Android');
  begin perform public.save_push_subscription('http://insicuro.example/x', 'P', 'A', null); ok := false; exception when others then ok := true; end;
  insert into t_res values ('iscrizione: un indirizzo non https è rifiutato', ok, '');
  begin perform public.save_push_subscription('https://push.example/vuota', '', 'A', null); ok := false; exception when others then ok := true; end;
  insert into t_res values ('iscrizione: chiavi vuote rifiutate', ok, '');
  begin insert into push_subscriptions(user_id, endpoint, p256dh, auth) values (u_a, 'https://push.example/diretta', 'P', 'A'); ok := false; exception when others then ok := true; end;
  insert into t_res values ('iscrizione: non si scrive direttamente nella tabella', ok, '');
  perform pg_temp.as_user(u_b);
  perform public.save_push_subscription('https://push.example/bea-1', 'P256', 'AUTH', 'iPhone');
  perform pg_temp.as_user(u_c);
  perform public.save_push_subscription('https://push.example/carla-1', 'P256', 'AUTH', null);
  perform pg_temp.as_user(u_d);
  perform public.save_push_subscription('https://push.example/dina-1', 'P256', 'AUTH', null);
  perform pg_temp.as_user(null);
  insert into t_res values ('iscrizione: i telefoni sono registrati', (select count(*) from push_subscriptions where endpoint like 'https://push.example/%') = 5, '');

  -- ognuno vede solo i propri telefoni
  perform pg_temp.as_user(u_a); select count(*) into n from push_subscriptions;
  perform pg_temp.as_user(u_b); select count(*) into n2 from push_subscriptions;
  perform pg_temp.as_user(null);
  insert into t_res values ('privacy: ognuno vede solo le proprie iscrizioni', n = 2 and n2 = 1, n || ' / ' || n2);
  perform pg_temp.as_user(u_a);
  delete from push_subscriptions where user_id = u_b;
  get diagnostics n = row_count;
  perform pg_temp.as_user(null);
  insert into t_res values ('privacy: non si tolgono i telefoni di un altro', n = 0 and exists (select 1 from push_subscriptions where user_id = u_b), '');

  -- lo stesso telefono passa a un altro account
  perform pg_temp.as_user(u_e);
  perform public.save_push_subscription('https://push.example/ada-2', 'P256', 'AUTH', 'Android');
  perform pg_temp.as_user(null);
  insert into t_res values ('iscrizione: lo stesso telefono passa all''ultimo account che l''ha attivato', (select user_id from push_subscriptions where endpoint = 'https://push.example/ada-2') = u_e, '');
  perform pg_temp.as_user(u_e);
  perform public.remove_push_subscription('https://push.example/ada-2');
  perform pg_temp.as_user(u_a);
  perform public.remove_push_subscription('https://push.example/bea-1'); -- non è suo: non succede niente
  perform pg_temp.as_user(null);
  insert into t_res values ('iscrizione: ognuno toglie solo il proprio telefono', not exists (select 1 from push_subscriptions where endpoint = 'https://push.example/ada-2') and exists (select 1 from push_subscriptions where endpoint = 'https://push.example/bea-1'), '');
  perform pg_temp.as_user(u_a);
  perform public.save_push_subscription('https://push.example/ada-2', 'P256', 'AUTH', 'Android');
  perform pg_temp.as_user(null);

  -- ── chi riceve il promemoria di oggi (come il servizio che invia) ──
  create temp table t_due on commit drop as select * from public.push_reminders_due(oggi);
  insert into t_res values ('promemoria: Ada riceve su tutti e due i telefoni', (select count(*) from t_due where user_id = u_a) = 2, '');
  insert into t_res values ('promemoria: Bea riceve con la squadra Bianchi', (select team from t_due where user_id = u_b) = 'B', '');
  insert into t_res values ('promemoria: il testo ha ora, luogo e lega', (select count(*) from t_due where match_id = m_oggi and play_time = '21:00' and place = 'Campo Sole' and league_name = 'Lega Push' and league_slug is not null) = 3, '');
  insert into t_res values ('promemoria: niente per chi gioca una partita già giocata (con risultato)', not exists (select 1 from t_due where user_id = u_c), '');
  insert into t_res values ('promemoria: niente per le partite di un altro giorno', not exists (select 1 from t_due where user_id = u_d), '');
  insert into t_res values ('promemoria: niente per chi non ha telefoni iscritti', not exists (select 1 from t_due where user_id = u_e), '');
  insert into t_res values ('promemoria: niente per chi non ha un account collegato', not exists (select 1 from t_due where match_id = m_oggi and team = 'A' and user_id is null), '');
  insert into t_res values ('promemoria: in tutto 3 telefoni di 2 persone', (select count(*) from t_due) = 3 and (select count(distinct user_id) from t_due) = 2, (select count(*) from t_due) || ' telefoni');
  -- già inviato: non si manda due volte
  insert into push_sent(kind, match_id, user_id) values ('reminder', m_oggi, u_a);
  insert into t_res values ('promemoria: chi l''ha già ricevuto non lo riceve due volte', not exists (select 1 from public.push_reminders_due(oggi) where user_id = u_a) and exists (select 1 from public.push_reminders_due(oggi) where user_id = u_b), '');
  insert into t_res values ('promemoria: una partita di domani si prepara solo domani', exists (select 1 from public.push_reminders_due(oggi + 1) where user_id = u_d) and not exists (select 1 from public.push_reminders_due(oggi + 1) where user_id = u_a), '');

  -- ── chi può leggere e chiamare cosa ──
  perform pg_temp.as_user(u_a);
  begin perform * from public.push_reminders_due(oggi); ok := false; exception when others then ok := true; end;
  insert into t_res values ('chiuso: un utente non può chiamare l''elenco dei destinatari', ok, '');
  select count(*) into n from push_sent;
  insert into t_res values ('chiuso: il registro degli invii non si legge da fuori', n = 0, n || ' righe');
  begin select count(*) into n from private_config; ok := (n = 0); exception when others then ok := true; end;
  insert into t_res values ('chiuso: i segreti del database non si leggono da fuori', ok, '');
  begin perform public.push_reminder_run(); ok := false; exception when others then ok := true; end;
  insert into t_res values ('chiuso: nemmeno il lavoro del cron si può chiamare da fuori', ok, '');
  perform pg_temp.as_user(null);
  -- l'app può leggere la chiave pubblica (se è già stata impostata) solo da loggata
  perform pg_temp.as_user(u_a);
  begin perform public.push_public_key(); ok := true; exception when others then ok := false; end;
  perform pg_temp.as_user(null);
  insert into t_res values ('chiave pubblica: la legge chi ha fatto l''accesso', ok, '');
  perform pg_temp.as_user(u_a);
  select count(*) into n from app_settings where key = 'vapid_private';
  perform pg_temp.as_user(null);
  insert into t_res values ('chiave privata: non esiste nel database', n = 0 and not exists (select 1 from app_settings where key ilike '%private%'), '');

  -- ── il cron: alle 7 ora italiana lavora, in altre ore non fa niente (niente segreto = avviso, non errore) ──
  insert into t_res values ('cron: il lavoro delle 7 è pianificato (alle 5 e alle 6 UTC)',
    not exists (select 1 from pg_extension where extname = 'pg_cron') or exists (select 1 from cron.job where jobname = 'push-reminders' and schedule = '0 5,6 * * *'), '');

  select string_agg(case when x.ok then '✔ ' else '✘ ' end || x.name || case when x.info <> '' then ' (' || x.info || ')' else '' end, chr(10) order by x.ok, x.name)
    into msg from t_res x where not x.ok;
  raise exception 'REPORT%', chr(10) || coalesce(msg, 'nessun problema') || chr(10) || 'Totale: ' || (select count(*) from t_res) || ' controlli, ' || (select count(*) from t_res x where not x.ok) || ' falliti';
end
$test$;
