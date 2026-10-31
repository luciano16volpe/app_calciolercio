-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · Fase 4.2: membri della lega e ruoli
--  Incollare tutto in Supabase → SQL Editor → New query → Run.
--  Si può rieseguire: le parti già create vengono sostituite senza errori.
-- ═══════════════════════════════════════════════════════════════════════════

-- Elenco dei membri di una lega con nome ed email: solo per l'amministratore di quella lega
-- (i profili sono privati, quindi serve una funzione con permessi propri).
create or replace function public.league_member_list(l uuid)
returns table (user_id uuid, role public.league_role, display_name text, email text, joined_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_league_admin(l) then
    raise exception 'Permesso negato: solo l''amministratore vede i membri';
  end if;
  return query
    select m.user_id, m.role, p.display_name, u.email::text, m.joined_at
      from league_members m
      left join profiles p on p.id = m.user_id
      left join auth.users u on u.id = m.user_id
     where m.league_id = l
     order by (m.role = 'admin') desc, (m.role = 'redazione') desc, lower(coalesce(p.display_name, u.email::text));
end $$;
revoke all on function public.league_member_list(uuid) from public, anon;
grant execute on function public.league_member_list(uuid) to authenticated;

-- Cambia il ruolo di un membro. Deve restare sempre almeno un amministratore.
create or replace function public.set_member_role(l uuid, u uuid, r public.league_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_league_admin(l) then
    raise exception 'Permesso negato: solo l''amministratore cambia i ruoli';
  end if;
  if r <> 'admin' and (select role from league_members where league_id = l and user_id = u) = 'admin'
     and (select count(*) from league_members where league_id = l and role = 'admin') <= 1 then
    raise exception 'Deve restare almeno un amministratore';
  end if;
  update league_members set role = r where league_id = l and user_id = u;
end $$;
revoke all on function public.set_member_role(uuid, uuid, public.league_role) from public, anon;
grant execute on function public.set_member_role(uuid, uuid, public.league_role) to authenticated;

-- Toglie un membro dalla lega (non l'ultimo amministratore).
create or replace function public.remove_member(l uuid, u uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_league_admin(l) then
    raise exception 'Permesso negato: solo l''amministratore toglie i membri';
  end if;
  if (select role from league_members where league_id = l and user_id = u) = 'admin'
     and (select count(*) from league_members where league_id = l and role = 'admin') <= 1 then
    raise exception 'Deve restare almeno un amministratore';
  end if;
  delete from league_members where league_id = l and user_id = u;
end $$;
revoke all on function public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

-- fine ✔
