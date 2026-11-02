-- ═══════════════════════════════════════════════════════════════════════════
--  Panchina nel database vero, SENZA tracce (alla fine il blocco si interrompe con il resoconto e tutto si annulla):
--  l'amministratore toglie un giocatore dalla lega (storia intatta, account fuori dalla lega, inviti annullati);
--  chi non ha altre leghe finisce in Panchina, che vedono gli amministratori; si ripesca per un'altra lega;
--  solo l'amministratore supremo cancella (e solo chi non ha mai giocato).
--  Eseguire con:  npx supabase db query --linked -f supabase/tests/panchina.sql
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', case when uid is null then '' else json_build_object('sub', uid, 'role', 'authenticated')::text end, true);
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('request.headers', '{"x-forwarded-for":"203.0.113.70","user-agent":"PanchinaTest/1.0"}', true);
  if uid is null then execute 'reset role'; else execute 'set local role authenticated'; end if;
end $f$;

do $test$
declare
  u_a uuid := gen_random_uuid();   -- amministratore lega 1
  u_b uuid := gen_random_uuid();   -- amministratore lega 2
  u_m uuid := gen_random_uuid();   -- solo membro della lega 1 (collegato a Marco)
  u_x uuid := gen_random_uuid();   -- amministratore della lega 1 collegato a Ada
  u_s uuid := gen_random_uuid();   -- amministratore supremo
  u_n uuid := gen_random_uuid();   -- membro della lega 1, non collegato
  l1 uuid := gen_random_uuid(); l2 uuid := gen_random_uuid(); m1 uuid := gen_random_uuid(); m2 uuid := gen_random_uuid();
  p uuid[] := array(select gen_random_uuid() from generate_series(1, 6));  -- 1 Marco (account u_m) · 2 Luca · 3 Ada (account u_x, admin) · 4 Gino (mai giocato) · 5 Zeno (lega 1 e 2) · 6 Orfano
  tok text; ok boolean; n int; n2 int; msg text; res boolean;
