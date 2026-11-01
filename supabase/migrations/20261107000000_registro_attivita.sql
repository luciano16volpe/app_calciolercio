-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · Fase 4.7: registro attività (audit) per l'amministratore supremo
--  Chi ha fatto cosa, quando, in quale lega, da dove. Lo scrive SOLO il database (trigger): nessuna azione
--  sfugge e nessuno può falsificarlo, modificarlo o cancellarlo (solo la pulizia notturna toglie le righe scadute).
--  Lo legge solo is_super_admin(). Conservazione: 60 giorni (righe) e 60 giorni (indirizzo IP e dispositivo).
--  Additiva: non cambia nessuna tabella esistente (aggiunge trigger e due funzioni di sistema).
--  Applicare con:  npx supabase db push --linked
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Impostazioni di conservazione ──────────────────────────────────────────
insert into public.app_settings(key, value) values ('audit_retention_days', '60'::jsonb) on conflict (key) do nothing;
insert into public.app_settings(key, value) values ('audit_ip_retention_days', '60'::jsonb) on conflict (key) do nothing;

-- ── Il registro ────────────────────────────────────────────────────────────
create table if not exists public.audit_log (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  actor_id     uuid,                                   -- auth.uid(); null = sistema / SQL Editor / account cancellato
  actor_name   text,                                   -- nome al momento dell'azione
  action       text not null,                          -- es. 'match_players.update', 'auth.login', 'league_members.role'
  entity       text not null,                          -- tabella o oggetto
  entity_id    text,                                   -- id o chiave composta ("<partita>/<giocatore>")
  entity_label text,                                   -- nome leggibile al momento (giocatore, partita, persona…)
  league_id    uuid,                                   -- null per oggetti globali
  league_name  text,                                   -- nome della lega al momento
  grp          text not null,                          -- account · leghe · partite · giocatori
  tx           bigint not null default txid_current(), -- raggruppa la stessa operazione
  changes      jsonb,                                  -- update: {campo: [prima, dopo]}; insert/delete: la riga
  source       text not null default 'app',            -- app · import · sistema
  ip           inet,
  user_agent   text,
  constraint audit_log_grp_ok check (grp in ('account','leghe','partite','giocatori')),
  constraint audit_log_source_ok check (source in ('app','import','sistema'))
);
create index if not exists audit_log_at_idx     on public.audit_log(at desc);
create index if not exists audit_log_league_idx on public.audit_log(league_id, at desc);
create index if not exists audit_log_actor_idx  on public.audit_log(actor_id, at desc);
create index if not exists audit_log_tx_idx     on public.audit_log(tx);

alter table public.audit_log enable row level security;
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated using (public.is_super_admin());
-- nessuna regola di scrittura + permessi tolti: nessuno (nemmeno gli admin delle leghe) può modificare o cancellare
revoke all on public.audit_log from public, anon, authenticated;
grant select on public.audit_log to authenticated;
revoke all on sequence public.audit_log_id_seq from public, anon, authenticated;

-- ── Aiuti interni (non richiamabili dall'app) ──────────────────────────────
-- IP, dispositivo e origine dalle intestazioni della richiesta (PostgREST); origine "import" se lo script lo dichiara
create or replace function public.audit_ctx(out ip inet, out ua text, out src text)
language plpgsql stable set search_path = public as $$
declare h jsonb; xf text;
begin
  begin h := nullif(current_setting('request.headers', true), '')::jsonb; exception when others then h := null; end;
  xf := nullif(trim(split_part(coalesce(h->>'x-forwarded-for', h->>'x-real-ip', ''), ',', 1)), '');
  begin ip := xf::inet; exception when others then ip := null; end;
  ua := nullif(left(coalesce(h->>'user-agent', ''), 300), '');
  src := case when lower(coalesce(h->>'x-audit-source', '')) = 'import' then 'import'
              when auth.uid() is null then 'sistema' else 'app' end;
end $$;

create or replace function public.audit_user_name(uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(p.display_name, ''), u.email::text) from auth.users u left join profiles p on p.id = u.id where u.id = uid;
$$;
create or replace function public.audit_player_name(pid uuid)
returns text language sql stable security definer set search_path = public as $$ select name from players where id = pid; $$;
create or replace function public.audit_match_label(mid uuid)
returns text language sql stable security definer set search_path = public as $$
  select 'partita del ' || to_char(date, 'DD/MM/YYYY') from matches where id = mid;
$$;

-- campi cambiati {campo: [prima, dopo]}, ignorando i campi tecnici
create or replace function public.audit_diff(o jsonb, n jsonb, ignore text[])
returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(e.key, jsonb_build_array(o -> e.key, e.value)), '{}'::jsonb)
    from jsonb_each(n) e
   where not (e.key = any(ignore)) and (o -> e.key) is distinct from e.value;
