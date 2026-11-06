-- Lightweight summaries keep the underlying match_players RLS (including history access).
create or replace view public.match_player_summaries with (security_invoker = true) as
select match_id, player_id, team, position, rating, goals, assist, autogol, meta, rigori_sbagliati,
       (btrim(coalesce(titolo, '')) <> '' or btrim(coalesce(descrizione, '')) <> '') as has_text
from public.match_players;
revoke all on public.match_player_summaries from public, anon;
grant select on public.match_player_summaries to authenticated;

-- An opaque token, not a log: one row per league, replaced whenever history changes.
create table public.league_data_versions (
  league_id uuid primary key references public.leagues(id) on delete cascade,
  version uuid not null default gen_random_uuid()
);
alter table public.league_data_versions enable row level security;
create policy versions_select on public.league_data_versions for select to authenticated
  using (public.league_visible(league_id));
revoke all on public.league_data_versions from public, anon, authenticated;
grant select on public.league_data_versions to authenticated;

create function public.bump_league_data_version() returns trigger
language plpgsql security definer set search_path = public as $$
declare old_l uuid; new_l uuid;
begin
  if tg_table_name = 'leagues' then
    new_l := new.id;
  elsif tg_table_name in ('matches', 'match_editors', 'albo') then
    if tg_op <> 'INSERT' then old_l := old.league_id; end if;
    if tg_op <> 'DELETE' then new_l := new.league_id; end if;
  else
    if tg_op <> 'INSERT' then select league_id into old_l from public.matches where id = old.match_id; end if;
    if tg_op <> 'DELETE' then select league_id into new_l from public.matches where id = new.match_id; end if;
  end if;
  insert into public.league_data_versions(league_id, version)
    select distinct l.id, gen_random_uuid() from public.leagues l where l.id in (old_l, new_l)
    on conflict (league_id) do update set version = excluded.version;
  return null;
end $$;
revoke all on function public.bump_league_data_version() from public, anon, authenticated;
insert into public.league_data_versions(league_id) select id from public.leagues;
create trigger history_version after insert on public.leagues for each row execute function public.bump_league_data_version();
create trigger history_version after insert or update or delete on public.matches for each row execute function public.bump_league_data_version();
create trigger history_version after insert or update or delete on public.match_players for each row execute function public.bump_league_data_version();
create trigger history_version after insert or update or delete on public.gazzette for each row execute function public.bump_league_data_version();
create trigger history_version after insert or update or delete on public.match_editors for each row execute function public.bump_league_data_version();
create trigger history_version after insert or update or delete on public.albo for each row execute function public.bump_league_data_version();
notify pgrst, 'reload schema';
