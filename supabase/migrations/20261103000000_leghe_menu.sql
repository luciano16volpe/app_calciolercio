-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · Fase 4.5: leghe con indirizzo (slug), creatore, proposte di amministratore,
--  amministratore supremo, ingresso automatico del giocatore collegato.
--  Solo aggiunte e sostituzioni di funzioni: nessun dato viene cancellato.
--  Applicare con:  npx supabase db push --linked
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Amministratore supremo ─────────────────────────────────────────────────
-- Non si assegna dall'app: una riga inserita a mano nello SQL Editor (vedi docs/COLLAUDO.md).
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.platform_admins enable row level security;   -- nessuna regola: la leggono solo le funzioni qui sotto

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;
revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;

-- ── Indirizzo della lega (slug) e creatore (owner) ─────────────────────────
alter table public.leagues add column if not exists slug text;
alter table public.leagues add column if not exists owner_id uuid references auth.users(id) on delete set null;

create or replace function public.slugify(t text)
returns text language sql immutable set search_path = public as $$
  select coalesce(nullif(trim(both '-' from regexp_replace(
    lower(translate(t, 'àèéìòùÀÈÉÌÒÙ', 'aeeiouaeeiou')), '[^a-z0-9]+', '-', 'g')), ''), 'lega');
$$;

create or replace function public.unique_league_slug(base text, except_id uuid default null)
returns text language plpgsql set search_path = public as $$
declare cand text := base; n int := 1;
begin
  while exists (select 1 from leagues where slug = cand and (except_id is null or id <> except_id)) loop
    n := n + 1; cand := base || '-' || n;
  end loop;
  return cand;
end $$;

-- lega esistente: slug dal nome, creatore = chi l'ha creata (altrimenti l'amministratore più anziano)
do $$ declare r record; begin
  for r in select id, name from public.leagues where slug is null loop
    update public.leagues set slug = public.unique_league_slug(public.slugify(r.name), r.id) where id = r.id;
  end loop;
  update public.leagues l set owner_id = coalesce(l.created_by,
    (select m.user_id from public.league_members m where m.league_id = l.id and m.role = 'admin' order by m.joined_at limit 1))
   where l.owner_id is null;
end $$;
alter table public.leagues alter column slug set not null;
create unique index if not exists leagues_slug_key on public.leagues(slug);

-- nuova lega: slug dal nome, chi la crea ne è il proprietario (non si può dichiarare un altro)
create or replace function public.leagues_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.slug is null or new.slug = '' then new.slug := public.unique_league_slug(public.slugify(new.name)); end if;
  if auth.uid() is not null then new.owner_id := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists leagues_before_insert on public.leagues;
create trigger leagues_before_insert before insert on public.leagues for each row execute function public.leagues_before_insert();

-- il proprietario cambia solo con la cessione (o dal sistema)
create or replace function public.leagues_guard_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is distinct from old.owner_id and auth.uid() is not null
     and coalesce(current_setting('app.membership', true), '') <> 'on' then
    raise exception 'Il creatore della lega si cambia solo con la cessione della proprietà';
  end if;
  return new;
end $$;
drop trigger if exists leagues_guard_owner on public.leagues;
create trigger leagues_guard_owner before update on public.leagues for each row execute function public.leagues_guard_owner();