$$;

-- scrive una riga (usata dai trigger, da log_event e dalle funzioni di sistema); un errore del registro non blocca mai l'app
create or replace function public.audit_event(
  p_action text, p_entity text, p_entity_id text, p_league uuid, p_label text, p_grp text, p_changes jsonb, p_actor uuid default auth.uid())
returns void language plpgsql security definer set search_path = public as $$
declare c record; lname text;
begin
  select * into c from public.audit_ctx();
  select name into lname from leagues where id = p_league;
  insert into audit_log(actor_id, actor_name, action, entity, entity_id, entity_label, league_id, league_name, grp, changes, source, ip, user_agent)
  values (p_actor, case when p_actor is null then null else public.audit_user_name(p_actor) end, p_action, p_entity, p_entity_id, p_label, p_league, lname,
          p_grp, p_changes, c.src, c.ip, c.ua);
exception when others then
  raise warning 'registro attività: scrittura non riuscita (%)', sqlerrm;
end $$;

-- ── Trigger generico per le tabelle controllate ────────────────────────────
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  n jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  t text := tg_table_name;
  ignore text[] := array['updated_at', 'created_at', 'legacy_id', 'created_by', 'uploaded_at', 'uploaded_by', 'joined_at', 'decided_at', 'decided_by', 'requested_by'];
  act text; grp text; eid text; lg uuid; label text; ch jsonb;
