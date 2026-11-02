-- ═══════════════════════════════════════════════════════════════════════════
--  Prova del registro attività sul database vero, SENZA lasciare tracce:
--  tutto gira dentro un blocco che alla fine si interrompe di proposito con il resoconto (così si annulla da solo).
--  Utenti, leghe e partite di prova esistono solo dentro la prova.
--  Eseguire con:  npx supabase db query --linked -f supabase/tests/registro_attivita.sql
--  Il risultato compare nel messaggio "REPORT" (✔ = ok, ✘ = problema).
-- ═══════════════════════════════════════════════════════════════════════════
do $test$
declare
  u_adm uuid := gen_random_uuid(); u_mem uuid := gen_random_uuid(); u_sup uuid := gen_random_uuid();
  lg uuid := gen_random_uuid(); m1 uuid := gen_random_uuid();
  p uuid[] := array(select gen_random_uuid() from generate_series(1, 12));
  n0 int; n1 int; r record; ok boolean; txs int; msg text;
  report text := '';
begin
  create temp table t_res(name text, ok boolean, info text) on commit drop;

  -- utenti di prova (si cancellano con l'annullamento finale)
  insert into auth.users(id, email, aud, role, instance_id, raw_user_meta_data) values
    (u_adm, 'prova-adm@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"display_name":"Admin Prova"}'),
    (u_mem, 'prova-mem@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"display_name":"Membro Prova"}'),
    (u_sup, 'prova-sup@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"display_name":"Supremo Prova"}');

  -- ── 1. lega creata dall'amministratore (con IP e dispositivo) ───────────
  perform set_config('request.headers', '{"x-forwarded-for":"203.0.113.7, 10.0.0.1","user-agent":"ProvaTelefono/1.0"}', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u_adm::text, true);
  insert into platform_admins(user_id) values (u_adm);   -- (per ora le leghe le crea solo l'amministratore supremo: lo è solo per questa riga)
  set local role authenticated;
  insert into leagues(id, name, is_public) values (lg, 'Lega Prova Registro', false);
  reset role;
  delete from platform_admins where user_id = u_adm;
  delete from audit_log where entity = 'platform_admins';
  select * into r from audit_log where action = 'leagues.insert' and league_id = lg;
  insert into t_res values ('lega creata: riga con persona, lega, IP e dispositivo',
    r.actor_id = u_adm and r.actor_name = 'Admin Prova' and r.league_name = 'Lega Prova Registro' and host(r.ip) = '203.0.113.7' and r.user_agent = 'ProvaTelefono/1.0' and r.source = 'app' and r.grp = 'leghe',
    coalesce(r.actor_name, '-') || ' / ' || coalesce(host(r.ip), '-'));
  insert into t_res values ('creatore registrato come membro admin', exists (select 1 from audit_log where action = 'league_members.insert' and league_id = lg), '');

  -- ── 2. giocatori, partita e 10 pagelle ───────────────────────────────────
  set local role authenticated;
  insert into players(id, name) select p[i], 'Giocatore ' || i from generate_series(1, 12) i;
  insert into league_players(league_id, player_id) select lg, p[i] from generate_series(1, 12) i;
  insert into matches(id, league_id, date) values (m1, lg, '2026-10-28');
  insert into match_players(match_id, player_id, team, position) select m1, p[i], case when i <= 5 then 'A' else 'B' end, i from generate_series(1, 10) i;
  reset role;
  insert into t_res values ('giocatori e partita registrati', (select count(*) from audit_log where action = 'league_players.insert' and league_id = lg) = 12 and (select count(*) from audit_log where action = 'players.insert' and entity_label like 'Giocatore %') = 12 and exists (select 1 from audit_log where action = 'matches.insert' and league_id = lg), '');

  select count(*) into n0 from audit_log;
  set local role authenticated;
  update match_players set rating = 6.5, goals = 1 where match_id = m1;
  reset role;
  select count(*), count(distinct tx) into n1, txs from audit_log where action = 'match_players.update' and league_id = lg;
  insert into t_res values ('10 pagelle salvate insieme: 10 righe, stessa operazione', n1 = 10 and txs = 1, n1 || ' righe, ' || txs || ' operazione');
  select * into r from audit_log where action = 'match_players.update' and entity_label like 'Giocatore 1 · %';
  insert into t_res values ('pagella: prima → dopo e nomi leggibili', (r.changes -> 'rating') = '[null, 6.5]'::jsonb and r.entity_label = 'Giocatore 1 · partita del 28/10/2026', r.entity_label || ' ' || coalesce(r.changes::text, '-'));

  -- ── 3. aggiornamenti che non cambiano niente ─────────────────────────────
  select count(*) into n0 from audit_log;
  set local role authenticated;
  update match_players set rating = rating where match_id = m1;
  update players set name = name where id = p[1];
  update players set updated_at = now() + interval '1 second' where id = p[2];
  reset role;
  select count(*) into n1 from audit_log;
  insert into t_res values ('aggiornamenti senza cambiamenti (anche solo updated_at): nessuna riga', n1 = n0, (n1 - n0) || ' righe nuove');

  -- ── 4. voto, titolo e descrizione ────────────────────────────────────────
  set local role authenticated;
  update match_players set titolo = 'LEADER', descrizione = 'Bella partita' where match_id = m1 and player_id = p[3];
  update players set stats = array[7,5,5,5,5,5,5,5,5,5,5]::smallint[] where id = p[3];
  reset role;
  insert into t_res values ('titolo e descrizione registrati', exists (select 1 from audit_log where action = 'match_players.update' and changes -> 'titolo' = '[null, "LEADER"]'::jsonb), '');
  insert into t_res values ('statistiche giocatore registrate (gruppo giocatori)', exists (select 1 from audit_log where action = 'players.update' and grp = 'giocatori' and changes ? 'stats' and league_id = lg), '');

  -- ── 5. ruoli ─────────────────────────────────────────────────────────────
  set local role authenticated;
  insert into league_members(league_id, user_id, role) values (lg, u_mem, 'member');
  perform set_member_role(lg, u_mem, 'redazione');
  reset role;
  select * into r from audit_log where action = 'league_members.role' and league_id = lg;
  insert into t_res values ('cambio di ruolo: prima → dopo', (r.changes -> 'role') = '["member", "redazione"]'::jsonb and r.entity_label = 'Membro Prova', coalesce(r.changes::text, '-'));

  -- ── 6. albo: solo il cambio di stato ─────────────────────────────────────
  insert into albo(league_id, season_key, status, rows) values (lg, '2026-AUT', 'aperta', '[]');
  select count(*) into n0 from audit_log where entity = 'albo';
  update albo set rows = '[{"x":1}]' where league_id = lg;
  select count(*) into n1 from audit_log where entity = 'albo';
  insert into t_res values ('albo: il ricalcolo non si registra', n1 = n0, '');
  update albo set status = 'chiusa' where league_id = lg;
  insert into t_res values ('albo: il cambio di stato sì', exists (select 1 from audit_log where entity = 'albo' and action = 'albo.update' and changes -> 'status' = '["aperta", "chiusa"]'::jsonb), '');

  -- ── 7. chi può leggere, modificare o cancellare il registro ──────────────
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  insert into platform_admins(user_id) values (u_sup);
  insert into t_res values ('amministratore supremo aggiunto: riga di sistema', exists (select 1 from audit_log where action = 'platform_admins.insert' and source = 'sistema' and actor_id is null), '');
  for r in select * from (values (u_mem, 'membro/redazione'), (u_adm, 'admin di lega'), (u_sup, 'supremo')) v(u, who) loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.u, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', r.u::text, true);
    set local role authenticated;
    select count(*) into n1 from audit_log;
    reset role;
    insert into t_res values ('lettura registro: ' || r.who, case when r.who = 'supremo' then n1 > 0 else n1 = 0 end, n1 || ' righe visibili');
  end loop;
  -- tentativi di scrittura da parte del supremo e dell'admin (devono fallire)
  for r in select * from (values (u_sup, 'supremo'), (u_adm, 'admin di lega')) v(u, who) loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.u, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', r.u::text, true);
    set local role authenticated;
    begin update audit_log set actor_name = 'falso'; ok := false; exception when others then ok := true; end;
    reset role;
    insert into t_res values ('modifica del registro vietata: ' || r.who, ok, '');
    set local role authenticated;
    begin delete from audit_log; ok := false; exception when others then ok := true; end;
    reset role;
    insert into t_res values ('cancellazione del registro vietata: ' || r.who, ok, '');
    set local role authenticated;
    begin insert into audit_log(action, entity, grp) values ('falso', 'x', 'account'); ok := false; exception when others then ok := true; end;
    reset role;
    insert into t_res values ('inserimento diretto nel registro vietato: ' || r.who, ok, '');
    set local role authenticated;
    begin perform public.audit_event('falso', 'x', null, null, null, 'account', null); ok := false; exception when others then ok := true; end;
    reset role;
    insert into t_res values ('funzione interna di scrittura non richiamabile: ' || r.who, ok, '');
  end loop;
  insert into t_res values ('nessuna riga falsificata', not exists (select 1 from audit_log where actor_name = 'falso' or action = 'falso'), '');

  -- ── 8. importazione: origine "import" ────────────────────────────────────
  perform set_config('request.headers', '{"x-audit-source":"import","user-agent":"script"}', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  update players set name = 'Giocatore 4 (import)' where id = p[4];
  select * into r from audit_log where action = 'players.update' and changes -> 'name' = '["Giocatore 4", "Giocatore 4 (import)"]'::jsonb;
  insert into t_res values ('script di importazione: origine "import"', r.source = 'import' and r.actor_id is null, coalesce(r.source, '-'));
  perform set_config('request.headers', '', true);
  update players set name = 'Giocatore 5 (sql)' where id = p[5];
  select * into r from audit_log where action = 'players.update' and changes -> 'name' = '["Giocatore 5", "Giocatore 5 (sql)"]'::jsonb;
  insert into t_res values ('azione da SQL Editor: origine "sistema"', r.source = 'sistema' and r.ip is null, coalesce(r.source, '-'));

  -- ── 9. accessi dall'app (log_event) ──────────────────────────────────────
  perform set_config('request.headers', '{"x-forwarded-for":"198.51.100.9","user-agent":"Safari"}', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_mem, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u_mem::text, true);
  set local role authenticated;
  perform log_event('auth.login');
  perform log_event('auth.login');           -- doppione entro 10 secondi: una sola riga
  begin perform log_event('azione.strana'); ok := false; exception when others then ok := true; end;
  reset role;
  insert into t_res values ('accesso registrato una volta, con IP', (select count(*) from audit_log where action = 'auth.login' and actor_id = u_mem and host(ip) = '198.51.100.9') = 1, '');
  insert into t_res values ('azione non prevista rifiutata', ok, '');
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  perform log_event('auth.login');            -- senza accesso: ignorato
  perform log_event('auth.password_reset', 'prova-mem@example.invalid');
  perform log_event('auth.password_reset', 'nessuno@example.invalid');
  reset role;
  insert into t_res values ('senza accesso solo la richiesta di nuova password, solo per email esistente',
    (select count(*) from audit_log where action = 'auth.password_reset' and actor_id = u_mem) = 1
    and (select count(*) from audit_log where action = 'auth.login' and actor_id is null) = 0, '');

  -- ── 10. unisci giocatori: una sola riga ──────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', u_adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u_adm::text, true);
  select count(*) into n0 from audit_log where action = 'match_players.update';
  set local role authenticated;
  perform merge_players(p[1], p[11]);
  reset role;
  perform set_config('app.audit_skip', '', true);
  select count(*) into n1 from audit_log where action = 'match_players.update';
  insert into t_res values ('giocatori uniti: una riga «players.merge»', (select count(*) from audit_log where action = 'players.merge' and league_id = lg) = 1, '');
  insert into t_res values ('giocatori uniti: le pagelle spostate non riempiono il registro', n1 = n0, '');

  -- ── 11. partita eliminata: una riga, niente cascata ──────────────────────
  select count(*) into n0 from audit_log where action = 'match_players.delete';
  set local role authenticated;
  delete from matches where id = m1;
  reset role;
  select count(*) into n1 from audit_log where action = 'match_players.delete';
  insert into t_res values ('partita eliminata: una riga, le pagelle a cascata non si ripetono', exists (select 1 from audit_log where action = 'matches.delete' and league_id = lg) and n1 = n0, '');

  -- ── 12. conservazione: pulizia dopo 60 giorni (date simulate) ────────────
  insert into audit_log(at, action, entity, grp, ip, user_agent, actor_name) values
    (now() - interval '61 days', 'prova.vecchia', 'x', 'account', '1.1.1.1', 'vecchio', 'x'),
    (now() - interval '10 days', 'prova.recente', 'x', 'account', '2.2.2.2', 'recente', 'x');
  perform public.audit_cleanup();
  insert into t_res values ('dopo 61 giorni la riga sparisce, quella recente resta',
    not exists (select 1 from audit_log where action = 'prova.vecchia') and exists (select 1 from audit_log where action = 'prova.recente' and ip is not null), '');
  update app_settings set value = '5'::jsonb where key = 'audit_ip_retention_days';       -- solo dentro la prova
  perform public.audit_cleanup();
  select * into r from audit_log where action = 'prova.recente';
  insert into t_res values ('IP e dispositivo si svuotano prima (impostazione separata), la riga resta', r.id is not null and r.ip is null and r.user_agent is null, '');

  -- ── 13. account cancellato ───────────────────────────────────────────────
  perform set_config('request.headers', '{"x-forwarded-for":"198.51.100.9","user-agent":"Safari"}', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_mem, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u_mem::text, true);
  set local role authenticated;
  perform delete_my_account();
  reset role;
  perform set_config('app.audit_skip', '', true);
  select count(*) into n1 from audit_log where actor_id = u_mem;
  insert into t_res values ('account cancellato: le sue righe restano, anonime',
    n1 = 0 and exists (select 1 from audit_log where actor_name = 'utente cancellato' and action = 'auth.login' and ip is null and user_agent is null)
    and exists (select 1 from audit_log where action = 'account.delete' and actor_name = 'utente cancellato' and entity_label = 'utente cancellato')
    and not exists (select 1 from audit_log where entity_label like '%Membro Prova%'), '');

  -- ── resoconto (interrompe la prova: tutto si annulla) ────────────────────
  select string_agg(case when x.ok then '✔ ' else '✘ ' end || x.name || case when x.info <> '' then ' (' || x.info || ')' else '' end, chr(10) order by x.ok, x.name)
    into msg from t_res x where not x.ok;
  raise exception 'REPORT%', chr(10) || coalesce(msg, 'nessun problema') || chr(10) || 'Totale: ' || (select count(*) from t_res) || ' controlli, ' || (select count(*) from t_res x where not x.ok) || ' falliti';
end
$test$;
