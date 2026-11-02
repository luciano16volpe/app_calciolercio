-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · la firma «Redazione <nome>» è di chi ha scritto le pagelle della partita (non più un nome fisso)
--   · match_editors : per ogni partita, la PRIMA persona che ha scritto un titolo o una descrizione (la leggono i membri della lega);
--     il nome è quello del profilo (o la parte prima della @ dell'email, mai l'email intera);
--   · un trigger la registra da solo quando titolo o descrizione di una pagella vengono scritti da un utente
--     (non per le importazioni dal vecchio sistema);
--   · recupero: per le partite recenti, l'autore si legge dal registro attività.
--  Applicare con:  npx supabase db push --linked
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.match_editors (
  match_id   uuid primary key references public.matches(id) on delete cascade,
  league_id  uuid not null references public.leagues(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null,
  name       text not null,
  written_at timestamptz not null default now()
);
create index if not exists match_editors_league_idx on public.match_editors(league_id);
alter table public.match_editors enable row level security;
drop policy if exists match_editors_select on public.match_editors;
create policy match_editors_select on public.match_editors for select to authenticated using (public.league_visible(league_id));

create or replace function public.record_match_editor()
returns trigger language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  if auth.uid() is null then return null; end if;                                     -- SQL Editor / sistema
  if coalesce((select src from public.audit_ctx()), 'app') = 'import' then return null; end if;   -- importazione dal vecchio sistema
  if coalesce(btrim(new.titolo), '') = '' and coalesce(btrim(new.descrizione), '') = '' then return null; end if;
  if tg_op = 'UPDATE' and new.titolo is not distinct from old.titolo and new.descrizione is not distinct from old.descrizione then return null; end if;
  select coalesce(nullif(btrim(p.display_name), ''), nullif(split_part(u.email::text, '@', 1), ''), '?') into nm
    from auth.users u left join profiles p on p.id = u.id where u.id = auth.uid();
  insert into match_editors(match_id, league_id, user_id, name)
    select new.match_id, m.league_id, auth.uid(), coalesce(nm, '?') from matches m where m.id = new.match_id
  on conflict (match_id) do nothing;                                                   -- vale chi ha scritto per primo
  return null;
end $$;
drop trigger if exists record_match_editor on public.match_players;
create trigger record_match_editor after insert or update of titolo, descrizione on public.match_players
  for each row execute function public.record_match_editor();

-- ── recupero dal registro attività (le partite di cui si ricorda chi ha scritto, entro il periodo di conservazione) ──
insert into public.match_editors(match_id, league_id, user_id, name, written_at)
select distinct on (m.id) m.id, m.league_id, a.actor_id,
       coalesce(nullif(split_part(coalesce(a.actor_name, ''), '@', 1), ''), '?'), a.at
  from public.audit_log a
  join public.matches m on m.id::text = split_part(a.entity_id, '/', 1)
 where a.action = 'match_players.update' and a.source = 'app' and a.actor_id is not null
   and (a.changes ? 'titolo' or a.changes ? 'descrizione')
 order by m.id, a.at
on conflict (match_id) do nothing;

-- fine ✔
