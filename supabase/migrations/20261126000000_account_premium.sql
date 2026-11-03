-- Il Premium appartiene all'account, non alla lega. Nessun accesso diretto dal client.
create table public.account_premium (
  user_id uuid primary key references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.account_premium enable row level security;
revoke all on public.account_premium from public, anon, authenticated;

-- La scadenza e lo stato sono calcolati dal database, anche dopo la scadenza.
create function public.my_premium_status()
returns table (active boolean, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select coalesce(p.expires_at > now(), false), p.expires_at
  from (select auth.uid() as uid) u left join public.account_premium p on p.user_id = u.uid;
$$;
revoke all on function public.my_premium_status() from public, anon;
grant execute on function public.my_premium_status() to authenticated;

create function public.admin_premium_statuses()
returns table (user_id uuid, active boolean, expires_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Permesso negato'; end if;
  return query select p.user_id, p.expires_at > now(), p.expires_at from public.account_premium p;
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

create function public.admin_end_premium(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Permesso negato'; end if;
  update public.account_premium set expires_at = least(expires_at, now()), updated_at = now(), updated_by = auth.uid() where user_id = p_user;
end $$;
revoke all on function public.admin_end_premium(uuid) from public, anon;
grant execute on function public.admin_end_premium(uuid) to authenticated;
