-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · Panchina: i giocatori si tolgono dalla LEGA (non si «archiviano»)
--   · via l'archiviazione (colonna league_players.archived, mai usata dall'app);
--   · remove_player_from_league: l'amministratore toglie un giocatore dalla Rosa della sua lega. Storia (partite, pagelle,
--     classifiche) intatta; se la persona ha un account collegato esce anche dalla lega; senza altre leghe finisce in PANCHINA;
--   · bench_players / add_player_to_league: ogni amministratore di lega vede la Panchina e vi pesca per la sua lega;
--   · delete_bench_player: solo l'amministratore supremo cancella per sempre (e solo chi non ha mai giocato);
--   · player_visible: chi ha giocato partite di una lega che vedi resta leggibile anche dopo essere uscito dalla Rosa.
--  Applicare con:  npx supabase db push --linked
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Via «archived»: le funzioni che la usavano si riscrivono senza ──────────
create or replace function public.league_players_status(l uuid)
returns table (player_id uuid, name text, linked boolean, linked_name text, invite_token text, invite_created timestamptz, invite_expires timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_league_admin(l) then raise exception 'Permesso negato'; end if;
  return query
    select lp.player_id, p.name, (p.user_id is not null), coalesce(pr.display_name, u.email::text),
           iv.token, iv.created_at, iv.expires_at
      from league_players lp
      join players p on p.id = lp.player_id
      left join profiles pr on pr.id = p.user_id
      left join auth.users u on u.id = p.user_id
      left join lateral (
        select i.token, i.created_at, i.expires_at from player_invites i
         where i.player_id = lp.player_id and i.league_id = l and not i.revoked and i.used_at is null and i.expires_at > now()
         order by i.created_at desc limit 1) iv on true
     order by lower(p.name);
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
  insert into league_players(league_id, player_id, nickname, aliases)
    select league_id, keep, nickname, aliases from league_players where player_id = drop_id
    on conflict do nothing;
  delete from league_players where player_id = drop_id;
  -- partite, pagelle e storico delle statistiche
  update match_players set player_id = keep where player_id = drop_id;
  update player_stats_history set player_id = keep where player_id = drop_id;
  delete from players where id = drop_id;     -- inviti e richieste del doppione se ne vanno con lui
end $$;
revoke all on function public.merge_players(uuid, uuid) from public, anon;
grant execute on function public.merge_players(uuid, uuid) to authenticated;

create or replace function public.players_unclaimed(l uuid)
returns table (player_id uuid, name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.league_visible(l) then raise exception 'Permesso negato'; end if;
  return query
    select lp.player_id, p.name
      from league_players lp
      join players p on p.id = lp.player_id
     where lp.league_id = l and p.user_id is null
     order by lower(p.name);
end $$;

alter table public.league_players drop column if exists archived;

-- ── 2. Chi ha giocato nelle partite di una lega che vedi si legge ancora, anche fuori dalla Rosa ──
create or replace function public.player_visible(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from players where id = p and (user_id = auth.uid() or created_by = auth.uid()))
      or exists (select 1 from league_players lp where lp.player_id = p and public.league_visible(lp.league_id))
      or exists (select 1 from match_players mp join matches m on m.id = mp.match_id where mp.player_id = p and public.league_visible(m.league_id));
$$;

-- ── 3. Eliminare un giocatore: solo chi non è in nessuna lega e non ha mai giocato, e solo l'amministratore supremo
--       (o chi l'ha appena creato, per annullare un errore) ──
create or replace function public.can_delete_player(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from league_players where player_id = p)
     and not exists (select 1 from match_players where player_id = p)
     and (public.is_super_admin() or exists (select 1 from players where id = p and created_by = auth.uid()));
$$;
revoke all on function public.can_delete_player(uuid) from public, anon;
grant execute on function public.can_delete_player(uuid) to authenticated;

-- ── 4. Togliere un giocatore dalla lega ─────────────────────────────────────
create or replace function public.remove_player_from_league(p_league uuid, p_player uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid; r text; remaining int;
begin
  if not public.is_league_admin(p_league) then raise exception 'Permesso negato: solo un amministratore della lega toglie un giocatore'; end if;
  if not exists (select 1 from league_players where league_id = p_league and player_id = p_player) then raise exception 'Questo giocatore non è nella lega'; end if;
  select user_id into uid from players where id = p_player;
  if uid is not null then
    select role into r from league_members where league_id = p_league and user_id = uid;
    if r = 'admin' then raise exception 'Il giocatore è collegato a un amministratore della lega: togli prima il ruolo da «Membri e ruoli»'; end if;
  end if;
  delete from league_players where league_id = p_league and player_id = p_player;
  update player_invites set revoked = true where league_id = p_league and player_id = p_player and not revoked and used_at is null;
  delete from player_claims where league_id = p_league and player_id = p_player and status = 'pending';
  if uid is not null then delete from league_members where league_id = p_league and user_id = uid; end if;
  select count(*) into remaining from league_players where player_id = p_player;
  return remaining = 0;     -- true = ora è in Panchina
end $$;
revoke all on function public.remove_player_from_league(uuid, uuid) from public, anon;
grant execute on function public.remove_player_from_league(uuid, uuid) to authenticated;

-- ── 5. Panchina: giocatori senza lega, visibili a ogni amministratore di lega ──
create or replace function public.bench_players()
returns table (player_id uuid, name text, roles text[], photo_path text, linked boolean, matches_played bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_any_admin() or public.is_super_admin()) then raise exception 'Permesso negato: la Panchina è per gli amministratori'; end if;
  return query
    select p.id, p.name, p.roles, p.photo_path, (p.user_id is not null),
           (select count(*) from match_players mp where mp.player_id = p.id)
      from players p
     where not exists (select 1 from league_players lp where lp.player_id = p.id)
     order by lower(p.name);
end $$;
revoke all on function public.bench_players() from public, anon;
grant execute on function public.bench_players() to authenticated;

-- dalla Panchina alla mia lega (solo chi è in Panchina); se ha un account collegato rientra anche nella lega
create or replace function public.add_player_to_league(p_league uuid, p_player uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_league_admin(p_league) then raise exception 'Permesso negato: solo un amministratore della lega aggiunge un giocatore'; end if;
  select user_id into uid from players where id = p_player;
  if not found then raise exception 'Giocatore non trovato'; end if;
  if exists (select 1 from league_players where player_id = p_player) then raise exception 'Il giocatore non è in Panchina: gioca già in una lega'; end if;
  insert into league_players(league_id, player_id) values (p_league, p_player);
  if uid is not null then insert into league_members(league_id, user_id, role) values (p_league, uid, 'member') on conflict do nothing; end if;
end $$;
revoke all on function public.add_player_to_league(uuid, uuid) from public, anon;
grant execute on function public.add_player_to_league(uuid, uuid) to authenticated;

-- cancellare per sempre: solo l'amministratore supremo, solo chi è in Panchina e non ha mai giocato
create or replace function public.delete_bench_player(p_player uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Permesso negato: solo l''amministratore supremo cancella un giocatore'; end if;
  if exists (select 1 from league_players where player_id = p_player) then raise exception 'Il giocatore gioca ancora in una lega: toglilo prima dalla lega'; end if;
  if exists (select 1 from match_players where player_id = p_player) then raise exception 'Il giocatore ha partite e pagelle nella storia delle leghe: non si cancella (resta in Panchina)'; end if;
  delete from players where id = p_player;
end $$;
revoke all on function public.delete_bench_player(uuid) from public, anon;
grant execute on function public.delete_bench_player(uuid) to authenticated;

-- fine ✔
