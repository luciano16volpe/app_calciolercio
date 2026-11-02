-- ═══════════════════════════════════════════════════════════════════════════
--  Matrice dei permessi, ruolo per ruolo, nel database vero SENZA lasciare tracce.
--  Ogni azione è provata con i permessi di quel ruolo e poi annullata; alla fine il blocco si interrompe con il resoconto.
--  Ruoli:  v visitatore (senza account) · m membro · r redazione · a admin (non creatore) · o creatore ·
--          x admin di un'altra lega · s amministratore supremo.   1 = può, 0 = non può.
--  "atteso" viene dalle specifiche; "ottenuto" è quello che fa il database. Ogni differenza è un problema.
--  Eseguire con:  npx supabase db query --linked -f supabase/tests/permessi_per_ruolo.sql
--  (le righe da mostrare si scelgono con i due numeri FROM/TO qui sotto: il messaggio di errore ha una lunghezza limitata)
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function pg_temp.try_as(uid uuid, rl text, stmt text) returns boolean language plpgsql as $f$
declare n int; res boolean := false;
begin
  perform set_config('request.jwt.claims', case when uid is null then '' else json_build_object('sub', uid, 'role', rl)::text end, true);
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('request.headers', '', true);
  execute 'set local role ' || rl;
  begin
    execute stmt;
    get diagnostics n = row_count;
    res := n > 0;                       -- 0 righe = filtrato dalle regole (non permesso)
    raise exception '__annulla__';      -- l'effetto si annulla sempre
  exception when others then
    if sqlerrm <> '__annulla__' then res := false; end if;
  end;
  execute 'reset role';
  return res;
end $f$;

do $test$
declare
  u uuid[] := array(select gen_random_uuid() from generate_series(1, 8));
  u_mem uuid := u[1]; u_red uuid := u[2]; u_adm uuid := u[3]; u_own uuid := u[4]; u_adm2 uuid := u[5]; u_sup uuid := u[6];
  l1 uuid := gen_random_uuid(); l2 uuid := gen_random_uuid(); lp uuid := gen_random_uuid();
  p uuid[] := array(select gen_random_uuid() from generate_series(1, 9));
  m1 uuid := gen_random_uuid(); mp uuid := gen_random_uuid(); c1 uuid := gen_random_uuid(); r1 uuid := gen_random_uuid();
  code text; a record; k int; who text; out text; got text; lines text := ''; diffs int := 0; total int := 0; i int := 0;
  who_codes text[] := array['v', 'm', 'r', 'a', 'o', 'x', 's'];
  who_ids uuid[]; who_roles text[] := array['anon', 'authenticated', 'authenticated', 'authenticated', 'authenticated', 'authenticated', 'authenticated'];
  c_from int := {{FROM}}; c_to int := {{TO}};
