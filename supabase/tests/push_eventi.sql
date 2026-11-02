-- ═══════════════════════════════════════════════════════════════════════════
--  Notifiche degli eventi nel database vero, SENZA tracce (alla fine il blocco si interrompe con il resoconto e tutto si annulla):
--  risultato inserito, pagelle pronte (solo quando tutte hanno testo), Gazzetta caricata; niente per le partite vecchie, per le
--  importazioni, per chi ha spento quel tipo, per chi non gioca; ogni tipo una sola volta; interruttori per tipo.
--  Eseguire con:  npx supabase db query --linked --yes -f supabase/tests/push_eventi.sql
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function pg_temp.as_user(uid uuid, src text default null) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', case when uid is null then '' else json_build_object('sub', uid, 'role', 'authenticated')::text end, true);
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('request.headers', case when src = 'import' then '{"x-audit-source":"import","user-agent":"import/1.0"}' else '{"x-forwarded-for":"203.0.113.90","user-agent":"PushEventi/1.0"}' end, true);
  if uid is null then execute 'reset role'; else execute 'set local role authenticated'; end if;
end $f$;

do $test$
declare
  u_adm uuid := gen_random_uuid();  -- amministratore della lega (scrive risultato, pagelle, Gazzetta)
  u_a uuid := gen_random_uuid();    -- Ada: Blu, riceve tutto
  u_b uuid := gen_random_uuid();    -- Bea: Bianchi, ha spento il risultato
  u_c uuid := gen_random_uuid();    -- Carla: ha il telefono ma non gioca questa partita
  l1 uuid := gen_random_uuid(); m1 uuid := gen_random_uuid(); m_old uuid := gen_random_uuid(); m_imp uuid := gen_random_uuid();
  p uuid[] := array(select gen_random_uuid() from generate_series(1, 4));  -- 1 Ada · 2 Bea · 3 Carla · 4 senza account
  oggi date := (now() at time zone 'Europe/Rome')::date;
  ok boolean; n int; msg text; pr record;
