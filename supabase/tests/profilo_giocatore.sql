-- ═══════════════════════════════════════════════════════════════════════════
--  Il giocatore collegato gestisce il proprio profilo — nel database vero, SENZA tracce
--  (alla fine il blocco si interrompe con il resoconto e tutto si annulla).
--   · foto: solo la propria (colonna e file nello spazio «photos»);
--   · nome: solo il proprio, se libero; stesso giocatore, cronologia intatta, vecchio nome tenuto come «altro nome»;
--   · scollegarsi: impossibile da soli; l'amministratore sì.
--  Eseguire con:  npx supabase db query --linked -f supabase/tests/profilo_giocatore.sql
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', case when uid is null then '' else json_build_object('sub', uid, 'role', 'authenticated')::text end, true);
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('request.headers', '{"x-forwarded-for":"203.0.113.60","user-agent":"ProfiloTest/1.0"}', true);
  if uid is null then execute 'reset role'; else execute 'set local role authenticated'; end if;
end $f$;

do $test$
declare
  u_a uuid := gen_random_uuid();   -- amministratore della lega
  u_f uuid := gen_random_uuid();   -- l'amico collegato a Steppata
  u_g uuid := gen_random_uuid();   -- un altro amico, collegato a Marco
  u_n uuid := gen_random_uuid();   -- membro non collegato a nessun giocatore
  l1 uuid := gen_random_uuid(); l2 uuid := gen_random_uuid(); m1 uuid := gen_random_uuid();
  p uuid[] := array(select gen_random_uuid() from generate_series(1, 4));  -- 1 Steppata · 2 Marco · 3 Luca (altro nome Lucone) · 4 Gigi (solo lega 2)
  tok text; ok boolean; n int; n2 int; nm text; msg text;
