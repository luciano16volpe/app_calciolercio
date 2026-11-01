-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · Fase 4.7 (correzione): nel registro la lega del giocatore si sceglieva con min(uuid), che non esiste.
--  Si ridefiniscono le due funzioni interessate (audit_row e merge_players) con la correzione.
--  Applicare con:  npx supabase db push --linked
-- ═══════════════════════════════════════════════════════════════════════════

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
      select (array_agg(lp.league_id))[1] into lg from league_players lp where lp.player_id = (r->>'id')::uuid
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
  select (array_agg(lp.league_id))[1] into keep_league from league_players lp where lp.player_id = keep having count(*) = 1;
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
