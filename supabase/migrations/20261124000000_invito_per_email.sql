-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · Invito libero (da «Inviti giocatori» → «Invita»)
--  L'amministratore scrive un indirizzo email e ottiene un LINK personale da girare su WhatsApp o altrove.
--  Chi lo apre (con o senza app, con o senza account) entra nella lega come membro e, se non ha un giocatore:
--    · si collega a un giocatore libero già in Rosa (parte la richiesta «Questo sono io», decide l'amministratore), oppure
--    · si crea un giocatore nuovo (nome, ruoli, statistiche scelte da lui): va subito in Rosa; poi le sistema l'amministratore.
--  Il link è personale, vale per una persona sola e scade dopo 7 giorni. L'email è solo un'etichetta.
--  TODO: l'invio automatico dell'email non c'è ancora (si manda il link a mano).
--  Applicare con:  npx supabase db push --linked
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.league_invites (
  token       text primary key default replace(gen_random_uuid()::text, '-', ''),
  league_id   uuid not null references public.leagues(id) on delete cascade,
  email       text not null,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  revoked     boolean not null default false,
  used_at     timestamptz,
  used_by     uuid references auth.users(id) on delete set null
);
create index if not exists league_invites_league_idx on public.league_invites(league_id, created_at desc);
alter table public.league_invites enable row level security;
drop policy if exists league_invites_select on public.league_invites;
create policy league_invites_select on public.league_invites for select to authenticated using (public.is_league_admin(league_id));
-- nessuna scrittura diretta: solo le funzioni

-- stato letto da tutti allo stesso modo
create or replace function public.league_invite_status(i public.league_invites)
returns text language sql immutable as $$
  select case when i.used_at is not null then 'used' when i.revoked then 'revoked' when i.expires_at < now() then 'expired' else 'valid' end
$$;

-- ── Crea il link (solo amministratore della lega) ──────────────────────────
create or replace function public.create_league_invite(l uuid, p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare e text := lower(btrim(coalesce(p_email, ''))); tok text;
begin
  if auth.uid() is null or not public.is_league_admin(l) then raise exception 'Permesso negato: solo l''amministratore crea gli inviti'; end if;
  if length(e) > 254 or e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Indirizzo email non valido'; end if;
  -- un solo link valido per indirizzo: il vecchio smette di funzionare
  update league_invites set revoked = true where league_id = l and email = e and not revoked and used_at is null;
  insert into league_invites(league_id, email) values (l, e) returning token into tok;
  return tok;
end $$;

-- ── Anteprima (anche senza account: il codice nel link è il segreto) ───────
create or replace function public.league_invite_preview(tok text)
returns table (status text, league_name text)
language plpgsql stable security definer set search_path = public as $$
declare i league_invites%rowtype;
begin
  select * into i from league_invites where token = tok;
  if i.token is null then return query select 'invalid'::text, null::text; return; end if;
  return query select public.league_invite_status(i), (select name from leagues where id = i.league_id);
end $$;

-- ── Giocatori liberi della lega, per «Sono già in Rosa» (serve l'account e un link valido) ──
create or replace function public.league_invite_players(tok text)
returns table (player_id uuid, name text)
language plpgsql stable security definer set search_path = public as $$
declare i league_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  select * into i from league_invites where token = tok;
  if i.token is null or public.league_invite_status(i) <> 'valid' and i.used_by is distinct from auth.uid() then
    raise exception 'Link non valido: chiedi un nuovo invito';
  end if;
  return query
    select lp.player_id, p.name from league_players lp join players p on p.id = lp.player_id
     where lp.league_id = i.league_id and p.user_id is null order by lower(p.name);
end $$;

-- ── Accetta: entra nella lega e (se serve) collega o crea il giocatore ─────
--  esito: 'has_player' (aveva già un giocatore: entra con quello) · 'claim_sent' (richiesta all'amministratore)
--         'created' (giocatore nuovo in Rosa) · 'joined' (solo membro, il giocatore verrà dopo)
create or replace function public.accept_league_invite(
  tok text, p_player uuid default null, p_name text default null, p_roles text[] default null, p_stats int[] default null)
returns table (league_id uuid, league_name text, league_slug text, player_id uuid, player_name text, outcome text)
language plpgsql security definer set search_path = public as $$
declare i league_invites%rowtype; mine players%rowtype; nn text := btrim(coalesce(p_name, '')); pid uuid; res text; lg leagues%rowtype;
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  select * into i from league_invites where token = tok for update;
  if i.token is null then raise exception 'Link non valido: chiedi un nuovo invito'; end if;
  select * into lg from leagues where id = i.league_id;
  select * into mine from players where user_id = auth.uid();
  -- già fatto dallo stesso account (apre il link due volte): nessun errore, nessun doppione
  if i.used_at is not null and i.used_by = auth.uid() then
    insert into league_members(league_id, user_id, role) values (i.league_id, auth.uid(), 'member') on conflict do nothing;
    return query select lg.id, lg.name, lg.slug, mine.id, mine.name, case when mine.id is null then 'joined' else 'has_player' end;
    return;
  end if;
  if i.used_at is not null then raise exception 'Questo link è già stato usato'; end if;
  if i.revoked then raise exception 'Questo link non è più valido: chiedi un nuovo invito'; end if;
  if i.expires_at < now() then raise exception 'Questo link è scaduto: chiedi un nuovo invito'; end if;

  -- 1) membro della lega (chi ha già un giocatore lo porta con sé: lo fa l'automatismo su league_members)
  insert into league_members(league_id, user_id, role) values (i.league_id, auth.uid(), 'member') on conflict do nothing;

  if mine.id is not null then
    res := 'has_player'; pid := mine.id;
  elsif p_player is not null then
    perform public.request_claim(i.league_id, p_player);            -- decide l'amministratore («Richieste sono io»)
    res := 'claim_sent'; pid := p_player;
  elsif nn <> '' then
    if length(nn) > 40 then raise exception 'Nome troppo lungo (massimo 40 caratteri)'; end if;
    if p_roles is null or coalesce(array_length(p_roles, 1), 0) = 0 then raise exception 'Almeno un ruolo è richiesto'; end if;
    if not (p_roles <@ array['ATT','MED','DIF']) then raise exception 'Ruolo non valido'; end if;
    if p_stats is null or array_length(p_stats, 1) is distinct from 11 or not (0 <= all(p_stats) and 10 >= all(p_stats)) then
      raise exception 'Servono 11 statistiche da 0 a 10';
    end if;
    if exists (
      select 1 from league_players lp join players p on p.id = lp.player_id
       where lp.league_id = i.league_id
         and (public.norm_name(p.name) = public.norm_name(nn)
              or exists (select 1 from unnest(lp.aliases) a where public.norm_name(a) = public.norm_name(nn)))
    ) then
      raise exception 'Il nome «%» è già usato da un altro giocatore della lega', nn;
    end if;
    pid := gen_random_uuid();
    insert into players(id, name, roles, stats, created_by) values (pid, nn, p_roles, p_stats::smallint[], auth.uid());
    perform set_config('app.linking', 'on', true);
    update players set user_id = auth.uid() where id = pid;
    insert into league_players(league_id, player_id) values (i.league_id, pid) on conflict do nothing;
    res := 'created';
  else
    res := 'joined';
  end if;

  update league_invites set used_at = now(), used_by = auth.uid() where token = tok;
  return query select lg.id, lg.name, lg.slug, pid, (select name from players where id = pid), res;
end $$;

-- permessi: le funzioni di scrittura solo a chi ha l'account; l'anteprima anche ai visitatori
do $$ declare f text; begin
  foreach f in array array[
    'create_league_invite(uuid,text)', 'league_invite_players(text)',
    'accept_league_invite(text,uuid,text,text[],int[])'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public.league_invite_preview(text) from public;
grant execute on function public.league_invite_preview(text) to anon, authenticated;

-- fine ✔
