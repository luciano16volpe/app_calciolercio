-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · Fase 4.6: collegamento giocatori ↔ account
--  Inviti personali (strada principale), "questo sono io" con conferma (riserva), scollega, unisci giocatori.
--  Il collegamento (players.user_id) si cambia SOLO con le funzioni qui sotto.
--  Applicare con:  npx supabase db push --linked
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Inviti personali ───────────────────────────────────────────────────────
create table if not exists public.player_invites (
  token       text primary key default replace(gen_random_uuid()::text, '-', ''),
  player_id   uuid not null references public.players(id) on delete cascade,
  league_id   uuid not null references public.leagues(id) on delete cascade,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  revoked     boolean not null default false,
  used_at     timestamptz,
  used_by     uuid references auth.users(id) on delete set null
);
create index if not exists player_invites_player_idx on public.player_invites(player_id, league_id);
alter table public.player_invites enable row level security;
drop policy if exists invites_select on public.player_invites;
create policy invites_select on public.player_invites for select to authenticated using (public.is_league_admin(league_id));
-- nessuna scrittura diretta: solo le funzioni

-- ── Blocco su players.user_id ──────────────────────────────────────────────
-- Anche gli amministratori possono modificare i giocatori, ma non il collegamento all'account:
-- cambia solo con le funzioni che impostano app.linking='on' (valido per la sola transazione).
create or replace function public.players_guard_user_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(current_setting('app.linking', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    if new.user_id is not null then raise exception 'Il collegamento a un account si imposta solo con le funzioni dedicate'; end if;
  elsif new.user_id is distinct from old.user_id then
    raise exception 'Il collegamento a un account si cambia solo con le funzioni dedicate';
  end if;
  return new;
end $$;
drop trigger if exists players_guard_user_id on public.players;
create trigger players_guard_user_id before insert or update on public.players
  for each row execute function public.players_guard_user_id();

-- account cancellato: giocatore scollegato e proprietà delle leghe passata (sostituisce la versione della 4.5)
create or replace function public.users_before_delete()
returns trigger language plpgsql security definer set search_path = public as $$
declare lg record; nxt uuid;
begin
  perform set_config('app.membership', 'on', true);
  perform set_config('app.linking', 'on', true);
  for lg in select id from leagues where owner_id = old.id loop
    select user_id into nxt from league_members where league_id = lg.id and role = 'admin' and user_id <> old.id order by joined_at limit 1;
    update leagues set owner_id = nxt where id = lg.id;     -- null = senza proprietario: lo assegna l'amministratore supremo
  end loop;
  return old;
end $$;

-- ── Invito: crea, anteprima, accetta ───────────────────────────────────────
create or replace function public.create_player_invite(p uuid, l uuid)
returns text language plpgsql security definer set search_path = public as $$
declare tok text;
begin
  if not public.is_league_admin(l) then raise exception 'Permesso negato: solo l''amministratore crea gli inviti'; end if;
  if not exists (select 1 from league_players where league_id = l and player_id = p) then raise exception 'Questo giocatore non è nella lega'; end if;
  if exists (select 1 from players where id = p and user_id is not null) then raise exception 'Questo giocatore è già collegato a un account'; end if;
  update player_invites set revoked = true where player_id = p and league_id = l and not revoked and used_at is null;
  insert into player_invites(player_id, league_id) values (p, l) returning token into tok;
  return tok;
end $$;

-- anteprima dell'invito (anche senza account): il token è il segreto
create or replace function public.invite_preview(tok text)
returns table (status text, player_name text, league_name text)
language plpgsql stable security definer set search_path = public as $$
declare i player_invites%rowtype;
begin
  select * into i from player_invites where token = tok;
  if i.token is null then return query select 'invalid'::text, null::text, null::text; return; end if;
  return query select
    case when i.used_at is not null then 'used' when i.revoked then 'revoked' when i.expires_at < now() then 'expired' else 'valid' end,
    (select name from players where id = i.player_id), (select name from leagues where id = i.league_id);
end $$;

create or replace function public.accept_player_invite(tok text)
returns table (player_id uuid, player_name text, league_id uuid, league_name text, league_slug text)
language plpgsql security definer set search_path = public as $$
declare i player_invites%rowtype; pl players%rowtype; mine players%rowtype;
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  select * into i from player_invites where token = tok for update;
  if i.token is null then raise exception 'Link non valido: chiedi un nuovo invito'; end if;
  select * into pl from players where id = i.player_id for update;
  -- già fatto dallo stesso account (apre il link due volte): nessun errore
  if pl.user_id = auth.uid() then
    insert into league_members(league_id, user_id, role) values (i.league_id, auth.uid(), 'member') on conflict do nothing;
    return query select pl.id, pl.name, i.league_id, (select name from leagues where id = i.league_id), (select slug from leagues where id = i.league_id);
    return;
  end if;
  if i.used_at is not null then raise exception 'Questo link è già stato usato'; end if;
  if i.revoked then raise exception 'Questo link non è più valido: chiedi un nuovo invito'; end if;
  if i.expires_at < now() then raise exception 'Questo link è scaduto: chiedi un nuovo invito'; end if;
  if pl.user_id is not null then raise exception 'Questo giocatore è già collegato a un altro account'; end if;
  select * into mine from players where user_id = auth.uid();
  if mine.id is not null then raise exception 'Il tuo account è già collegato a %', mine.name; end if;
  perform set_config('app.linking', 'on', true);
  update players set user_id = auth.uid() where id = pl.id;
  insert into league_members(league_id, user_id, role) values (i.league_id, auth.uid(), 'member') on conflict do nothing;
  update player_invites set used_at = now(), used_by = auth.uid() where token = tok;
  update player_claims set status = 'rejected', decided_at = now() where status = 'pending' and (player_id = pl.id or user_id = auth.uid());
  return query select pl.id, pl.name, i.league_id, (select name from leagues where id = i.league_id), (select slug from leagues where id = i.league_id);
end $$;

-- ── "Questo sono io": riserva (aggiornate per passare dal blocco) ──────────
create or replace function public.review_claim(c uuid, approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare cl player_claims%rowtype;
begin
  select * into cl from player_claims where id = c for update;
  if cl.id is null then raise exception 'Richiesta non trovata'; end if;
  if not public.is_league_admin(cl.league_id) then raise exception 'Permesso negato: solo l''amministratore decide'; end if;
  if cl.status <> 'pending' then raise exception 'Richiesta già decisa'; end if;
  if approve then
    if exists (select 1 from players where id = cl.player_id and user_id is not null) then
      raise exception 'Questo giocatore è già collegato a un altro account';
    end if;
    if exists (select 1 from players where user_id = cl.user_id) then
      raise exception 'Questo account è già collegato a un giocatore';
    end if;
    perform set_config('app.linking', 'on', true);
    update players set user_id = cl.user_id where id = cl.player_id;
    update player_claims set status = 'approved', decided_by = auth.uid(), decided_at = now() where id = c;
    update player_claims set status = 'rejected', decided_by = auth.uid(), decided_at = now()
     where status = 'pending' and id <> c and (player_id = cl.player_id or user_id = cl.user_id);
  else
    update player_claims set status = 'rejected', decided_by = auth.uid(), decided_at = now() where id = c;
  end if;
end $$;

-- scollega: l'amministratore di una lega del giocatore, oppure la persona stessa. Giocatore e storico restano intatti.
create or replace function public.unlink_player(p uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select user_id into uid from players where id = p;
  if uid is null then return; end if;
  if uid is distinct from auth.uid() and not public.can_edit_player(p) then
    raise exception 'Permesso negato: solo un amministratore o la persona stessa scollega';
  end if;
  perform set_config('app.linking', 'on', true);
  update players set user_id = null where id = p;
  delete from player_claims where player_id = p;
end $$;

create or replace function public.unlink_me()
returns void language plpgsql security definer set search_path = public as $$
declare p uuid;
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  select id into p from players where user_id = auth.uid();
  if p is not null then perform public.unlink_player(p); end if;
  delete from player_claims where user_id = auth.uid();
end $$;

-- ── Elenco per l'amministratore: giocatori della lega con lo stato del collegamento ──
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
     where not lp.archived
     order by lower(p.name);
end $$;

-- ── Unisci giocatori (doppioni) ────────────────────────────────────────────
create or replace function public.merge_players(keep uuid, drop_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare lg uuid; k players%rowtype; d players%rowtype;
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

-- ── Amministratore supremo: amministratori di una lega (per assegnarle un creatore) ──
create or replace function public.admin_league_admins(l uuid)
returns table (user_id uuid, name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Permesso negato'; end if;
  return query
    select m.user_id, coalesce(p.display_name, u.email::text)
      from league_members m left join profiles p on p.id = m.user_id left join auth.users u on u.id = m.user_id
     where m.league_id = l and m.role = 'admin' order by 2;
end $$;

-- ── Permessi di esecuzione ─────────────────────────────────────────────────
do $$ declare f text; begin
  foreach f in array array[
    'create_player_invite(uuid,uuid)', 'accept_player_invite(text)', 'review_claim(uuid,boolean)', 'unlink_player(uuid)', 'unlink_me()',
    'league_players_status(uuid)', 'merge_players(uuid,uuid)', 'admin_league_admins(uuid)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
-- l'anteprima si vede anche prima di accedere
revoke all on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;

-- fine ✔
