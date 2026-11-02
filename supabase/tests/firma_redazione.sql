-- ═══════════════════════════════════════════════════════════════════════════
--  Firma «Redazione <nome>» nel database vero, SENZA tracce (alla fine tutto si annulla):
--  si registra chi scrive per primo titolo o descrizione di una partita; non per le importazioni, non per un testo vuoto,
--  non per le modifiche ad altri campi; il nome è quello del profilo (o prima della @, mai l'email intera);
--  la leggono i membri della lega, non gli estranei; nessuno la scrive a mano.
--  Eseguire con:  npx supabase db query --linked --yes -f supabase/tests/firma_redazione.sql
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function pg_temp.as_user(uid uuid, src text default null) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', case when uid is null then '' else json_build_object('sub', uid, 'role', 'authenticated')::text end, true);
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('request.headers', case when src = 'import' then '{"x-audit-source":"import","user-agent":"import/1.0"}' else '{"x-forwarded-for":"203.0.113.97","user-agent":"Firma/1.0"}' end, true);
  if uid is null then execute 'reset role'; else execute 'set local role authenticated'; end if;
end $f$;

do $test$
declare
  u_a uuid := gen_random_uuid();   -- amministratore
  u_r uuid := gen_random_uuid();   -- redazione con nome nel profilo
  u_e uuid := gen_random_uuid();   -- redazione SENZA nome nel profilo (solo email)
  u_m uuid := gen_random_uuid();   -- solo membro
  u_x uuid := gen_random_uuid();   -- estraneo (altra lega)
  l1 uuid := gen_random_uuid(); l2 uuid := gen_random_uuid();
  m1 uuid := gen_random_uuid(); m2 uuid := gen_random_uuid(); m3 uuid := gen_random_uuid(); m4 uuid := gen_random_uuid();
  p uuid[] := array(select gen_random_uuid() from generate_series(1, 4));
  ok boolean; n int; nm text; msg text;
begin
  create temp table t_res(name text, ok boolean, info text) on commit drop;
  grant all on t_res to authenticated;
  insert into auth.users(id, email, aud, role, instance_id, raw_user_meta_data) values
    (u_a, 'fr-a@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"display_name":"Admin Uno"}'),
    (u_r, 'fr-r@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"display_name":"Luca Rossi"}'),
    (u_e, 'segretissima.email@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'),
    (u_m, 'fr-m@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"display_name":"Membro"}'),
    (u_x, 'fr-x@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"display_name":"Estraneo"}');
  -- il profilo si crea con l'utente: il nome dei due «senza nome» si toglie
  update profiles set display_name = null where id = u_e;
  insert into leagues(id, name, is_public, owner_id, created_by) values (l1, 'Lega Firma 1', false, u_a, u_a), (l2, 'Lega Firma 2', false, u_x, u_x);
  insert into league_members(league_id, user_id, role) values (l1, u_a, 'admin'), (l1, u_r, 'redazione'), (l1, u_e, 'redazione'), (l1, u_m, 'member'), (l2, u_x, 'admin')
    on conflict (league_id, user_id) do update set role = excluded.role;
  insert into players(id, name) values (p[1], 'Ada'), (p[2], 'Bea'), (p[3], 'Carla'), (p[4], 'Dina');
  insert into league_players(league_id, player_id) select l1, x from unnest(p) x;
  insert into matches(id, league_id, date, score_a, score_b) values (m1, l1, '2026-10-01', 5, 3), (m2, l1, '2026-10-08', 2, 2), (m3, l1, '2026-10-15', 1, 0), (m4, l1, '2026-10-22', 4, 4);
  insert into match_players(match_id, player_id, team, position, rating) select mm, x, 'A', i, 6
    from unnest(array[m1, m2, m3, m4]) mm, unnest(p) with ordinality t(x, i);
  delete from audit_log; delete from match_editors;

  -- ── la redazione scrive: la firma è sua ──
  perform pg_temp.as_user(u_r);
  update match_players set descrizione = 'Sempre al posto giusto.' where match_id = m1 and player_id = p[1];
  perform pg_temp.as_user(null);
  select name into nm from match_editors where match_id = m1;
  insert into t_res values ('firma: la registra chi scrive la prima descrizione, col nome del profilo', nm = 'Luca Rossi', coalesce(nm, 'nessuna'));
  insert into t_res values ('firma: è collegata alla lega e alla persona', exists (select 1 from match_editors where match_id = m1 and league_id = l1 and user_id = u_r), '');
  -- poi scrive l'amministratore: la firma resta di chi ha scritto per primo
  perform pg_temp.as_user(u_a);
  update match_players set titolo = 'IL MURO' where match_id = m1 and player_id = p[2];
  perform pg_temp.as_user(null);
  insert into t_res values ('firma: chi scrive dopo non la cambia (vale il primo)', (select name from match_editors where match_id = m1) = 'Luca Rossi', '');

  -- ── senza nome nel profilo: la parte prima della @, mai l'email intera ──
  perform pg_temp.as_user(u_e);
  update match_players set titolo = 'IL TOP' where match_id = m2 and player_id = p[1];
  perform pg_temp.as_user(null);
  select name into nm from match_editors where match_id = m2;
  insert into t_res values ('nome: senza nome nel profilo si usa la parte prima della @', nm = 'segretissima.email', coalesce(nm, 'nessuna'));
  insert into t_res values ('nome: l''indirizzo email intero non compare mai', not exists (select 1 from match_editors where name like '%@%' or name like '%example.invalid%'), '');

  -- ── quando NON si registra ──
  perform pg_temp.as_user(u_a);
  update match_players set rating = 7 where match_id = m3 and player_id = p[1];                   -- cambia il voto, non i testi
  perform pg_temp.as_user(u_r);
  update match_players set titolo = '   ', descrizione = '' where match_id = m3 and player_id = p[2];  -- testo vuoto
  perform pg_temp.as_user(null);
  insert into t_res values ('non si registra: cambiando il voto o scrivendo un testo vuoto', not exists (select 1 from match_editors where match_id = m3), '');
  perform pg_temp.as_user(u_a, 'import');
  update match_players set descrizione = 'Testo importato.' where match_id = m4 and player_id = p[1];
  perform pg_temp.as_user(null);
  insert into t_res values ('non si registra: per le importazioni dal vecchio sistema', not exists (select 1 from match_editors where match_id = m4), '');
  update match_players set descrizione = 'Scritto dal SQL Editor.' where match_id = m4 and player_id = p[2];
  insert into t_res values ('non si registra: per chi scrive senza account (SQL Editor)', not exists (select 1 from match_editors where match_id = m4), '');

  -- ── chi legge ──
  perform pg_temp.as_user(u_m);
  select count(*) into n from match_editors;
  perform pg_temp.as_user(u_x);
  select count(*) into n from match_editors where league_id = l1;
  perform pg_temp.as_user(null);
  insert into t_res values ('lettura: un estraneo non vede le firme di un''altra lega', n = 0, n || ' righe');
  perform pg_temp.as_user(u_m);
  select count(*) into n from match_editors where league_id = l1;
  perform pg_temp.as_user(null);
  insert into t_res values ('lettura: un membro vede le firme della sua lega', n = 2, n || ' righe');

  -- ── nessuno la scrive a mano ──
  perform pg_temp.as_user(u_a);
  begin insert into match_editors(match_id, league_id, user_id, name) values (m3, l1, u_a, 'Finto'); ok := false; exception when others then ok := true; end;
  insert into t_res values ('scrittura: nemmeno l''amministratore può inserire una firma a mano', ok, '');
  update match_editors set name = 'Finto' where match_id = m1;
  get diagnostics n = row_count;
  perform pg_temp.as_user(null);
  insert into t_res values ('scrittura: né cambiarne una (0 righe toccate)', n = 0 and (select name from match_editors where match_id = m1) = 'Luca Rossi', n || ' righe');

  -- ── se la partita si cancella, se ne va anche la firma ──
  delete from matches where id = m1;
  insert into t_res values ('pulizia: cancellata la partita, scompare anche la firma', not exists (select 1 from match_editors where match_id = m1), '');

  select string_agg(case when x.ok then '✔ ' else '✘ ' end || x.name || case when x.info <> '' then ' (' || x.info || ')' else '' end, chr(10) order by x.ok, x.name)
    into msg from t_res x where not x.ok;
  raise exception 'REPORT%', chr(10) || coalesce(msg, 'nessun problema') || chr(10) || 'Totale: ' || (select count(*) from t_res) || ' controlli, ' || (select count(*) from t_res x where not x.ok) || ' falliti';
end
$test$;