-- ── Proposte di amministratore ─────────────────────────────────────────────
create table if not exists public.league_admin_requests (
  id           uuid primary key default gen_random_uuid(),
  league_id    uuid not null references public.leagues(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  requested_by uuid default auth.uid() references auth.users(id) on delete set null,
  status       text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  created_at   timestamptz not null default now(),
  decided_by   uuid references auth.users(id) on delete set null,
  decided_at   timestamptz
);
create unique index if not exists league_admin_requests_one_pending on public.league_admin_requests(league_id, user_id) where status = 'pending';
alter table public.league_admin_requests enable row level security;
drop policy if exists admin_requests_select on public.league_admin_requests;
create policy admin_requests_select on public.league_admin_requests for select to authenticated
  using (public.is_league_admin(league_id));       -- nessuna scrittura diretta: solo le funzioni

-- ── Controlli sui ruoli, nel database ──────────────────────────────────────
-- Vale per ogni scrittura su league_members fatta da un utente (app o chiamate dirette).
-- Il sistema (SQL Editor, auth.uid() nullo) e le funzioni che impostano app.membership='on' passano.
create or replace function public.league_members_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare lg uuid; own uuid; actor uuid := auth.uid(); other_admins int;
begin
  if actor is null or coalesce(current_setting('app.membership', true), '') = 'on' then return coalesce(new, old); end if;
  lg := coalesce(new.league_id, old.league_id);
  if not exists (select 1 from leagues where id = lg) then return coalesce(new, old); end if;   -- lega in eliminazione
  select owner_id into own from leagues where id = lg;

  if tg_op = 'INSERT' then
    if new.role = 'admin' and actor is distinct from own then
      raise exception 'Solo il creatore della lega può nominare un amministratore: puoi proporlo';
    end if;
    return new;
  end if;

  select count(*) into other_admins from league_members
   where league_id = lg and role = 'admin' and user_id <> old.user_id;

  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id or new.league_id <> old.league_id then
      raise exception 'Non si può spostare un membro';
    end if;
    if new.role = old.role then return new; end if;
    if old.user_id is not distinct from own then raise exception 'Il ruolo del creatore non si cambia'; end if;
    if new.role = 'admin' and actor is distinct from own then
      raise exception 'Solo il creatore della lega può nominare un amministratore: puoi proporlo';
    end if;
    if old.role = 'admin' and actor is distinct from own then
      raise exception 'Solo il creatore della lega toglie il ruolo di amministratore';
    end if;
    if old.role = 'admin' and other_admins = 0 then raise exception 'Deve restare almeno un amministratore'; end if;
    return new;
  end if;

  -- DELETE
  if old.user_id is not distinct from own then
    raise exception 'Il creatore non può lasciare la lega: prima cedi la proprietà o elimina la lega';
  end if;
  if old.role = 'admin' then
    if actor is distinct from own and actor <> old.user_id then
      raise exception 'Solo il creatore della lega rimuove un amministratore';
    end if;
    if other_admins = 0 then raise exception 'Deve restare almeno un amministratore'; end if;
  end if;
  return old;
end $$;
drop trigger if exists league_members_guard on public.league_members;
create trigger league_members_guard before insert or update or delete on public.league_members
  for each row execute function public.league_members_guard();

-- chi entra in una lega porta con sé il suo giocatore (niente doppioni)
create or replace function public.league_members_add_player()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into league_players(league_id, player_id)
  select new.league_id, p.id from players p where p.user_id = new.user_id
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists league_members_add_player on public.league_members;
create trigger league_members_add_player after insert on public.league_members
  for each row execute function public.league_members_add_player();

-- ── Funzioni: proposte, decisione, cessione ────────────────────────────────
create or replace function public.propose_admin(l uuid, u uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if not public.is_league_admin(l) then raise exception 'Permesso negato: solo un amministratore può proporre'; end if;
  if (select owner_id from leagues where id = l) = auth.uid() then
    raise exception 'Sei il creatore: puoi nominare direttamente l''amministratore';
  end if;
  if not exists (select 1 from league_members where league_id = l and user_id = u) then raise exception 'La persona non fa parte della lega'; end if;
  if exists (select 1 from league_members where league_id = l and user_id = u and role = 'admin') then raise exception 'È già amministratore'; end if;
  if exists (select 1 from league_admin_requests where league_id = l and user_id = u and status = 'pending') then raise exception 'Proposta già in attesa'; end if;
  insert into league_admin_requests(league_id, user_id) values (l, u) returning id into rid;
  return rid;
end $$;

create or replace function public.decide_admin_request(c uuid, approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare rq league_admin_requests%rowtype;
begin
  select * into rq from league_admin_requests where id = c for update;
  if rq.id is null then raise exception 'Proposta non trovata'; end if;
  if (select owner_id from leagues where id = rq.league_id) is distinct from auth.uid() then
    raise exception 'Permesso negato: solo il creatore della lega decide';
  end if;
  if rq.status <> 'pending' then raise exception 'Proposta già decisa'; end if;
  if approve then
    update league_members set role = 'admin' where league_id = rq.league_id and user_id = rq.user_id;
    update league_admin_requests set status = 'approved', decided_by = auth.uid(), decided_at = now() where id = c;
  else
    update league_admin_requests set status = 'rejected', decided_by = auth.uid(), decided_at = now() where id = c;
  end if;
end $$;

create or replace function public.cancel_admin_request(c uuid)
returns void language plpgsql security definer set search_path = public as $$
declare rq league_admin_requests%rowtype;
begin
  select * into rq from league_admin_requests where id = c for update;
  if rq.id is null then raise exception 'Proposta non trovata'; end if;
  if rq.requested_by is distinct from auth.uid()
     and (select owner_id from leagues where id = rq.league_id) is distinct from auth.uid() then
    raise exception 'Permesso negato';
  end if;
  if rq.status <> 'pending' then raise exception 'Proposta già decisa'; end if;
  update league_admin_requests set status = 'cancelled', decided_by = auth.uid(), decided_at = now() where id = c;
end $$;

create or replace function public.transfer_league_ownership(l uuid, new_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select owner_id from leagues where id = l) is distinct from auth.uid() then
    raise exception 'Permesso negato: solo il creatore cede la proprietà';
  end if;
  if not exists (select 1 from league_members where league_id = l and user_id = new_owner and role = 'admin') then
    raise exception 'Il nuovo creatore deve essere già amministratore della lega';
  end if;
  perform set_config('app.membership', 'on', true);
  update leagues set owner_id = new_owner where id = l;
  update league_admin_requests set status = 'cancelled', decided_by = auth.uid(), decided_at = now()
   where league_id = l and user_id = new_owner and status = 'pending';
end $$;

create or replace function public.regenerate_invite_code(l uuid)
returns text language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if not public.is_league_admin(l) then raise exception 'Permesso negato: solo l''amministratore'; end if;
  code := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  update leagues set invite_code = code where id = l;
  return code;
end $$;

-- proposte in attesa di una lega, con i nomi (le vedono gli amministratori)
create or replace function public.admin_requests_list(l uuid)
returns table (id uuid, user_id uuid, display_name text, email text, requested_by_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_league_admin(l) then raise exception 'Permesso negato'; end if;
  return query
    select r.id, r.user_id, p.display_name, u.email::text, coalesce(rp.display_name, ru.email::text), r.created_at
      from league_admin_requests r
      left join profiles p on p.id = r.user_id
      left join auth.users u on u.id = r.user_id
      left join profiles rp on rp.id = r.requested_by
      left join auth.users ru on ru.id = r.requested_by
     where r.league_id = l and r.status = 'pending'
     order by r.created_at;
end $$;

-- elenco membri: ora con "creatore" e "proposto come admin"
drop function if exists public.league_member_list(uuid);
create function public.league_member_list(l uuid)
returns table (user_id uuid, role public.league_role, display_name text, email text, joined_at timestamptz, is_owner boolean, admin_request_id uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_league_admin(l) then
    raise exception 'Permesso negato: solo l''amministratore vede i membri';
  end if;
  return query
    select m.user_id, m.role, p.display_name, u.email::text, m.joined_at,
           (lg.owner_id = m.user_id),
           (select r.id from league_admin_requests r where r.league_id = l and r.user_id = m.user_id and r.status = 'pending' limit 1)
      from league_members m
      join leagues lg on lg.id = m.league_id
      left join profiles p on p.id = m.user_id
      left join auth.users u on u.id = m.user_id
     where m.league_id = l
     order by (lg.owner_id = m.user_id) desc, (m.role = 'admin') desc, (m.role = 'redazione') desc, lower(coalesce(p.display_name, u.email::text));
end $$;

-- entrare con il codice: il giocatore collegato entra con te (lo fa l'automatismo su league_members)
create or replace function public.join_league(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare lg uuid;
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  select id into lg from leagues where invite_code = trim(code);
  if lg is null then raise exception 'Codice non valido'; end if;
  insert into league_members(league_id, user_id, role) values (lg, auth.uid(), 'member') on conflict do nothing;
  return lg;
end $$;

-- ── Account cancellato: la proprietà passa all'amministratore più anziano ──
create or replace function public.users_before_delete()
returns trigger language plpgsql security definer set search_path = public as $$
declare lg record; nxt uuid;
begin
  perform set_config('app.membership', 'on', true);
  for lg in select id from leagues where owner_id = old.id loop
    select user_id into nxt from league_members where league_id = lg.id and role = 'admin' and user_id <> old.id order by joined_at limit 1;
    update leagues set owner_id = nxt where id = lg.id;     -- null = senza proprietario: lo assegna l'amministratore supremo
  end loop;
  return old;
end $$;
drop trigger if exists users_before_delete on auth.users;
create trigger users_before_delete before delete on auth.users for each row execute function public.users_before_delete();

-- ── Amministratore supremo: elenchi in sola lettura ────────────────────────
create or replace function public.admin_list_leagues()
returns table (id uuid, name text, slug text, is_public boolean, owner_name text, owner_missing boolean, admins text, members bigint, matches bigint, created_at timestamptz, last_activity timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Permesso negato'; end if;
  return query
    select l.id, l.name, l.slug, l.is_public,
           coalesce(op.display_name, ou.email::text), (l.owner_id is null),
           (select string_agg(coalesce(p.display_name, u.email::text), ', ' order by p.display_name)
              from league_members m left join profiles p on p.id = m.user_id left join auth.users u on u.id = m.user_id
             where m.league_id = l.id and m.role = 'admin'),
           (select count(*) from league_members m where m.league_id = l.id),
           (select count(*) from matches x where x.league_id = l.id),
           l.created_at,
           greatest(l.created_at, coalesce((select max(x.created_at) from matches x where x.league_id = l.id), l.created_at))
      from leagues l
      left join profiles op on op.id = l.owner_id
      left join auth.users ou on ou.id = l.owner_id
     order by l.created_at;
end $$;

create or replace function public.admin_list_users()
returns table (id uuid, display_name text, email text, last_sign_in_at timestamptz, created_at timestamptz, leagues text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Permesso negato'; end if;
  return query
    select u.id, p.display_name, u.email::text, u.last_sign_in_at, u.created_at,
           (select string_agg(l.name || ' (' || m.role || ')', ', ' order by l.name)
              from league_members m join leagues l on l.id = m.league_id where m.user_id = u.id)
      from auth.users u left join profiles p on p.id = u.id
     order by u.created_at;
end $$;

-- assegnare una lega senza proprietario (solo amministratore supremo)
create or replace function public.admin_assign_owner(l uuid, new_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Permesso negato'; end if;
  if not exists (select 1 from league_members where league_id = l and user_id = new_owner and role = 'admin') then
    raise exception 'Il nuovo creatore deve essere già amministratore della lega';
  end if;
  perform set_config('app.membership', 'on', true);
  update leagues set owner_id = new_owner where id = l;
end $$;

-- ── Permessi di esecuzione: solo chi ha fatto l'accesso ────────────────────
do $$ declare f text; begin
  foreach f in array array[
    'propose_admin(uuid,uuid)', 'decide_admin_request(uuid,boolean)', 'cancel_admin_request(uuid)',
    'transfer_league_ownership(uuid,uuid)', 'regenerate_invite_code(uuid)', 'admin_requests_list(uuid)',
    'league_member_list(uuid)', 'join_league(text)', 'admin_list_leagues()', 'admin_list_users()', 'admin_assign_owner(uuid,uuid)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- fine ✔