begin
  create temp table t_res(name text, ok boolean, info text) on commit drop;
  grant all on t_res to authenticated;
  insert into auth.users(id, email, aud, role, instance_id, raw_user_meta_data) values
    (u_a, 'pc-a@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"display_name":"Admin Uno"}'),
    (u_b, 'pc-b@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"display_name":"Admin Due"}'),
    (u_m, 'pc-m@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"display_name":"Marco Membro"}'),
    (u_x, 'pc-x@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"display_name":"Ada Admin"}'),
    (u_s, 'pc-s@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"display_name":"Sara Suprema"}'),
    (u_n, 'pc-n@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"display_name":"Nino Normale"}');
  insert into platform_admins(user_id) values (u_s);

  -- preparazione (come amministratore di sistema: le leghe le crea solo il supremo)
  insert into leagues(id, name, is_public, owner_id, created_by) values (l1, 'Lega Panchina 1', false, u_a, u_a), (l2, 'Lega Panchina 2', false, u_b, u_b);
  insert into players(id, name, created_by) values (p[1], 'Marco', u_a), (p[2], 'Luca', u_a), (p[3], 'Ada', u_a), (p[4], 'Gino', u_a), (p[5], 'Zeno', u_a), (p[6], 'Orfano', u_a);
  insert into league_players(league_id, player_id, aliases) values (l1, p[1], '{}'), (l1, p[2], '{Lucone}'), (l1, p[3], '{}'), (l1, p[4], '{}'), (l1, p[5], '{}'), (l2, p[5], '{}');
  insert into league_members(league_id, user_id, role) values (l1, u_a, 'admin'), (l1, u_x, 'admin'), (l1, u_m, 'member'), (l1, u_n, 'member'), (l2, u_b, 'admin')
    on conflict (league_id, user_id) do update set role = excluded.role;
  perform set_config('app.linking', 'on', true);
  update players set user_id = u_m where id = p[1];
  update players set user_id = u_x where id = p[3];
  perform set_config('app.linking', 'off', true);
  insert into matches(id, league_id, date, score_a, score_b) values (m1, l1, '2026-10-28', 5, 3);
  insert into match_players(match_id, player_id, team, position, goals, rating) values (m1, p[1], 'A', 1, 2, 7.5), (m1, p[2], 'B', 2, 1, 6.5), (m1, p[5], 'B', 3, 0, 6);
  insert into player_invites(player_id, league_id, created_by) values (p[2], l1, u_a);
  select token into tok from player_invites where player_id = p[2];
  insert into player_claims(league_id, player_id, user_id, status) values (l1, p[2], u_n, 'pending');
  delete from audit_log;
  insert into t_res values ('preparazione', (select count(*) from league_players where league_id = l1) = 5, '');

  -- ── chi può togliere un giocatore dalla lega ──
  perform pg_temp.as_user(u_m);
  begin perform public.remove_player_from_league(l1, p[2]); ok := false; exception when others then ok := true; end;
  insert into t_res values ('rimuovere: un membro non può', ok, '');
  perform pg_temp.as_user(u_b);
  begin perform public.remove_player_from_league(l1, p[2]); ok := false; exception when others then ok := true; end;
  insert into t_res values ('rimuovere: l''amministratore di un''altra lega non può', ok, '');
  perform pg_temp.as_user(u_a);
  begin perform public.remove_player_from_league(l1, p[6]); ok := false; exception when others then ok := true; end;
  insert into t_res values ('rimuovere: chi non è nella lega → errore', ok, '');
  begin perform public.remove_player_from_league(l1, p[3]); ok := false; exception when others then ok := true; end;
  perform pg_temp.as_user(null);
  insert into t_res values ('rimuovere: chi è collegato a un amministratore → rifiutato (prima si toglie il ruolo)', ok and exists (select 1 from league_players where league_id = l1 and player_id = p[3]), '');

  -- ── rimozione di Luca (giocato una partita, un invito e una richiesta in sospeso) ──
  perform pg_temp.as_user(u_a);
  select public.remove_player_from_league(l1, p[2]) into res;
  perform pg_temp.as_user(null);
  insert into t_res values ('rimozione: Luca esce dalla Rosa', not exists (select 1 from league_players where league_id = l1 and player_id = p[2]), '');
  insert into t_res values ('rimozione: senza altre leghe → è in Panchina', res is true, '');
  insert into t_res values ('rimozione: la sua storia (partita e pagella) resta', exists (select 1 from match_players where match_id = m1 and player_id = p[2] and goals = 1 and rating = 6.5), '');
  insert into t_res values ('rimozione: il giocatore esiste ancora', exists (select 1 from players where id = p[2]), '');
  insert into t_res values ('rimozione: l''invito aperto è annullato', (select revoked from player_invites where token = tok), '');
  insert into t_res values ('rimozione: la richiesta «sono io» in sospeso è tolta', not exists (select 1 from player_claims where player_id = p[2] and league_id = l1), '');

  -- ── la storia di chi è uscito si legge ancora (partite della lega) ──
  perform pg_temp.as_user(u_n);
  select count(*) into n from players where id = p[2];
  select count(*) into n2 from match_players where match_id = m1;
  perform pg_temp.as_user(null);
  insert into t_res values ('storia: un membro legge ancora il giocatore uscito (per le partite vecchie)', n = 1 and n2 = 3, n || ' / ' || n2);
  perform pg_temp.as_user(u_b);
  select count(*) into n from players where id = p[2];
  perform pg_temp.as_user(null);
  insert into t_res values ('storia: l''amministratore di un''altra lega NON lo legge con la tabella (solo dalla Panchina)', n = 0, n || ' righe');

  -- ── rimozione di Marco: collegato a un account semplice membro → esce anche dalla lega ──
  perform pg_temp.as_user(u_a);
  select public.remove_player_from_league(l1, p[1]) into res;
  perform pg_temp.as_user(null);
  insert into t_res values ('account: Marco esce dalla lega (non è più membro)', not exists (select 1 from league_members where league_id = l1 and user_id = u_m), '');
  insert into t_res values ('account: ma il collegamento giocatore-account resta', (select user_id from players where id = p[1]) = u_m, '');
  perform pg_temp.as_user(u_m);
  select count(*) into n from matches where league_id = l1;
  perform pg_temp.as_user(null);
  insert into t_res values ('account: Marco non vede più la lega', n = 0, n || ' partite');

  -- ── giocatore in due leghe: tolto da una, resta nell''altra (non va in Panchina) ──
  perform pg_temp.as_user(u_a);
  select public.remove_player_from_league(l1, p[5]) into res;
  perform pg_temp.as_user(null);
  insert into t_res values ('due leghe: Zeno resta in lega 2, non va in Panchina', res is false and exists (select 1 from league_players where league_id = l2 and player_id = p[5]), '');

  -- ── la Panchina ──
  perform pg_temp.as_user(u_a);
  select count(*) into n from public.bench_players() where name in ('Marco', 'Luca', 'Orfano');
  select count(*) into n2 from public.bench_players() where name in ('Ada', 'Gino', 'Zeno');
  perform pg_temp.as_user(null);
  insert into t_res values ('panchina: l''amministratore vede chi è senza lega', n = 3, n || ' su 3');
  insert into t_res values ('panchina: non compare chi gioca ancora in una lega', n2 = 0, n2 || '');
  perform pg_temp.as_user(u_b);
  select count(*) into n from public.bench_players() where name = 'Luca';
  perform pg_temp.as_user(null);
  insert into t_res values ('panchina: la vede anche l''amministratore di un''altra lega', n = 1, '');
  perform pg_temp.as_user(u_n);
  begin perform * from public.bench_players(); ok := false; exception when others then ok := true; end;
  insert into t_res values ('panchina: un membro semplice non la vede', ok, '');
  perform pg_temp.as_user(u_s);
  select count(*) into n from public.bench_players() where name = 'Luca';
  perform pg_temp.as_user(null);
  insert into t_res values ('panchina: la vede l''amministratore supremo', n = 1, '');

  -- ── dalla Panchina alla lega 2 ──
  perform pg_temp.as_user(u_a);
  begin perform public.add_player_to_league(l2, p[2]); ok := false; exception when others then ok := true; end;
  insert into t_res values ('aggiungere: chi non amministra quella lega non può', ok, '');
  perform pg_temp.as_user(u_b);
  begin perform public.add_player_to_league(l2, p[3]); ok := false; exception when others then ok := true; end;
  insert into t_res values ('aggiungere: un giocatore che gioca già in una lega non si «ruba»', ok, '');
  perform public.add_player_to_league(l2, p[2]);
  perform public.add_player_to_league(l2, p[1]);
  perform pg_temp.as_user(null);
  insert into t_res values ('aggiungere: Luca è nella lega 2', exists (select 1 from league_players where league_id = l2 and player_id = p[2]), '');
  insert into t_res values ('aggiungere: Marco ha di nuovo l''accesso (membro della lega 2)', exists (select 1 from league_members where league_id = l2 and user_id = u_m and role = 'member'), '');
  insert into t_res values ('aggiungere: la sua storia della lega 1 non si è spostata', (select count(*) from match_players where match_id = m1 and player_id = p[2]) = 1, '');

  -- ── cancellare per sempre ──
  perform pg_temp.as_user(u_a);
  begin perform public.delete_bench_player(p[6]); ok := false; exception when others then ok := true; end;
  insert into t_res values ('cancellare: l''amministratore di lega non può', ok, '');
  perform pg_temp.as_user(u_s);
  begin perform public.delete_bench_player(p[3]); ok := false; exception when others then ok := true; end;
  insert into t_res values ('cancellare: non si cancella chi gioca ancora in una lega', ok, '');
  perform public.delete_bench_player(p[6]);
  perform pg_temp.as_user(null);
  insert into t_res values ('cancellare: il supremo cancella chi non ha mai giocato (Orfano)', not exists (select 1 from players where id = p[6]), '');
  -- Luca è in lega 2 (tolto dalla panchina); proviamo con chi ha storia ma è in panchina: Marco → rimosso dalla lega 2
  perform pg_temp.as_user(u_b);
  select public.remove_player_from_league(l2, p[1]) into res;
  perform pg_temp.as_user(u_s);
  begin perform public.delete_bench_player(p[1]); ok := false; exception when others then ok := true; end;
  perform pg_temp.as_user(null);
  insert into t_res values ('cancellare: chi ha partite nella storia non si cancella (resta in Panchina)', ok and exists (select 1 from players where id = p[1]), '');
  -- l'eliminazione diretta dalla tabella segue la stessa regola
  perform pg_temp.as_user(u_a);
  delete from players where id = p[1];
  get diagnostics n = row_count;
  perform pg_temp.as_user(null);
  insert into t_res values ('cancellare: neanche con una cancellazione diretta', n = 0 and exists (select 1 from players where id = p[1]), n || ' righe');
  perform pg_temp.as_user(u_a);
  delete from players where id = p[4];
  get diagnostics n = row_count;
  perform pg_temp.as_user(null);
  insert into t_res values ('cancellare: chi è ancora in una lega non si cancella da tabella', n = 0, '');

  -- ── «archived» non esiste più ──
  insert into t_res values ('niente archiviazione: la colonna è sparita', not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'league_players' and column_name = 'archived'), '');
  perform pg_temp.as_user(u_a);
  select count(*) into n from public.league_players_status(l1);
  select count(*) into n2 from public.players_unclaimed(l1);
  perform pg_temp.as_user(null);
  insert into t_res values ('le funzioni di prima funzionano ancora (stato collegamenti, giocatori liberi)', n = (select count(*) from league_players where league_id = l1) and n2 >= 0, n || ' in stato, ' || (select count(*) from league_players where league_id = l1) || ' in Rosa');

  select string_agg(case when x.ok then '✔ ' else '✘ ' end || x.name || case when x.info <> '' then ' (' || x.info || ')' else '' end, chr(10) order by x.ok, x.name)
    into msg from t_res x where not x.ok;
  raise exception 'REPORT%', chr(10) || coalesce(msg, 'nessun problema') || chr(10) || 'Totale: ' || (select count(*) from t_res) || ' controlli, ' || (select count(*) from t_res x where not x.ok) || ' falliti';
end
$test$;
