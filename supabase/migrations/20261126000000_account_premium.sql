-- Il Premium appartiene all'account, non alla lega. Nessun accesso diretto dal client.
create table public.account_premium (
  user_id uuid primary key references auth.users(id) on delete cascade,
  expires_at timestamptz,
  lifetime boolean not null default false,
  trial_expires_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.account_premium enable row level security;
revoke all on public.account_premium from public, anon, authenticated;

-- Gli amministratori già presenti al momento della migrazione mantengono
-- l'accesso a vita; le nomine successive non ricevono automaticamente il beneficio.
insert into public.account_premium (user_id, lifetime)
select user_id, true from public.league_members where role = 'admin'
union
select user_id, true from public.platform_admins
on conflict (user_id) do update set lifetime = true, expires_at = null, trial_expires_at = null;

-- Data dell'ultima partita effettivamente disputata, distinta dall'ultima attività.
create function public.admin_league_last_matches()
returns table (league_id uuid, last_match date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Permesso negato'; end if;
  return query select m.league_id, max(m.date) from public.matches m
    where m.date <= current_date and m.score_a is not null and m.score_b is not null
    group by m.league_id;
end $$;
revoke all on function public.admin_league_last_matches() from public, anon;
grant execute on function public.admin_league_last_matches() to authenticated;

-- La prova parte solo per gli account creati dopo l'attivazione della migrazione.
create function public.start_premium_trial()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.account_premium (user_id, expires_at, trial_expires_at)
  values (new.id, coalesce(new.created_at, now()) + interval '1 month', coalesce(new.created_at, now()) + interval '1 month');
  return new;
end $$;
revoke all on function public.start_premium_trial() from public, anon, authenticated;
create trigger start_premium_trial after insert on auth.users
  for each row execute function public.start_premium_trial();

-- La scadenza e lo stato sono calcolati dal database, anche dopo la scadenza.
create function public.my_premium_status()
returns table (active boolean, expires_at timestamptz, trial boolean, trial_expires_at timestamptz, lifetime boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(p.lifetime or p.expires_at > now(), false), p.expires_at,
    coalesce(not p.lifetime and p.trial_expires_at > now() and p.expires_at > now(), false), p.trial_expires_at, coalesce(p.lifetime, false)
  from (select auth.uid() as uid) u left join public.account_premium p on p.user_id = u.uid;
$$;
revoke all on function public.my_premium_status() from public, anon;
grant execute on function public.my_premium_status() to authenticated;

create function public.admin_premium_statuses()
returns table (user_id uuid, active boolean, expires_at timestamptz, trial boolean, trial_expires_at timestamptz, lifetime boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Permesso negato'; end if;
  return query select p.user_id, p.lifetime or coalesce(p.expires_at > now(), false), p.expires_at,
    coalesce(not p.lifetime and p.trial_expires_at > now() and p.expires_at > now(), false), p.trial_expires_at, p.lifetime from public.account_premium p;
end $$;
revoke all on function public.admin_premium_statuses() from public, anon;
grant execute on function public.admin_premium_statuses() to authenticated;

-- Un rinnovo aggiunge mesi alla scadenza se ancora attiva, altrimenti alla data attuale.
create function public.admin_extend_premium(p_user uuid, p_months integer)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare result timestamptz;
begin
  if not public.is_super_admin() then raise exception 'Permesso negato'; end if;
  if p_months is null or p_months < 1 or p_months > 120 then raise exception 'Durata non valida'; end if;
  if exists (select 1 from public.account_premium where user_id = p_user and lifetime) then raise exception 'Premium già a vita'; end if;
  insert into public.account_premium as p (user_id, expires_at, updated_by)
    values (p_user, now() + make_interval(months => p_months), auth.uid())
    on conflict (user_id) do update set
      expires_at = greatest(p.expires_at, now()) + make_interval(months => p_months),
      updated_at = now(), updated_by = auth.uid()
    returning expires_at into result;
  return result;
end $$;
revoke all on function public.admin_extend_premium(uuid, integer) from public, anon;
grant execute on function public.admin_extend_premium(uuid, integer) to authenticated;

create function public.admin_grant_lifetime_premium(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Permesso negato'; end if;
  insert into public.account_premium (user_id, lifetime, updated_by)
    values (p_user, true, auth.uid())
    on conflict (user_id) do update set lifetime = true, expires_at = null,
      trial_expires_at = null, updated_at = now(), updated_by = auth.uid();
end $$;
revoke all on function public.admin_grant_lifetime_premium(uuid) from public, anon;
grant execute on function public.admin_grant_lifetime_premium(uuid) to authenticated;

create function public.admin_end_premium(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Permesso negato'; end if;
  update public.account_premium set lifetime = false, expires_at = least(coalesce(expires_at, now()), now()), trial_expires_at = least(trial_expires_at, now()), updated_at = now(), updated_by = auth.uid() where user_id = p_user;
end $$;
revoke all on function public.admin_end_premium(uuid) from public, anon;
grant execute on function public.admin_end_premium(uuid) to authenticated;
