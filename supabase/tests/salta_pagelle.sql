-- ═══════════════════════════════════════════════════════════════════════════
--  «Salta le pagelle» (una partita e molte insieme) nel database vero, SENZA tracce (alla fine tutto si annulla):
--  lo possono fare amministratore e redazione della lega, nessun altro; in blocco vale tutto o niente.
--  Eseguire con:  npx supabase db query --linked --yes -f supabase/tests/salta_pagelle.sql
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', case when uid is null then '' else json_build_object('sub', uid, 'role', 'authenticated')::text end, true);
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('request.headers', '{"x-forwarded-for":"203.0.113.95","user-agent":"SaltaPagelle/1.0"}', true);
  if uid is null then execute 'reset role'; else execute 'set local role authenticated'; end if;
end $f$;

do $test$
declare
  u_a uuid := gen_random_uuid();   -- amministratore lega 1
  u_r uuid := gen_random_uuid();   -- redazione lega 1
  u_m uuid := gen_random_uuid();   -- solo membro lega 1
  u_b uuid := gen_random_uuid();   -- amministratore lega 2
  l1 uuid := gen_random_uuid(); l2 uuid := gen_random_uuid();
  m1 uuid := gen_random_uuid(); m2 uuid := gen_random_uuid(); m3 uuid := gen_random_uuid();
  ok boolean; n int; msg text;
begin
  create temp table t_res(name text, ok boolean, info text) on commit drop;
  grant all on t_res to authenticated;
  insert into auth.users(id, email, aud, role, instance_id, raw_user_meta_data)
    select u, 'sp-' || i || '@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb
      from unnest(array[u_a, u_r, u_m, u_b]) with ordinality t(u, i);
  insert into leagues(id, name, is_public, owner_id, created_by) values (l1, 'Lega Salta 1', false, u_a, u_a), (l2, 'Lega Salta 2', false, u_b, u_b);
  insert into league_members(league_id, user_id, role) values (l1, u_a, 'admin'), (l1, u_r, 'redazione'), (l1, u_m, 'member'), (l2, u_b, 'admin')
    on conflict (league_id, user_id) do update set role = excluded.role;
  insert into matches(id, league_id, date, score_a, score_b) values (m1, l1, '2026-01-10', 5, 3), (m2, l1, '2026-01-17', 2, 2), (m3, l2, '2026-01-10', 1, 0);
  delete from audit_log;

  -- ── una partita ──
  perform pg_temp.as_user(u_r); perform public.set_ratings_skipped(m1, true);
  perform pg_temp.as_user(null);
  insert into t_res values ('una: la redazione salta una partita', (select ratings_skipped from matches where id = m1), '');
  perform pg_temp.as_user(u_r); perform public.set_ratings_skipped(m1, false);
  perform pg_temp.as_user(null);
  insert into t_res values ('una: e la rimette', not (select ratings_skipped from matches where id = m1), '');
  perform pg_temp.as_user(u_m);
  begin perform public.set_ratings_skipped(m1, true); ok := false; exception when others then ok := true; end;
  insert into t_res values ('una: un membro semplice non può', ok, '');
  perform pg_temp.as_user(u_b);
  begin perform public.set_ratings_skipped(m1, true); ok := false; exception when others then ok := true; end;
  perform pg_temp.as_user(null);
  insert into t_res values ('una: l''amministratore di un''altra lega non può', ok and not (select ratings_skipped from matches where id = m1), '');

  -- ── molte insieme ──
  perform pg_temp.as_user(u_r); select public.set_ratings_skipped_many(array[m1, m2], true) into n;
  perform pg_temp.as_user(null);
  insert into t_res values ('molte: la redazione salta 2 partite in una volta', n = 2 and (select count(*) from matches where id in (m1, m2) and ratings_skipped) = 2, n || ' cambiate');
  perform pg_temp.as_user(u_r); select public.set_ratings_skipped_many(array[m1, m2], true) into n;
  perform pg_temp.as_user(null);
  insert into t_res values ('molte: ripetendo non cambia niente (0 cambiate)', n = 0, n || '');
  perform pg_temp.as_user(u_a); select public.set_ratings_skipped_many(array[m1, m2], false) into n;
  perform pg_temp.as_user(null);
  insert into t_res values ('molte: l''amministratore le rimette tutte insieme', n = 2 and not exists (select 1 from matches where id in (m1, m2) and ratings_skipped), '');
  -- tutto o niente
  perform pg_temp.as_user(u_r);
  begin perform public.set_ratings_skipped_many(array[m1, m3], true); ok := false; exception when others then ok := true; end;
  perform pg_temp.as_user(null);
  insert into t_res values ('molte: con una partita di un''altra lega non cambia NIENTE (nemmeno le sue)', ok and not exists (select 1 from matches where id in (m1, m3) and ratings_skipped), '');
  perform pg_temp.as_user(u_m);
  begin perform public.set_ratings_skipped_many(array[m1], true); ok := false; exception when others then ok := true; end;
  insert into t_res values ('molte: un membro semplice non può', ok, '');
  perform pg_temp.as_user(u_r);
  begin perform public.set_ratings_skipped_many(array[gen_random_uuid()], true); ok := false; exception when others then ok := true; end;
  insert into t_res values ('molte: una partita che non esiste → errore', ok, '');
  select public.set_ratings_skipped_many('{}'::uuid[], true) into n;
  insert into t_res values ('molte: elenco vuoto → 0, senza errori', n = 0, '');
  select public.set_ratings_skipped_many(null, true) into n;
  insert into t_res values ('molte: elenco assente → 0, senza errori', n = 0, '');
  begin perform public.set_ratings_skipped_many(array(select gen_random_uuid() from generate_series(1, 1001)), true); ok := false; exception when others then ok := true; end;
  insert into t_res values ('molte: più di 1000 partite in una volta → rifiutato', ok, '');
  perform pg_temp.as_user(null);
  begin perform public.set_ratings_skipped_many(array[m1], true); ok := false; exception when others then ok := true; end;
  insert into t_res values ('molte: senza accesso non si può', ok, '');

  select string_agg(case when x.ok then '✔ ' else '✘ ' end || x.name || case when x.info <> '' then ' (' || x.info || ')' else '' end, chr(10) order by x.ok, x.name)
    into msg from t_res x where not x.ok;
  raise exception 'REPORT%', chr(10) || coalesce(msg, 'nessun problema') || chr(10) || 'Totale: ' || (select count(*) from t_res) || ' controlli, ' || (select count(*) from t_res x where not x.ok) || ' falliti';
end
$test$;