begin
  who_ids := array[null, u_mem, u_red, u_adm, u_own, u_adm2, u_sup]::uuid[];
  insert into auth.users(id, email, aud, role, instance_id, raw_user_meta_data)
    select x, 'perm-' || substr(x::text, 1, 8) || '@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb from unnest(u) x;
  -- lega privata L1 (creatore u_own), lega di un altro gruppo L2, altra lega privata LP
  insert into leagues(id, name, is_public, owner_id, created_by) values (l1, 'Perm L1', false, u_own, u_own), (l2, 'Perm L2', false, u_adm2, u_adm2), (lp, 'Perm Privata 2', false, u_own, u_own);
  insert into league_members(league_id, user_id, role) values
    (l1, u_own, 'admin'), (l1, u_adm, 'admin'), (l1, u_red, 'redazione'), (l1, u_mem, 'member'), (l2, u_adm2, 'admin'), (lp, u_own, 'admin');
  insert into players(id, name, created_by) values (p[1], 'P1', null), (p[2], 'P2', null), (p[3], 'P3', null), (p[4], 'P4', null), (p[5], 'P5', null), (p[9], 'P9', u_mem);
  insert into league_players(league_id, player_id) select l1, p[g] from generate_series(1, 5) g;
  update players set user_id = u_red where id = p[3];                 -- P3 è già collegato (a u_red)
  insert into matches(id, league_id, date) values (m1, l1, '2026-10-01'), (mp, lp, '2026-10-01');
  insert into match_players(match_id, player_id, team, position, rating) values (m1, p[1], 'A', 1, 6), (m1, p[2], 'B', 2, 6);
  insert into player_claims(id, league_id, player_id, user_id) values (c1, l1, p[2], u_mem);
  insert into league_admin_requests(id, league_id, user_id, requested_by) values (r1, l1, u_mem, u_adm);
  insert into platform_admins(user_id) values (u_sup);
  insert into player_stats_history(player_id, changed_by, old_stats, new_stats) values (p[1], u_adm, array[5,5,5,5,5,5,5,5,5,5,5]::smallint[], array[6,5,5,5,5,5,5,5,5,5,5]::smallint[]);
  select invite_code into code from leagues where id = l1;
  -- P9 l'ha creato u_mem quando era amministratore: ora è solo membro

  create temp table acts(n int, descr text, expect text, sql text, solo text) on commit drop;
  insert into acts values
   (1,  'leggere le partite di una lega privata',                 '0111100', 'select 1 from matches where league_id = ''{L1}''', null),
   (2,  'leggere le partite di una lega (non esistono leghe pubbliche)', '0111100', 'select 1 from matches where league_id = ''{L1}''', null),
   (3,  'cambiare un voto',                                       '0001100', 'update match_players set rating = 7 where match_id = ''{M1}'' and player_id = ''{P1}''', null),
   (4,  'cambiare titolo e descrizione di una pagella',           '0011100', 'update match_players set titolo = ''X'', descrizione = ''Y'' where match_id = ''{M1}'' and player_id = ''{P1}''', null),
   (5,  'creare una partita',                                     '0001100', 'insert into matches(league_id, date) values (''{L1}'', ''2026-01-01'')', null),
   (6,  'eliminare una partita',                                  '0001100', 'delete from matches where id = ''{M1}''', null),
   (7,  'cambiare le statistiche di un giocatore',                '0001100', 'update players set stats = array[6,5,5,5,5,5,5,5,5,5,5]::smallint[] where id = ''{P1}''', null),
   (8,  'eliminare un giocatore che gioca solo in questa lega',  '0001100', 'delete from players where id = ''{P1}''', null),
   (9,  'eliminare un giocatore creato da chi ora è solo membro', '0000000', 'delete from players where id = ''{P9}''', 'e'),
   (10, 'cambiare le statistiche di un giocatore creato da chi ora è solo membro', '0000000', 'update players set stats = array[6,5,5,5,5,5,5,5,5,5,5]::smallint[] where id = ''{P9}''', 'e'),
   (11, 'collegare un giocatore a un account a mano (players.user_id)', '0000000', 'update players set user_id = ''{ME}'' where id = ''{P1}''', null),
   (12, 'cambiare il ruolo di un membro in redazione',            '0001100', 'select public.set_member_role(''{L1}'', ''{MEM}'', ''redazione'')', null),
   (13, 'nominare un amministratore',                             '0000100', 'select public.set_member_role(''{L1}'', ''{MEM}'', ''admin'')', null),
   (14, 'proporre un amministratore',                             '0001000', 'select public.propose_admin(''{L1}'', ''{RED}'')', null),
   (15, 'approvare una proposta di amministratore',               '0000100', 'select public.decide_admin_request(''{R1}'', true)', null),
   (16, 'cedere la proprietà della lega',                         '0000100', 'select public.transfer_league_ownership(''{L1}'', ''{ADM}'')', null),
   (17, 'togliere un amministratore (declassarlo)',               '0000100', 'select public.set_member_role(''{L1}'', ''{ADM}'', ''member'')', null),
   (18, 'rimuovere un membro',                                    '0001100', 'select public.remove_member(''{L1}'', ''{MEM}'')', null),
   (19, 'cambiare il nome della lega',                            '0001100', 'update leagues set name = ''Nuovo'' where id = ''{L1}''', null),
   (20, 'rigenerare il codice d''invito',                         '0001100', 'select public.regenerate_invite_code(''{L1}'')', null),
   (21, 'eliminare la lega',                                      '0001100', 'delete from leagues where id = ''{L1}''', null),
   (22, 'vedere nomi ed email dei membri',                        '0001100', 'select 1 from public.league_member_list(''{L1}'')', null),
   (23, 'creare il link d''invito di un giocatore',               '0001100', 'select public.create_player_invite(''{P1}'', ''{L1}'')', null),
   (24, 'vedere lo stato dei collegamenti dei giocatori',         '0001100', 'select 1 from public.league_players_status(''{L1}'')', null),
   (25, 'vedere l''anteprima di un invito (anche senza accesso)', '1111111', 'select 1 from public.invite_preview(''qualunque'')', null),
   (26, 'chiedere «questo sono io» (giocatore libero della lega)', '0111100', 'select public.request_claim(''{L1}'', ''{P5}'')', 'nolink'),
   (27, 'confermare o rifiutare una richiesta «sono io»',         '0001100', 'select public.review_claim(''{C1}'', false)', null),
   (28, 'scollegare un giocatore dal suo account (solo l''amministratore: la redazione di prova è il giocatore stesso e non può scollegarsi)', '0001100', 'select public.unlink_player(''{P3}'')', null),
   (29, 'unire due giocatori',                                    '0001100', 'select public.merge_players(''{P1}'', ''{P4}'')', null),
   (30, 'aggiungere un giocatore alla lega',                      '0001100', 'insert into league_players(league_id, player_id) values (''{L1}'', ''{P9}'')', 'newlp'),
   (31, 'scrivere la riga della Gazzetta di una partita',         '0011100', 'insert into gazzette(match_id, file_path) values (''{M1}'', ''x/y.jpg'')', null),
   (32, 'caricare il file di una Gazzetta',                       '0011100', 'insert into storage.objects(bucket_id, name, owner) values (''gazzette'', ''{L1}/prova.jpg'', ''{ME}'')', null),
   (33, 'scrivere nell''albo d''oro',                             '0001100', 'insert into albo(league_id, season_key) values (''{L1}'', ''2026-AUT'')', null),
   (34, 'leggere il registro attività',                           '0000001', 'select 1 from audit_log limit 1', null),
   (35, 'modificare il registro attività',                        '0000000', 'update audit_log set actor_name = ''falso''', null),
   (36, 'cancellare dal registro attività',                       '0000000', 'delete from audit_log', null),
   (37, 'scrivere a mano nel registro attività',                  '0000000', 'insert into audit_log(action, entity, grp) values (''falso'', ''x'', ''account'')', null),
   (38, 'elenco di tutte le leghe (piattaforma)',                 '0000001', 'select 1 from public.admin_list_leagues()', null),
   (39, 'elenco di tutti gli utenti (piattaforma)',               '0000001', 'select 1 from public.admin_list_users()', null),
   (40, 'risultare amministratore supremo',                       '0000001', 'select 1 where public.is_super_admin()', null),
   (41, 'leggere la tabella degli amministratori supremi',        '0000000', 'select 1 from platform_admins', null),
   (42, 'nominare un amministratore supremo',                     '0000000', 'insert into platform_admins(user_id) values (''{ME}'')', null),
   (43, 'entrare in una lega privata scrivendo direttamente tra i membri', '0000000', 'insert into league_members(league_id, user_id, role) values (''{L1}'', ''{ME}'', ''member'')', 'out'),
   (44, 'entrare in una lega con il codice giusto',               '0000100'::text, 'select public.join_league(''{CODE}'')', 'out'),
   (45, 'creare una nuova lega',                                  '0111111', 'insert into leagues(id, name) values (gen_random_uuid(), ''Nuova'')', null),
   (46, 'leggere il profilo di un altro utente',                  '0000000', 'select 1 from profiles where id <> coalesce(nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid, gen_random_uuid())', null),
   (47, 'vedere i giocatori ancora liberi di una lega privata',   '0111100', 'select 1 from public.players_unclaimed(''{L1}'')', null),
   (48, 'vedere lo storico statistiche di un giocatore di una lega privata', '0111100', 'select 1 from public.player_history(''{P1}'')', null),
   (49, 'cambiare le regole di gioco (pesi, formazioni, forma recente)', '0000001', 'select public.admin_set_setting(''use_form'', ''false''::jsonb)', null),
   (50, 'cambiare i pesi con valori non validi', '0000000', 'select public.admin_set_setting(''ovr_weights'', ''[9,1,1,1,1,1,1,1,1,1,1]''::jsonb)', null),
   (51, 'leggere le regole di gioco (l''app le usa per calcolare OVR e squadre)', '1111111', 'select 1 from app_settings where key = ''ovr_weights''', null);
  -- 44: il codice giusto lo possono usare tutti quelli che hanno un account e non sono già dentro (x, s); v no
  update acts set expect = '0000011' where n = 44;

  for a in select * from acts where n between c_from and c_to order by n loop
    out := '';
    for k in 1..7 loop
      who := who_codes[k];
      -- azioni riservate a un solo tipo di prova
      if a.solo = 'e' and who <> 'm' then out := out || '-'; continue; end if;
      if a.solo = 'out' and who not in ('v', 'x', 's') then out := out || '-'; continue; end if;
      if a.solo = 'nolink' and who = 'r' then out := out || '-'; continue; end if;    -- la redazione di prova ha già il suo giocatore collegato
      got := case when pg_temp.try_as(who_ids[k], who_roles[k], replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(a.sql,
              '{L1}', l1::text), '{LP}', lp::text), '{M1}', m1::text), '{P1}', p[1]::text), '{P3}', p[3]::text), '{P4}', p[4]::text), '{P5}', p[5]::text), '{P9}', p[9]::text),
              '{C1}', c1::text), '{R1}', r1::text), '{MEM}', u_mem::text), '{RED}', u_red::text), '{ADM}', u_adm::text), '{ME}', coalesce(who_ids[k]::text, '00000000-0000-0000-0000-000000000000')), '{CODE}', code)) then '1' else '0' end;
      out := out || got;
    end loop;
    -- l'esito atteso vale solo per i ruoli provati ('-' = non applicabile)
    total := total + 1;
    lines := lines || chr(10) || case when (select bool_and(substr(out, g, 1) = '-' or substr(out, g, 1) = substr(a.expect, g, 1)) from generate_series(1, 7) g) then 'OK   ' else 'DIFF ' end
             || lpad(a.n::text, 2) || ' ' || a.expect || ' → ' || out || '  ' || a.descr;
    if not (select bool_and(substr(out, g, 1) = '-' or substr(out, g, 1) = substr(a.expect, g, 1)) from generate_series(1, 7) g) then diffs := diffs + 1; end if;
  end loop;
  raise exception 'MATRICE (v m r a o x s) atteso → ottenuto:%', lines || chr(10) || 'Righe: ' || total || ', differenze: ' || diffs;
end
$test$;