begin
  if coalesce(current_setting('app.audit_skip', true), '') = 'on' then return null; end if;

  -- cancellazioni "a cascata" (è sparita la lega, la partita, il giocatore o l'account): si registra solo l'azione principale
  if tg_op = 'DELETE' then
    if (t in ('matches', 'league_members', 'league_players', 'albo', 'player_invites', 'player_claims', 'league_admin_requests')
        and not exists (select 1 from leagues where id = (r->>'league_id')::uuid))
       or (t in ('match_players', 'gazzette') and not exists (select 1 from matches where id = (r->>'match_id')::uuid))
       or (t in ('match_players', 'league_players', 'player_invites', 'player_claims') and not exists (select 1 from players where id = (r->>'player_id')::uuid))
       or (t in ('league_members', 'player_claims', 'league_admin_requests') and not exists (select 1 from auth.users where id = (r->>'user_id')::uuid))
    then return null; end if;
  end if;

  -- gruppo, lega, nome leggibile e chiave
  case t
    when 'leagues' then grp := 'leghe'; lg := (r->>'id')::uuid; label := r->>'name'; eid := r->>'id';
    when 'league_members' then grp := 'leghe'; lg := (r->>'league_id')::uuid; label := public.audit_user_name((r->>'user_id')::uuid); eid := (r->>'league_id') || '/' || (r->>'user_id');
    when 'league_admin_requests' then grp := 'leghe'; lg := (r->>'league_id')::uuid; label := public.audit_user_name((r->>'user_id')::uuid); eid := r->>'id';
    when 'matches' then grp := 'partite'; lg := (r->>'league_id')::uuid; label := 'partita del ' || to_char((r->>'date')::date, 'DD/MM/YYYY'); eid := r->>'id';
    when 'match_players' then
      grp := 'partite'; select m.league_id into lg from matches m where m.id = (r->>'match_id')::uuid;
      label := coalesce(public.audit_player_name((r->>'player_id')::uuid), '?') || ' · ' || coalesce(public.audit_match_label((r->>'match_id')::uuid), 'partita'); eid := (r->>'match_id') || '/' || (r->>'player_id');
    when 'gazzette' then
      grp := 'partite'; select m.league_id into lg from matches m where m.id = (r->>'match_id')::uuid;
      label := 'Gazzetta · ' || coalesce(public.audit_match_label((r->>'match_id')::uuid), 'partita'); eid := r->>'match_id';
    when 'albo' then grp := 'partite'; lg := (r->>'league_id')::uuid; label := 'stagione ' || (r->>'season_key'); eid := (r->>'league_id') || '/' || (r->>'season_key');
    when 'players' then
      grp := 'giocatori'; label := r->>'name'; eid := r->>'id';
      select min(lp.league_id) into lg from league_players lp where lp.player_id = (r->>'id')::uuid
       having count(*) = 1;
    when 'league_players' then grp := 'giocatori'; lg := (r->>'league_id')::uuid; label := public.audit_player_name((r->>'player_id')::uuid); eid := (r->>'league_id') || '/' || (r->>'player_id');
    when 'player_invites' then grp := 'account'; lg := (r->>'league_id')::uuid; label := public.audit_player_name((r->>'player_id')::uuid); eid := (r->>'player_id') || '/' || (r->>'league_id');
    when 'player_claims' then
      grp := 'account'; lg := (r->>'league_id')::uuid;
      label := coalesce(public.audit_player_name((r->>'player_id')::uuid), '?') || ' ← ' || coalesce(public.audit_user_name((r->>'user_id')::uuid), '?'); eid := r->>'id';
    when 'platform_admins' then grp := 'account'; label := public.audit_user_name((r->>'user_id')::uuid); eid := r->>'user_id';
    else grp := 'account'; eid := null;
  end case;

  if tg_op = 'UPDATE' then
    ch := public.audit_diff(o, n, ignore);
    if t = 'albo' then ch := ch - 'rows'; end if;                 -- dell'albo conta solo il cambio di stato
    if ch = '{}'::jsonb then return null; end if;                 -- niente è cambiato davvero
    act := case t
      when 'league_members' then case when ch ? 'role' then 'league_members.role' else 'league_members.update' end
      when 'leagues' then case when ch ? 'owner_id' then 'leagues.owner' when ch ? 'invite_code' then 'leagues.invite_code' else 'leagues.update' end
      when 'league_admin_requests' then 'league_admin_requests.' || coalesce(n->>'status', 'update')
      when 'player_claims' then 'player_claims.' || coalesce(n->>'status', 'update')
      when 'player_invites' then case when (n->>'revoked')::boolean and not (o->>'revoked')::boolean then 'player_invites.revoke'
                                      when n->>'used_at' is not null and o->>'used_at' is null then 'player_invites.used' else 'player_invites.update' end
      when 'players' then case when ch ? 'user_id' then case when n->>'user_id' is null then 'players.unlink' else 'players.link' end else 'players.update' end
      else t || '.update' end;
    if t = 'players' and ch ? 'user_id' then grp := 'account'; end if;
    if t = 'players' and n->>'user_id' is null and o->>'user_id' is not null
       and not exists (select 1 from auth.users where id = (o->>'user_id')::uuid) then return null; end if;   -- account cancellato
    if t = 'player_invites' then ch := ch - 'token'; end if;
  else
    act := case when tg_op = 'INSERT' then
        case t when 'player_invites' then 'player_invites.create' when 'player_claims' then 'player_claims.request'
               when 'league_admin_requests' then 'league_admin_requests.propose' else t || '.insert' end
      else t || '.delete' end;
    ch := r - 'legacy_id' - 'created_by' - 'uploaded_by' - 'token';
    if t = 'albo' then ch := jsonb_build_object('status', r->>'status', 'season_key', r->>'season_key'); end if;
    if t = 'players' then ch := ch - 'user_id'; end if;
  end if;

  perform public.audit_event(act, t, eid, lg, label, grp, ch);
  return null;
end $$;

do $$ declare t text; begin
  foreach t in array array['leagues', 'league_members', 'league_players', 'players', 'matches', 'match_players', 'gazzette',
                           'player_invites', 'player_claims', 'league_admin_requests', 'platform_admins']
  loop
    execute format('drop trigger if exists audit_ins_del on public.%I', t);
    execute format('create trigger audit_ins_del after insert or delete on public.%I for each row execute function public.audit_row()', t);
    if t <> 'platform_admins' then
      execute format('drop trigger if exists audit_upd on public.%I', t);
      execute format('create trigger audit_upd after update on public.%I for each row when (old.* is distinct from new.*) execute function public.audit_row()', t);
    end if;
  end loop;
end $$;
-- albo d'oro: solo il cambio di stato della stagione (non i ricalcoli)
drop trigger if exists audit_ins_del on public.albo;
create trigger audit_ins_del after insert or delete on public.albo for each row execute function public.audit_row();
drop trigger if exists audit_upd on public.albo;
create trigger audit_upd after update on public.albo for each row when (old.status is distinct from new.status) execute function public.audit_row();

-- ── Accessi e account: l'app avvisa il database (log_event) ────────────────
-- Non si può agganciare il registro interno di Supabase Auth: l'app chiama questa funzione dopo accesso, uscita,
-- registrazione e cambio password. Solo azioni previste, solo per sé stessi.
create or replace function public.log_event(p_action text, p_email text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if p_action not in ('auth.login', 'auth.logout', 'auth.signup', 'auth.password_changed', 'auth.password_reset') then
    raise exception 'Azione non valida';
  end if;
  if uid is null then
    if p_action <> 'auth.password_reset' or p_email is null then return; end if;   -- senza accesso si registra solo la richiesta di nuova password
    select id into uid from auth.users where lower(email::text) = lower(trim(p_email));
    if uid is null then return; end if;
  end if;
  if exists (select 1 from audit_log where actor_id = uid and action = p_action and at > now() - interval '10 seconds') then return; end if;
  perform public.audit_event(p_action, 'auth', uid::text, null, public.audit_user_name(uid), 'account', null, uid);
end $$;
revoke all on function public.log_event(text, text) from public;
grant execute on function public.log_event(text, text) to anon, authenticated;

-- le funzioni interne non sono richiamabili dall'app
revoke all on function public.audit_ctx() from public, anon, authenticated;
revoke all on function public.audit_user_name(uuid) from public, anon, authenticated;
revoke all on function public.audit_player_name(uuid) from public, anon, authenticated;
revoke all on function public.audit_match_label(uuid) from public, anon, authenticated;
revoke all on function public.audit_diff(jsonb, jsonb, text[]) from public, anon, authenticated;
revoke all on function public.audit_event(text, text, text, uuid, text, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.audit_row() from public, anon, authenticated;

-- ── Pulizia automatica ogni notte ──────────────────────────────────────────
create or replace function public.audit_cleanup()
returns void language plpgsql security definer set search_path = public as $$
declare keep_days int; ip_days int;
begin
  select coalesce((select (value #>> '{}')::int from app_settings where key = 'audit_retention_days'), 60) into keep_days;
  select coalesce((select (value #>> '{}')::int from app_settings where key = 'audit_ip_retention_days'), 60) into ip_days;
  delete from audit_log where at < now() - make_interval(days => keep_days);
  update audit_log set ip = null, user_agent = null where (ip is not null or user_agent is not null) and at < now() - make_interval(days => ip_days);
end $$;
revoke all on function public.audit_cleanup() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'audit-cleanup') then perform cron.unschedule('audit-cleanup'); end if;
    perform cron.schedule('audit-cleanup', '30 3 * * *', 'select public.audit_cleanup()');
  else
    raise warning 'pg_cron non attivo: la pulizia del registro va pianificata a mano';
  end if;
end $$;

-- ── Account cancellato: le sue righe restano, ma anonime ───────────────────
create or replace function public.audit_anonymize_user(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update audit_log set actor_name = 'utente cancellato', actor_id = null, ip = null, user_agent = null where actor_id = uid;
  -- anche il nome nelle righe che parlano di lui (account, appartenenza alle leghe)
  update audit_log set entity_label = 'utente cancellato'
   where (entity in ('auth', 'platform_admins') and entity_id = uid::text) or (entity = 'league_members' and entity_id like '%/' || uid::text);
end $$;
revoke all on function public.audit_anonymize_user(uuid) from public, anon, authenticated;

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Devi prima accedere'; end if;
  if exists (select 1 from platform_admins where user_id = uid)
     and (select count(*) from platform_admins) <= 1 then
    raise exception 'Sei l''unico amministratore della piattaforma: nomina prima un altro amministratore supremo';
  end if;
  perform public.audit_event('account.delete', 'auth', uid::text, null, public.audit_user_name(uid), 'account', null, uid);
  perform public.audit_anonymize_user(uid);               -- comprese le righe appena scritte
  -- le funzioni di sistema (cessione della proprietà, scollegamento del giocatore) devono poter passare dai controlli
  perform set_config('app.membership', 'on', true);
  perform set_config('app.linking', 'on', true);
  perform set_config('app.audit_skip', 'on', true);       -- gli effetti a cascata non riempiono il registro
  delete from auth.users where id = uid;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ── Unisci giocatori: una sola riga «giocatori uniti» (invece di una per ogni pagella spostata) ──
create or replace function public.merge_players(keep uuid, drop_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare lg uuid; k players%rowtype; d players%rowtype; keep_league uuid;
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  if keep = drop_id then raise exception 'Scegli due giocatori diversi'; end if;
  select * into k from players where id = keep for update;
  select * into d from players where id = drop_id for update;
  if k.id is null or d.id is null then raise exception 'Giocatore non trovato'; end if;
  -- chi unisce deve essere amministratore di TUTTE le leghe del doppione e di almeno una del giocatore tenuto
  for lg in select league_id from league_players where player_id = drop_id loop
    if not public.is_league_admin(lg) then raise exception 'Permesso negato: devi essere amministratore di tutte le leghe in cui gioca il doppione'; end if;
  end loop;
  if not exists (select 1 from league_players lp where lp.player_id = keep and public.is_league_admin(lp.league_id)) then
    raise exception 'Permesso negato: devi essere amministratore di una lega del giocatore da tenere';
  end if;
  if exists (select 1 from match_players a join match_players b on a.match_id = b.match_id where a.player_id = keep and b.player_id = drop_id) then
    raise exception 'I due giocatori risultano nella stessa partita: non si possono unire';
  end if;
  if k.user_id is not null and d.user_id is not null then
    raise exception 'Entrambi i giocatori hanno un account collegato: scollega prima uno dei due';
  end if;
  select min(lp.league_id) into keep_league from league_players lp where lp.player_id = keep having count(*) = 1;
  perform public.audit_event('players.merge', 'players', keep::text, keep_league, d.name || ' → ' || k.name, 'account',
                             jsonb_build_object('tenuto', k.name, 'assorbito', d.name, 'tenuto_id', keep, 'assorbito_id', drop_id));
  perform set_config('app.audit_skip', 'on', true);       -- le singole pagelle spostate non si registrano una per una
  perform set_config('app.linking', 'on', true);
  if d.user_id is not null then
    update players set user_id = null where id = drop_id;
    update players set user_id = d.user_id where id = keep;
  end if;
  -- leghe (con soprannomi uniti)
  update league_players lp set aliases = (select coalesce(array_agg(distinct x), '{}') from unnest(lp.aliases || coalesce(dl.aliases, '{}') || array[d.name]) x where x <> k.name),
         nickname = coalesce(lp.nickname, dl.nickname)
    from league_players dl where lp.player_id = keep and dl.player_id = drop_id and dl.league_id = lp.league_id;
  insert into league_players(league_id, player_id, nickname, aliases, archived)
    select league_id, keep, nickname, aliases, archived from league_players where player_id = drop_id
    on conflict do nothing;
  delete from league_players where player_id = drop_id;
  -- partite, pagelle e storico delle statistiche
  update match_players set player_id = keep where player_id = drop_id;
  update player_stats_history set player_id = keep where player_id = drop_id;
  delete from players where id = drop_id;     -- inviti e richieste del doppione se ne vanno con lui
end $$;
revoke all on function public.merge_players(uuid, uuid) from public, anon;
grant execute on function public.merge_players(uuid, uuid) to authenticated;

-- fine ✔
