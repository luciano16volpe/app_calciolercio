-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · «stato dei collegamenti» mostra solo i giocatori DELLA lega richiesta
--  Prima la funzione non filtrava per lega: un amministratore vedeva nome e stato di collegamento
--  dei giocatori di tutte le leghe (scoperto dal test della Panchina).
--  Applicare con:  npx supabase db push --linked
-- ═══════════════════════════════════════════════════════════════════════════
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
     where lp.league_id = l
     order by lower(p.name);
end $$;

-- fine ✔