begin
  create temp table t_res(name text, ok boolean, info text) on commit drop;
  grant all on t_res to authenticated;
  insert into auth.users(id, email, aud, role, instance_id, raw_user_meta_data)
    select u, 'pe-' || i || '@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb
      from unnest(array[u_adm, u_a, u_b, u_c]) with ordinality t(u, i);
  insert into leagues(id, name, is_public, owner_id, created_by) values (l1, 'Lega Eventi', false, u_adm, u_adm);
  insert into league_members(league_id, user_id, role) values (l1, u_adm, 'admin') on conflict (league_id, user_id) do update set role = 'admin';
  insert into players(id, name) values (p[1], 'Ada'), (p[2], 'Bea'), (p[3], 'Carla'), (p[4], 'Senza');
  insert into league_players(league_id, player_id) select l1, x from unnest(p) x;
  perform set_config('app.linking', 'on', true);
  update players set user_id = u_a where id = p[1]; update players set user_id = u_b where id = p[2]; update players set user_id = u_c where id = p[3];
  perform set_config('app.linking', 'off', true);
  insert into matches(id, league_id, date, play_time, place) values (m1, l1, oggi, '21:00', 'Campo Sole');
  insert into matches(id, league_id, date) values (m_old, l1, oggi - 10), (m_imp, l1, oggi);
  insert into match_players(match_id, player_id, team, position) values (m1, p[1], 'A', 1), (m1, p[2], 'B', 2), (m1, p[4], 'A', 3),
    (m_old, p[1], 'A', 1), (m_imp, p[1], 'A', 1);
  insert into push_subscriptions(user_id, endpoint, p256dh, auth) values
    (u_a, 'https://push.example/a1', 'P', 'A'), (u_b, 'https://push.example/b1', 'P', 'A'), (u_c, 'https://push.example/c1', 'P', 'A');
  insert into push_prefs(user_id, result) values (u_b, false);   -- Bea non vuole il risultato
  delete from audit_log;

  -- ── niente di pronto all'inizio (a parte il promemoria di oggi) ──
  insert into t_res values ('inizio: solo il promemoria è pronto, per Ada e Bea', (select count(*) from public.push_due() where kind <> 'reminder') = 0 and (select count(distinct user_id) from public.push_due() where kind = 'reminder') = 2, '');

  -- ── risultato inserito (come amministratore, dall'app) ──
  perform pg_temp.as_user(u_adm);
  update matches set score_a = 5, score_b = 3 where id = m1;
  perform pg_temp.as_user(null);
  insert into t_res values ('risultato: il momento dell''inserimento è registrato', exists (select 1 from match_stamps where match_id = m1 and result_at is not null), '');
  insert into t_res values ('risultato: non parte subito (si aspetta 1 minuto per le correzioni)', not exists (select 1 from public.push_due() where kind = 'result'), '');
  insert into t_res values ('risultato: il promemoria sparisce a partita con risultato', not exists (select 1 from public.push_due() where kind = 'reminder' and match_id = m1), '');
  update match_stamps set result_at = now() - interval '2 minutes' where match_id = m1;
  select count(*) into n from public.push_due() where kind = 'result';
  insert into t_res values ('risultato: dopo 1 minuto è pronto per Ada (Blu)', exists (select 1 from public.push_due() where kind = 'result' and user_id = u_a and team = 'A' and score_a = 5 and score_b = 3), n || ' righe');
  insert into t_res values ('risultato: non per Bea (ha spento il risultato)', not exists (select 1 from public.push_due() where kind = 'result' and user_id = u_b), '');
  insert into t_res values ('risultato: non per chi non gioca la partita', not exists (select 1 from public.push_due() where user_id = u_c), '');
  insert into t_res values ('risultato: non per chi non ha un account collegato', not exists (select 1 from public.push_due() where kind = 'result' and team = 'A' and user_id is null), '');
  -- una correzione riporta il conto alla rovescia ma si manda una volta sola
  perform pg_temp.as_user(u_adm);
  update matches set score_a = 6 where id = m1;
  perform pg_temp.as_user(null);
  insert into t_res values ('risultato: una correzione fa ripartire l''attesa', not exists (select 1 from public.push_due() where kind = 'result'), '');
  update match_stamps set result_at = now() - interval '2 minutes' where match_id = m1;
  insert into push_sent(kind, match_id, user_id) values ('result', m1, u_a);
  insert into t_res values ('risultato: una volta sola per persona e partita', not exists (select 1 from public.push_due() where kind = 'result' and user_id = u_a), '');
  delete from push_sent where kind = 'result';

  -- ── pagelle pronte: solo quando TUTTE quelle con voto hanno titolo o descrizione ──
  perform pg_temp.as_user(u_adm);
  update match_players set rating = 7 where match_id = m1 and player_id in (p[1], p[2]);
  update match_players set titolo = 'IL MURO' where match_id = m1 and player_id = p[1];
  perform pg_temp.as_user(null);
  update match_stamps set ratings_text_at = now() - interval '5 minutes' where match_id = m1;
  insert into t_res values ('pagelle: se manca il testo a qualcuno non sono pronte', not exists (select 1 from public.push_due() where kind = 'ratings'), '');
  perform pg_temp.as_user(u_adm);
  update match_players set descrizione = 'Sempre al posto giusto.' where match_id = m1 and player_id = p[2];
  perform pg_temp.as_user(null);
  insert into t_res values ('pagelle: scritto l''ultimo testo, l''attesa riparte (2 minuti)', not exists (select 1 from public.push_due() where kind = 'ratings'), '');
  update match_stamps set ratings_text_at = now() - interval '3 minutes' where match_id = m1;
  insert into t_res values ('pagelle: dopo 2 minuti sono pronte per Ada e per Bea', (select count(distinct user_id) from public.push_due() where kind = 'ratings') = 2, '');
  -- salvare di nuovo la partita senza toccare i testi non riporta indietro l'attesa
  perform pg_temp.as_user(u_adm);
  update match_players set rating = 8 where match_id = m1 and player_id = p[1];
  perform pg_temp.as_user(null);
  insert into t_res values ('pagelle: cambiare un voto (senza toccare i testi) non rifà partire l''attesa', (select ratings_text_at from match_stamps where match_id = m1) < now() - interval '2 minutes', '');

  -- ── Gazzetta ──
  perform pg_temp.as_user(u_adm);
  insert into gazzette(match_id, file_path) values (m1, l1::text || '/' || m1::text || '.jpg');
  perform pg_temp.as_user(null);
  insert into t_res values ('Gazzetta: non parte subito (30 secondi)', not exists (select 1 from public.push_due() where kind = 'gazzetta'), '');
  update gazzette set uploaded_at = now() - interval '2 minutes' where match_id = m1;
  insert into t_res values ('Gazzetta: dopo 30 secondi è pronta per Ada e per Bea', (select count(distinct user_id) from public.push_due() where kind = 'gazzetta') = 2, '');

  -- ── partite vecchie, importazioni ──
  perform pg_temp.as_user(u_adm);
  update matches set score_a = 1, score_b = 0 where id = m_old;
  perform pg_temp.as_user(null);
  update match_stamps set result_at = now() - interval '2 minutes' where match_id = m_old;
  insert into t_res values ('partite vecchie: niente avvisi per partite di più di 3 giorni fa', not exists (select 1 from public.push_due() where match_id = m_old), '');
  perform pg_temp.as_user(u_adm, 'import');
  update matches set score_a = 2, score_b = 2 where id = m_imp;
  perform pg_temp.as_user(null);
  insert into t_res values ('importazione: un risultato scritto dall''importazione non fa partire niente', not exists (select 1 from match_stamps where match_id = m_imp and result_at is not null), '');

  -- ── interruttori per tipo ──
  perform pg_temp.as_user(u_a);
  select * into pr from public.my_push_prefs();
  insert into t_res values ('interruttori: all''inizio sono tutti accesi', pr.reminder and pr.result and pr.ratings and pr.gazzetta, '');
  perform public.set_push_pref('ratings', false);
  select * into pr from public.my_push_prefs();
  insert into t_res values ('interruttori: se ne spegne uno e gli altri restano', pr.reminder and pr.result and not pr.ratings and pr.gazzetta, '');
  begin perform public.set_push_pref('boh', true); ok := false; exception when others then ok := true; end;
  insert into t_res values ('interruttori: un tipo sconosciuto è rifiutato', ok, '');
  perform pg_temp.as_user(u_b);
  select * into pr from public.my_push_prefs();
  perform pg_temp.as_user(null);
  insert into t_res values ('interruttori: ognuno ha i suoi (Bea ha il risultato spento)', not pr.result and pr.ratings, '');
  insert into t_res values ('interruttori: spegnere «pagelle» ad Ada la esclude dalle pagelle', not exists (select 1 from public.push_due() where kind = 'ratings' and user_id = u_a) and exists (select 1 from public.push_due() where kind = 'ratings' and user_id = u_b), '');
  perform pg_temp.as_user(u_a);
  begin perform * from public.push_due(); ok := false; exception when others then ok := true; end;
  insert into t_res values ('chiuso: un utente non può chiamare l''elenco di cosa mandare', ok, '');
  select count(*) into n from match_stamps;
  perform pg_temp.as_user(null);
  insert into t_res values ('chiuso: gli orari degli eventi non si leggono da fuori', n = 0, n || ' righe');

  -- ── il lavoro pianificato ──
  insert into t_res values ('cron: ogni minuto controlla se c''è qualcosa da mandare',
    not exists (select 1 from pg_extension where extname = 'pg_cron') or exists (select 1 from cron.job where jobname = 'push-events' and schedule = '* * * * *'), '');

  select string_agg(case when x.ok then '✔ ' else '✘ ' end || x.name || case when x.info <> '' then ' (' || x.info || ')' else '' end, chr(10) order by x.ok, x.name)
    into msg from t_res x where not x.ok;
  raise exception 'REPORT%', chr(10) || coalesce(msg, 'nessun problema') || chr(10) || 'Totale: ' || (select count(*) from t_res) || ' controlli, ' || (select count(*) from t_res x where not x.ok) || ' falliti';
end
$test$;
