-- ═══════════════════════════════════════════════════════════════════════════
--  Scenario completo nel database vero, SENZA tracce (alla fine il blocco si interrompe con il resoconto e tutto si annulla):
--  il creatore apre una lega → invito personale a un giocatore → l'amico accetta e viene collegato →
--  entra con il codice in una seconda lega portando il suo giocatore (niente doppioni) →
--  un admin non creatore propone un nuovo admin → il creatore approva → la redazione scrive titoli e descrizioni →
--  l'admin salva voti e risultato → il registro attività contiene tutte le azioni, con la persona giusta.
--  Eseguire con:  npx supabase db query --linked -f supabase/tests/scenario_completo.sql
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', case when uid is null then '' else json_build_object('sub', uid, 'role', 'authenticated')::text end, true);
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('request.headers', '{"x-forwarded-for":"203.0.113.50","user-agent":"Scenario/1.0"}', true);
  if uid is null then execute 'reset role'; else execute 'set local role authenticated'; end if;
end $f$;

do $test$
declare
  u_o uuid := gen_random_uuid(); u_f uuid := gen_random_uuid(); u_x uuid := gen_random_uuid(); u_r uuid := gen_random_uuid(); u_s uuid := gen_random_uuid();
  la uuid := gen_random_uuid(); lb uuid := gen_random_uuid(); m1 uuid := gen_random_uuid();
  p uuid[] := array(select gen_random_uuid() from generate_series(1, 6));
  tok text; code_b text; n int; nplayers int; msg text; ok boolean;
