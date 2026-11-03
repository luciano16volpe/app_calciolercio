-- Archivio dei giocatori rimossi da una specifica lega.
create table public.league_player_bench (
  league_id uuid not null references public.leagues(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  removed_at timestamptz not null default now(),
  primary key (league_id, player_id)
);
alter table public.league_player_bench enable row level security;
revoke all on public.league_player_bench from public, anon, authenticated;

-- Le vecchie rimozioni senza partite non sono attribuibili con certezza.
insert into public.league_player_bench(league_id, player_id)
select distinct m.league_id, mp.player_id
from public.match_players mp join public.matches m on m.id = mp.match_id
where mp.player_id is not null and not exists (
  select 1 from public.league_players lp where lp.league_id = m.league_id and lp.player_id = mp.player_id
)
on conflict do nothing;

-- La vecchia funzione globale non deve restare accessibile ai client precedenti.
revoke all on function public.bench_players() from public, anon, authenticated;

-- Le modifiche alla rosa passano dalle funzioni autorizzate: nessun inserimento
-- o rimozione diretta che aggiri l'archivio o importi giocatori di altre leghe.
drop policy if exists lplayers_write on public.league_players;
create policy lplayers_update on public.league_players for update to authenticated
  using (public.is_league_admin(league_id)) with check (public.is_league_admin(league_id));
revoke update on public.league_players from authenticated;
grant update (aliases, nickname) on public.league_players to authenticated;
-- La creazione atomica verifica già amministratore e nome; deve poter inserire la rosa.
alter function public.create_player_in_league(uuid, text) security definer;

create function public.bench_players(p_league uuid)
returns table (player_id uuid, name text, roles text[], photo_path text, linked boolean, matches_played bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_league_admin(p_league) then raise exception 'Permesso negato'; end if;
  return query select p.id, p.name, p.roles, p.photo_path, p.user_id is not null,
    (select count(*) from public.match_players mp join public.matches m on m.id = mp.match_id where mp.player_id = p.id and m.league_id = p_league)
  from public.league_player_bench b join public.players p on p.id = b.player_id
  where b.league_id = p_league and not exists (select 1 from public.league_players lp where lp.league_id = p_league and lp.player_id = p.id)
  order by lower(p.name), p.id;
end $$;
revoke all on function public.bench_players(uuid) from public, anon;
grant execute on function public.bench_players(uuid) to authenticated;

create or replace function public.remove_player_from_league(p_league uuid, p_player uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid; r text;
begin
  if not public.is_league_admin(p_league) then raise exception 'Permesso negato'; end if;
  perform 1 from public.league_players where league_id = p_league and player_id = p_player for update;
  if not found then raise exception 'Questo giocatore non è nella lega'; end if;
  select user_id into uid from public.players where id = p_player;
  if uid is not null then
    select role into r from public.league_members where league_id = p_league and user_id = uid;
    if r = 'admin' then raise exception 'Il giocatore è collegato a un amministratore della lega: togli prima il ruolo'; end if;
  end if;
  insert into public.league_player_bench(league_id, player_id) values (p_league, p_player)
    on conflict (league_id, player_id) do update set removed_at = now();
  delete from public.league_players where league_id = p_league and player_id = p_player;
  update public.player_invites set revoked = true where league_id = p_league and player_id = p_player and not revoked and used_at is null;
  delete from public.player_claims where league_id = p_league and player_id = p_player and status = 'pending';
  if uid is not null then delete from public.league_members where league_id = p_league and user_id = uid; end if;
  return true;
end $$;

create or replace function public.add_player_to_league(p_league uuid, p_player uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_league_admin(p_league) then raise exception 'Permesso negato'; end if;
  perform 1 from public.league_player_bench where league_id = p_league and player_id = p_player for update;
  if not found then raise exception 'Giocatore non presente nella Panchina di questa lega'; end if;
  select user_id into uid from public.players where id = p_player;
  insert into public.league_players(league_id, player_id) values (p_league, p_player);
  if uid is not null then insert into public.league_members(league_id, user_id, role) values (p_league, uid, 'member') on conflict do nothing; end if;
  delete from public.league_player_bench where league_id = p_league and player_id = p_player;
end $$;
