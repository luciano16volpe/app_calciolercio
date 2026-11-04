-- Le leghe proposte non esistono fino alla decisione del super amministratore.
create table public.league_creation_requests (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 3 and 40),
  settings jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  league_id uuid references public.leagues(id) on delete set null
);
alter table public.league_creation_requests enable row level security;
revoke all on public.league_creation_requests from public, anon, authenticated;

create function public.has_premium(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.account_premium p where p.user_id = p_user and (p.lifetime or p.expires_at > now()));
$$;
revoke all on function public.has_premium(uuid) from public, anon, authenticated;

-- Un ruolo admin scaduto resta membro della lega ma non abilita azioni gestionali.
create or replace function public.has_league_role(l uuid, r public.league_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.league_members m where m.league_id = l and m.user_id = auth.uid() and m.role = any(r)
    and (m.role <> 'admin' or 'member'::public.league_role = any(r) or public.has_premium(auth.uid())));
$$;
create or replace function public.is_any_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_premium(auth.uid()) and exists(select 1 from public.league_members where user_id = auth.uid() and role = 'admin');
$$;
create or replace function public.can_edit_player(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_premium(auth.uid()) and (
    exists (select 1 from public.league_players lp join public.league_members lm on lm.league_id = lp.league_id where lp.player_id = p and lm.user_id = auth.uid() and lm.role = 'admin')
    or (exists (select 1 from public.players where id = p and created_by = auth.uid()) and public.is_any_admin() and not exists (select 1 from public.league_players where player_id = p)));
$$;
create or replace function public.can_delete_player(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_premium(auth.uid()) and case
    when exists (select 1 from public.league_players where player_id = p) then
      not exists (select 1 from public.league_players lp where lp.player_id = p and not exists (select 1 from public.league_members lm where lm.league_id = lp.league_id and lm.user_id = auth.uid() and lm.role = 'admin'))
    else exists (select 1 from public.players where id = p and created_by = auth.uid()) and public.is_any_admin() end;
$$;

create function public.request_league(p_name text, p_format integer, p_day integer default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if auth.uid() is null or not public.has_premium(auth.uid()) then raise exception 'Serve Premium attivo'; end if;
  if length(trim(coalesce(p_name, ''))) not between 3 and 40 then raise exception 'Nome non valido'; end if;
  if p_format is null or p_format not in (5,6,7) or (p_day is not null and p_day not between 1 and 5) then raise exception 'Impostazioni non valide'; end if;
  if exists (select 1 from public.league_creation_requests r where r.requester = auth.uid() and r.status = 'pending' and lower(trim(r.name)) = lower(trim(p_name))) then raise exception 'Richiesta già in attesa'; end if;
  insert into public.league_creation_requests(requester, name, settings) values (auth.uid(), trim(p_name), jsonb_strip_nulls(jsonb_build_object('format', p_format, 'day', p_day))) returning id into rid;
  return rid;
end $$;
revoke all on function public.request_league(text, integer, integer) from public, anon;
grant execute on function public.request_league(text, integer, integer) to authenticated;

create function public.admin_league_creation_requests()
returns table (id uuid, name text, requester uuid, requester_name text, email text, settings jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Permesso negato'; end if;
  return query select r.id, r.name, r.requester, coalesce(p.display_name, u.email::text), u.email::text, r.settings, r.created_at
    from public.league_creation_requests r join auth.users u on u.id = r.requester left join public.profiles p on p.id = r.requester
    where r.status = 'pending' order by r.created_at;
end $$;
revoke all on function public.admin_league_creation_requests() from public, anon;
grant execute on function public.admin_league_creation_requests() to authenticated;

create function public.admin_decide_league_request(p_id uuid, p_approve boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.league_creation_requests%rowtype; lid uuid; previous_setting text;
begin
  if not public.is_super_admin() then raise exception 'Permesso negato'; end if;
  if p_approve is null then raise exception 'Decisione non valida'; end if;
  select * into r from public.league_creation_requests where id = p_id for update;
  if not found or r.status <> 'pending' then raise exception 'Richiesta non disponibile'; end if;
  if p_approve then
    if not public.has_premium(r.requester) then raise exception 'Il richiedente non ha Premium attivo'; end if;
    if exists(select 1 from public.leagues l where lower(trim(l.name)) = lower(trim(r.name))) then raise exception 'Esiste già una lega con questo nome'; end if;
    previous_setting := current_setting('app.membership', true);
    perform set_config('app.membership', 'on', true);
    insert into public.leagues(name, settings, is_public, created_by) values (r.name, r.settings, false, r.requester) returning id into lid;
    update public.leagues set owner_id = r.requester where id = lid;
    if r.requester <> auth.uid() then delete from public.league_members where league_id = lid and user_id = auth.uid(); end if;
    insert into public.league_members(league_id, user_id, role) values (lid, r.requester, 'admin') on conflict (league_id, user_id) do update set role = 'admin';
    perform set_config('app.membership', coalesce(previous_setting, ''), true);
  end if;
  update public.league_creation_requests set status = case when p_approve then 'approved' else 'rejected' end, league_id = lid, decided_at = now(), decided_by = auth.uid() where id = p_id;
  return lid;
end $$;
revoke all on function public.admin_decide_league_request(uuid, boolean) from public, anon;
grant execute on function public.admin_decide_league_request(uuid, boolean) to authenticated;