begin
  create temp table t_res(name text, ok boolean, info text) on commit drop;
  grant all on t_res to authenticated;
  insert into auth.users(id, email, aud, role, instance_id, raw_user_meta_data) values
    (u_a, 'pg-a@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"display_name":"Admin Prova"}'),
    (u_f, 'pg-f@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"display_name":"Amico Steppata"}'),
    (u_g, 'pg-g@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"display_name":"Amico Marco"}'),
    (u_n, 'pg-n@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"display_name":"Membro Libero"}');
  delete from audit_log;      -- (solo dentro la prova) così si leggono solo le righe di questo test

  -- preparazione: l'admin apre la lega 1 con 3 giocatori e una partita; Steppata e Marco sono collegati
  perform pg_temp.as_user(u_a);
  insert into leagues(id, name, is_public) values (l1, 'Lega 1 profilo', false);
  insert into leagues(id, name, is_public) values (l2, 'Lega 2 profilo', false);
  insert into players(id, name) values (p[1], 'Steppata'), (p[2], 'Marco'), (p[3], 'Luca'), (p[4], 'Gigi');
  insert into league_players(league_id, player_id, aliases) values (l1, p[1], '{}'), (l1, p[2], '{}'), (l1, p[3], '{Lucone}'), (l2, p[1], '{}'), (l2, p[4], '{}');
  insert into matches(id, league_id, date) values (m1, l1, '2026-10-28');
  insert into match_players(match_id, player_id, team, position, goals, rating) values (m1, p[1], 'A', 1, 2, 7.5), (m1, p[2], 'B', 2, 1, 6.5), (m1, p[3], 'B', 3, 0, 6);
  select public.create_player_invite(p[1], l1) into tok;
  perform pg_temp.as_user(u_f); perform public.accept_player_invite(tok);
  perform pg_temp.as_user(u_a); select public.create_player_invite(p[2], l1) into tok;
  perform pg_temp.as_user(u_g); perform public.accept_player_invite(tok);
  perform pg_temp.as_user(u_a); insert into league_members(league_id, user_id, role) values (l1, u_n, 'member');
  perform pg_temp.as_user(null);
  insert into t_res values ('preparazione: Steppata e Marco collegati', (select count(*) from players where id in (p[1], p[2]) and user_id is not null) = 2, '');

  -- ── FOTO ──
  perform pg_temp.as_user(u_f); perform public.set_my_photo(p[1]::text || '-1700000000000.jpg');
  perform pg_temp.as_user(null);
  insert into t_res values ('foto: il collegato cambia la sua', (select photo_path from players where id = p[1]) = p[1]::text || '-1700000000000.jpg', '');
  perform pg_temp.as_user(u_f);
  begin perform public.set_my_photo(p[2]::text || '-1.jpg'); ok := false; exception when others then ok := true; end;
  insert into t_res values ('foto: non può mettere un file di un altro giocatore', ok, '');
  begin perform public.set_my_photo('../' || p[1]::text || '.jpg'); ok := false; exception when others then ok := true; end;
  insert into t_res values ('foto: percorsi strani rifiutati', ok, '');
  perform pg_temp.as_user(u_n);
  begin perform public.set_my_photo(p[1]::text || '-2.jpg'); ok := false; exception when others then ok := true; end;
  insert into t_res values ('foto: chi non è collegato non può', ok, '');
  perform pg_temp.as_user(u_g);
  begin perform public.set_my_photo(p[1]::text || '-3.jpg'); ok := false; exception when others then ok := true; end;
  insert into t_res values ('foto: un altro amico non può cambiare quella di Steppata', ok, '');
  perform pg_temp.as_user(u_f);
  perform public.set_my_photo(null);
  perform pg_temp.as_user(null);
  insert into t_res values ('foto: il collegato la toglie', (select photo_path from players where id = p[1]) is null, '');

  -- file nello spazio «photos»
  perform pg_temp.as_user(u_f);
  insert into storage.objects(bucket_id, name) values ('photos', p[1]::text || '-1700000000001.jpg');
  perform pg_temp.as_user(null);
  insert into t_res values ('file: il collegato carica il file del suo giocatore', exists (select 1 from storage.objects where bucket_id = 'photos' and name = p[1]::text || '-1700000000001.jpg'), '');
  perform pg_temp.as_user(u_f);
  begin insert into storage.objects(bucket_id, name) values ('photos', p[2]::text || '-1700000000002.jpg'); ok := false; exception when others then ok := true; end;
  insert into t_res values ('file: non può caricare il file di un altro giocatore', ok, '');
  begin insert into storage.objects(bucket_id, name) values ('photos', 'altro-file.jpg'); ok := false; exception when others then ok := true; end;
  insert into t_res values ('file: non può caricare un file con un nome qualsiasi', ok, '');
  -- (la cancellazione dei file non si prova da qui: Supabase vieta di cancellare dalle sue tabelle senza passare dall'API)
  perform pg_temp.as_user(null);
  perform pg_temp.as_user(u_n);
  begin insert into storage.objects(bucket_id, name) values ('photos', p[1]::text || '-1700000000003.jpg'); ok := false; exception when others then ok := true; end;
  insert into t_res values ('file: chi non è collegato non carica', ok, '');

  -- ── NOME ──
  perform pg_temp.as_user(u_f);
  begin perform public.rename_my_player('Marco'); ok := false; exception when others then ok := true; end;
  insert into t_res values ('nome: «Marco» è già usato da un altro giocatore della lega', ok, '');
  begin perform public.rename_my_player('  mARCO  '); ok := false; exception when others then ok := true; end;
  insert into t_res values ('nome: maiuscole e spazi non aggirano il controllo', ok, '');
  begin perform public.rename_my_player('lucone'); ok := false; exception when others then ok := true; end;
  insert into t_res values ('nome: nemmeno l''«altro nome» di un altro giocatore', ok, '');
  begin perform public.rename_my_player('A'); ok := false; exception when others then ok := true; end;
  insert into t_res values ('nome: troppo corto rifiutato', ok, '');
  begin perform public.rename_my_player(repeat('x', 31)); ok := false; exception when others then ok := true; end;
  insert into t_res values ('nome: troppo lungo rifiutato', ok, '');
  begin perform public.rename_my_player('<b>Hack</b>'); ok := false; exception when others then ok := true; end;
  insert into t_res values ('nome: caratteri non ammessi rifiutati', ok, '');
  perform pg_temp.as_user(null);
  insert into t_res values ('nome: dopo i rifiuti non è cambiato niente', (select name from players where id = p[1]) = 'Steppata', '');

  select count(*) into n from match_players where player_id = p[1];
  perform pg_temp.as_user(u_f); select public.rename_my_player('  Gigi   Rossi ') into nm;
  perform pg_temp.as_user(null);
  insert into t_res values ('nome: cambiato (e ripulito dagli spazi in più)', nm = 'Gigi Rossi' and (select name from players where id = p[1]) = 'Gigi Rossi', nm);
  select count(*) into n2 from match_players where player_id = p[1];
  insert into t_res values ('nome: stesso giocatore, partite e pagelle intatte', n = 1 and n2 = 1 and (select user_id from players where id = p[1]) = u_f and exists (select 1 from match_players where player_id = p[1] and goals = 2 and rating = 7.5), n2 || ' partite');
  insert into t_res values ('nome: il vecchio nome resta come «altro nome» in tutte le sue leghe', (select count(*) from league_players where player_id = p[1] and 'Steppata' = any(aliases)) = 2, '');
  insert into t_res values ('nome: l''«altro nome» è registrato in ogni sua lega, una volta sola', (select count(*) from league_players where player_id = p[1] and aliases = '{Steppata}') = 2, '');
  perform pg_temp.as_user(u_g);
  begin perform public.rename_my_player('steppata'); ok := false; exception when others then ok := true; end;
  insert into t_res values ('nome: un altro amico non può prendersi il vecchio nome di Steppata', ok, '');
  perform pg_temp.as_user(u_f);
  begin perform public.rename_my_player('Gigi'); ok := false; exception when others then ok := true; end;   -- Gigi esiste nella lega 2, dove gioca anche lui
  insert into t_res values ('nome: «Gigi» è usato in un''altra sua lega: rifiutato', ok, '');
  perform public.rename_my_player('GIGI ROSSI');                  -- stesso nome con altre maiuscole: ammesso
  perform pg_temp.as_user(null);
  insert into t_res values ('nome: stesso nome con altre maiuscole ammesso', (select name from players where id = p[1]) = 'GIGI ROSSI', '');
  perform pg_temp.as_user(u_n);
  begin perform public.rename_my_player('Nuovo Nome'); ok := false; exception when others then ok := true; end;
  insert into t_res values ('nome: chi non è collegato non può', ok, '');
  perform pg_temp.as_user(u_a);
  select count(*) into n from audit_log where action = 'players.update' and entity_id = p[1]::text and actor_id = u_f and changes ? 'name';
  perform pg_temp.as_user(null);
  select count(*) into n from audit_log where action = 'players.update' and entity_id = p[1]::text and actor_id = u_f and changes ? 'name';
  insert into t_res values ('registro: il cambio nome è scritto con l''autore giusto (visibile solo al supremo)', n >= 1, n || ' righe');

  -- ── MODIFICHE DIRETTE: tutto il resto resta agli amministratori ──
  perform pg_temp.as_user(u_f);
  update players set name = 'Hack', stats = '{0,0,0,0,0,0,0,0,0,0,0}', roles = '{ATT}' where id = p[1];
  get diagnostics n = row_count;
  perform pg_temp.as_user(null);
  insert into t_res values ('modifiche dirette: nome, statistiche e ruoli non si cambiano da sé', n = 0 and (select name from players where id = p[1]) = 'GIGI ROSSI' and (select stats from players where id = p[1]) = '{5,5,5,5,5,5,5,5,5,5,5}', n || ' righe');
  perform pg_temp.as_user(u_f);
  update league_players set aliases = '{Furbo}' where player_id = p[1];
  get diagnostics n = row_count;
  perform pg_temp.as_user(null);
  insert into t_res values ('modifiche dirette: gli «altri nomi» non si toccano a mano', n = 0, n || ' righe');

  -- ── SCOLLEGARE ──
  insert into t_res values ('scollegarsi: la funzione unlink_me non esiste più', to_regprocedure('public.unlink_me()') is null, '');
  perform pg_temp.as_user(u_f);
  begin update players set user_id = null where id = p[1]; get diagnostics n = row_count; ok := (n = 0); exception when others then ok := true; end;
  insert into t_res values ('scollegarsi: non si può nemmeno aggiornando la colonna', ok, '');
  begin perform public.unlink_player(p[1]); ok := false; exception when others then ok := true; end;
  insert into t_res values ('scollegarsi: unlink_player rifiutato al giocatore stesso', ok, '');
  perform pg_temp.as_user(u_g);
  begin perform public.unlink_player(p[1]); ok := false; exception when others then ok := true; end;
  insert into t_res values ('scollegare: un altro amico non può scollegare Steppata', ok, '');
  perform pg_temp.as_user(u_a);
  perform public.unlink_player(p[1]);
  perform pg_temp.as_user(null);
  insert into t_res values ('scollegare: l''amministratore sì', (select user_id from players where id = p[1]) is null, '');
  insert into t_res values ('scollegare: il giocatore, il nome nuovo e la cronologia restano', (select name from players where id = p[1]) = 'GIGI ROSSI' and exists (select 1 from match_players where player_id = p[1] and goals = 2), '');

  select string_agg(case when x.ok then '✔ ' else '✘ ' end || x.name || case when x.info <> '' then ' (' || x.info || ')' else '' end, chr(10) order by x.ok, x.name)
    into msg from t_res x where not x.ok;
  raise exception 'REPORT%', chr(10) || coalesce(msg, 'nessun problema') || chr(10) || 'Totale: ' || (select count(*) from t_res) || ' controlli, ' || (select count(*) from t_res x where not x.ok) || ' falliti';
end
$test$;