begin
  create temp table t_res(name text, ok boolean, info text) on commit drop;
  insert into auth.users(id, email, aud, role, instance_id, raw_user_meta_data) values
    (u_o, 'sc-o@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"display_name":"Luciano Creatore"}'),
    (u_f, 'sc-f@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"display_name":"Fabio Amico"}'),
    (u_x, 'sc-x@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"display_name":"Xena Admin"}'),
    (u_r, 'sc-r@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"display_name":"Rita Redazione"}'),
    (u_s, 'sc-s@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"display_name":"Sara Suprema"}');
  insert into platform_admins(user_id) values (u_s);
  delete from audit_log;      -- (solo dentro la prova) così si contano solo le righe dello scenario

  -- 1. il creatore apre la lega A con 6 giocatori e una partita
  perform pg_temp.as_user(u_o);
  insert into leagues(id, name, is_public) values (la, 'Lega A scenario', false);
  insert into players(id, name) select p[g], 'Gioc' || g from generate_series(1, 6) g;
  insert into league_players(league_id, player_id) select la, p[g] from generate_series(1, 6) g;
  insert into matches(id, league_id, date) values (m1, la, '2026-10-28');
  insert into match_players(match_id, player_id, team, position) select m1, p[g], case when g <= 3 then 'A' else 'B' end, g from generate_series(1, 6) g;
  -- 2. invito personale a Gioc1
  select public.create_player_invite(p[1], la) into tok;
  perform pg_temp.as_user(null);
  insert into t_res values ('invito personale creato', tok is not null and length(tok) > 10, '');
  -- 3. l'amico accetta dal link: collegato e dentro la lega
  perform pg_temp.as_user(u_f);
  perform public.accept_player_invite(tok);
  perform pg_temp.as_user(null);
  insert into t_res values ('amico collegato al suo giocatore', (select user_id from players where id = p[1]) = u_f, '');
  insert into t_res values ('amico membro della lega A', exists (select 1 from league_members where league_id = la and user_id = u_f and role = 'member'), '');
  begin perform pg_temp.as_user(u_x); perform public.accept_player_invite(tok); ok := false; exception when others then ok := true; end;
  perform pg_temp.as_user(null);
  insert into t_res values ('il link non si può riusare da un altro account', ok, '');
  perform pg_temp.as_user(u_f);
  perform public.accept_player_invite(tok);           -- lo stesso amico lo riapre: nessun errore
  perform pg_temp.as_user(null);

  -- 4. il creatore apre la lega B; l'amico entra con il codice portando il suo giocatore (niente doppioni)
  perform pg_temp.as_user(u_o);
  insert into leagues(id, name, is_public) values (lb, 'Lega B scenario', false);
  perform pg_temp.as_user(null);
  select invite_code into code_b from leagues where id = lb;
  select count(*) into nplayers from players where name like 'Gioc%';
  perform pg_temp.as_user(u_f);
  perform public.join_league(code_b);
  perform pg_temp.as_user(null);
  insert into t_res values ('amico dentro la lega B con il suo giocatore', exists (select 1 from league_players where league_id = lb and player_id = p[1]), '');
  insert into t_res values ('niente doppioni: giocatori invariati e uno solo per l''amico', (select count(*) from players where name like 'Gioc%') = nplayers and (select count(*) from players where user_id = u_f) = 1 and (select count(*) from league_players where league_id = lb) = 1, '');

  -- 5. ruoli: Xena entra e il creatore la nomina admin; l'admin propone Fabio; il creatore approva
  perform pg_temp.as_user(u_o);
  insert into league_members(league_id, user_id, role) values (la, u_x, 'member'), (la, u_r, 'member');
  perform public.set_member_role(la, u_x, 'admin');
  perform public.set_member_role(la, u_r, 'redazione');
  perform pg_temp.as_user(u_x);
  perform public.propose_admin(la, u_f);
  perform pg_temp.as_user(u_o);
  perform public.decide_admin_request((select id from league_admin_requests where league_id = la and user_id = u_f and status = 'pending'), true);
  perform pg_temp.as_user(null);
  insert into t_res values ('proposta approvata: Fabio è admin', (select role from league_members where league_id = la and user_id = u_f) = 'admin', '');

  -- 6. la redazione scrive titolo e descrizione (e non può toccare i voti)
  perform pg_temp.as_user(u_r);
  update match_players set titolo = 'IL MURO', descrizione = 'Una partita da leader.' where match_id = m1 and player_id = p[2];
  begin update match_players set rating = 9 where match_id = m1 and player_id = p[2]; ok := false; exception when others then ok := true; end;
  perform pg_temp.as_user(null);
  insert into t_res values ('redazione: titolo e descrizione sì, voto no', ok and (select titolo from match_players where match_id = m1 and player_id = p[2]) = 'IL MURO' and (select rating from match_players where match_id = m1 and player_id = p[2]) is null, '');

  -- 7. l'admin salva la partita (voti e risultato)
  perform pg_temp.as_user(u_x);
  update match_players set rating = 7.5, goals = 2 where match_id = m1 and player_id = p[1];
  update match_players set rating = 6 where match_id = m1 and player_id = p[2];
  update matches set score_a = 5, score_b = 3 where id = m1;
  perform pg_temp.as_user(null);

  -- 8. il registro attività contiene tutte le azioni, con la persona giusta
  perform pg_temp.as_user(u_s);
  create temp table t_log on commit drop as select * from audit_log;   -- (letto con le regole dell'amministratore supremo)
  perform pg_temp.as_user(null);
  insert into t_res
    select 'registro: ' || x.descr, exists (select 1 from t_log l where l.action = x.action and l.actor_name = x.actor and (x.label is null or l.entity_label = x.label)), x.action || ' da ' || x.actor
      from (values
        ('lega A creata', 'leagues.insert', 'Luciano Creatore', 'Lega A scenario'),
        ('creatore membro della lega', 'league_members.insert', 'Luciano Creatore', 'Luciano Creatore'),
        ('giocatori creati', 'players.insert', 'Luciano Creatore', 'Gioc1'),
        ('partita creata', 'matches.insert', 'Luciano Creatore', 'partita del 28/10/2026'),
        ('invito creato', 'player_invites.create', 'Luciano Creatore', 'Gioc1'),
        ('invito usato', 'player_invites.used', 'Fabio Amico', 'Gioc1'),
        ('giocatore collegato all''account', 'players.link', 'Fabio Amico', 'Gioc1'),
        ('amico entra nella lega A', 'league_members.insert', 'Fabio Amico', 'Fabio Amico'),
        ('lega B creata', 'leagues.insert', 'Luciano Creatore', 'Lega B scenario'),
        ('amico entra con il codice nella lega B', 'league_members.insert', 'Fabio Amico', 'Fabio Amico'),
        ('il suo giocatore arriva nella lega B', 'league_players.insert', 'Fabio Amico', 'Gioc1'),
        ('Xena nominata admin', 'league_members.role', 'Luciano Creatore', 'Xena Admin'),
        ('Rita messa in redazione', 'league_members.role', 'Luciano Creatore', 'Rita Redazione'),
        ('proposta di admin', 'league_admin_requests.propose', 'Xena Admin', 'Fabio Amico'),
        ('proposta approvata', 'league_admin_requests.approved', 'Luciano Creatore', 'Fabio Amico'),
        ('Fabio diventa admin', 'league_members.role', 'Luciano Creatore', 'Fabio Amico'),
        ('titolo scritto dalla redazione', 'match_players.update', 'Rita Redazione', 'Gioc2 · partita del 28/10/2026'),
        ('voto salvato dall''admin', 'match_players.update', 'Xena Admin', 'Gioc1 · partita del 28/10/2026'),
        ('risultato salvato', 'matches.update', 'Xena Admin', 'partita del 28/10/2026')
      ) as x(descr, action, actor, label);
  insert into t_res values ('registro: IP e dispositivo salvati', (select count(*) from t_log where ip is null or user_agent is null) = 0 and (select count(*) from t_log) > 20, (select count(*) from t_log) || ' righe');
  insert into t_res values ('registro: il voto non scritto dalla redazione non compare', not exists (select 1 from t_log where actor_name = 'Rita Redazione' and changes ? 'rating'), '');
  -- chi non è supremo non vede niente
  perform pg_temp.as_user(u_o);
  select count(*) into n from audit_log;
  perform pg_temp.as_user(null);
  insert into t_res values ('registro: il creatore della lega non lo vede', n = 0, n || ' righe');

  select string_agg(case when x.ok then '✔ ' else '✘ ' end || x.name || case when x.info <> '' then ' (' || x.info || ')' else '' end, chr(10) order by x.ok, x.name)
    into msg from t_res x where not x.ok;
  raise exception 'REPORT%', chr(10) || coalesce(msg, 'nessun problema') || chr(10) || 'Totale: ' || (select count(*) from t_res) || ' controlli, ' || (select count(*) from t_res x where not x.ok) || ' falliti';
end
$test$;
