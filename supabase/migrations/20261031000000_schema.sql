-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · schema Supabase (Fase 1: stessa app, nuovo motore)
--  Incollare tutto in Supabase → SQL Editor → New query → Run.
--  Si può rieseguire: le parti già create non danno errore.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Ruoli dentro una lega ──────────────────────────────────────────────────
--  admin     : gestisce la lega (partite, voti, rosa, statistiche)
--  redazione : pagellista / chi fa la Gazzetta (titoli, descrizioni, Gazzetta)
--  member    : vede tutto, non modifica
do $$ begin
  create type public.league_role as enum ('admin','redazione','member');
exception when duplicate_object then null; end $$;

-- ── Tabelle ────────────────────────────────────────────────────────────────

-- profilo di chi ha un account
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

-- impostazioni comuni a tutte le leghe (es. pesi dell'OVR: l'OVR è unico)
create table if not exists public.app_settings (
  key   text primary key,
  value jsonb not null
);

-- il GIOCATORE: uno per persona, uguale in tutte le leghe
--   stats = le 11 statistiche nell'ordine dell'app:
--   stamina, forza, dribling, velocità, tiro, passaggio, attacco, difesa, tecnica, porta, intelligenza
create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  photo_path  text,                                   -- file nello spazio "photos"
  roles       text[] not null default '{}',           -- ATT / MED / DIF
  stats       smallint[] not null default '{5,5,5,5,5,5,5,5,5,5,5}',
  user_id     uuid unique references auth.users(id) on delete set null,   -- account collegato ("questo sono io")
  legacy_id   text unique,                            -- id della vecchia app (per l'importazione)
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint players_stats_11    check (array_length(stats,1) = 11),
  constraint players_stats_range check (0 <= all(stats) and 10 >= all(stats)),
  constraint players_roles_ok    check (roles <@ array['ATT','MED','DIF'])
);

-- storico delle modifiche a statistiche e ruoli (scritto in automatico)
create table if not exists public.player_stats_history (
  id          bigserial primary key,
  player_id   uuid not null references public.players(id) on delete cascade,
  changed_by  uuid references auth.users(id) on delete set null,
  old_stats   smallint[], new_stats smallint[],
  old_roles   text[],     new_roles text[],
  changed_at  timestamptz not null default now()
);

-- la LEGA
create table if not exists public.leagues (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  is_public    boolean not null default false,       -- true = si vede anche senza account (come oggi)
  invite_code  text unique not null default substr(md5(random()::text), 1, 8),
  settings     jsonb not null default '{}',          -- regole della lega (formati, soglie premi, pagellista…)
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- chi fa parte della lega (persone con account) e con che ruolo
create table if not exists public.league_members (
  league_id  uuid not null references public.leagues(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       public.league_role not null default 'member',
  joined_at  timestamptz not null default now(),
  primary key (league_id, user_id)
);

-- il giocatore DENTRO una lega
create table if not exists public.league_players (
  league_id  uuid not null references public.leagues(id) on delete cascade,
  player_id  uuid not null references public.players(id) on delete cascade,
  nickname   text,                                   -- come lo chiama questa lega
  aliases    text[] not null default '{}',           -- altri nomi (importazione pagelle da WhatsApp)
  archived   boolean not null default false,
  joined_at  timestamptz not null default now(),
  primary key (league_id, player_id)
);

-- le PARTITE di una lega
create table if not exists public.matches (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid not null references public.leagues(id) on delete cascade,
  date        date not null,
  notes       text,
  score_a     smallint check (score_a between 0 and 99),   -- Blu
  score_b     smallint check (score_b between 0 and 99),   -- Bianchi
  pred        numeric,                                      -- squilibrio previsto alla creazione
  pred_rank   smallint,                                     -- quale proposta del generatore
  legacy_id   text unique,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- chi ha giocato una partita, in che squadra, e la sua PAGELLA
create table if not exists public.match_players (
  match_id          uuid not null references public.matches(id) on delete cascade,
  player_id         uuid not null references public.players(id) on delete cascade,
  team              char(1) not null check (team in ('A','B')),     -- A = Blu, B = Bianchi
  position          smallint not null default 0,
  rating            numeric(3,1) check (rating is null or rating between 1 and 10),
  goals             smallint not null default 0 check (goals >= 0),
  assist            smallint not null default 0 check (assist >= 0),
  autogol           smallint not null default 0 check (autogol >= 0),
  meta              smallint not null default 0 check (meta >= 0),
  rigori_sbagliati  smallint not null default 0 check (rigori_sbagliati >= 0),
  titolo            text,
  descrizione       text,
  primary key (match_id, player_id)
);

-- la GAZZETTA di una partita (una per partita)
create table if not exists public.gazzette (
  match_id     uuid primary key references public.matches(id) on delete cascade,
  file_path    text not null,                        -- file nello spazio "gazzette"
  uploaded_by  uuid default auth.uid() references auth.users(id) on delete set null,
  uploaded_at  timestamptz not null default now()
);

-- ALBO D'ORO: i premi di una stagione, congelati a fine stagione
create table if not exists public.albo (
  league_id   uuid not null references public.leagues(id) on delete cascade,
  season_key  text not null,                         -- es. 2026-EST
  status      text not null default 'aperta',        -- aperta / in chiusura / chiusa
  rows        jsonb not null default '[]',
  updated_at  timestamptz not null default now(),
  primary key (league_id, season_key)
);

create index if not exists matches_league_date_idx  on public.matches(league_id, date);
create index if not exists match_players_player_idx on public.match_players(player_id);
create index if not exists league_players_player_idx on public.league_players(player_id);
create index if not exists league_members_user_idx  on public.league_members(user_id);
create index if not exists stats_history_player_idx on public.player_stats_history(player_id, changed_at desc);

-- ── Funzioni di supporto per i permessi ────────────────────────────────────
-- (security definer: leggono le tabelle dei membri senza girare in tondo con i permessi)

create or replace function public.has_league_role(l uuid, r public.league_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from league_members where league_id = l and user_id = auth.uid() and role = any(r));
$$;

create or replace function public.is_league_admin(l uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_league_role(l, array['admin']::public.league_role[]);
$$;

-- una lega si vede se è pubblica oppure se ne fai parte
create or replace function public.league_visible(l uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from leagues where id = l and is_public)
      or exists (select 1 from league_members where league_id = l and user_id = auth.uid());
$$;

create or replace function public.match_league(m uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select league_id from matches where id = m;
$$;

-- un giocatore si vede se è il tuo, se l'hai creato tu, o se gioca in una lega che vedi
create or replace function public.player_visible(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from players where id = p and (user_id = auth.uid() or created_by = auth.uid()))
      or exists (select 1 from league_players lp where lp.player_id = p and public.league_visible(lp.league_id));
$$;

-- statistiche modificabili dall'amministratore di QUALSIASI lega in cui il giocatore gioca
-- (oppure da chi l'ha appena creato, prima che entri in una lega)
create or replace function public.can_edit_player(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from players where id = p and created_by = auth.uid())
      or exists (select 1 from league_players lp
                   join league_members lm on lm.league_id = lp.league_id
                  where lp.player_id = p and lm.user_id = auth.uid() and lm.role = 'admin');
$$;

create or replace function public.is_any_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from league_members where user_id = auth.uid() and role = 'admin');
$$;

-- ── Automatismi (trigger) ──────────────────────────────────────────────────

-- nuovo account → nuovo profilo
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- chi crea una lega ne diventa amministratore
create or replace function public.leagues_add_creator()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    insert into league_members(league_id, user_id, role) values (new.id, auth.uid(), 'admin')
    on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists leagues_add_creator on public.leagues;
create trigger leagues_add_creator after insert on public.leagues
  for each row execute function public.leagues_add_creator();

-- ogni modifica a statistiche o ruoli finisce nello storico (chi, quando, prima → dopo)
create or replace function public.players_log_changes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stats is distinct from old.stats or new.roles is distinct from old.roles then
    insert into player_stats_history(player_id, changed_by, old_stats, new_stats, old_roles, new_roles)
    values (new.id, auth.uid(), old.stats, new.stats, old.roles, new.roles);
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists players_log_changes on public.players;
create trigger players_log_changes before update on public.players
  for each row execute function public.players_log_changes();

-- la REDAZIONE può cambiare solo titolo e descrizione delle pagelle
create or replace function public.match_players_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare lg uuid;
begin
  if auth.uid() is null then return new; end if;                -- SQL Editor / importazione
  lg := public.match_league(new.match_id);
  if public.is_league_admin(lg) then return new; end if;
  if public.has_league_role(lg, array['redazione']::public.league_role[])
     and new.match_id = old.match_id and new.player_id = old.player_id and new.team = old.team
     and new.position = old.position and new.rating is not distinct from old.rating
     and new.goals = old.goals and new.assist = old.assist and new.autogol = old.autogol
     and new.meta = old.meta and new.rigori_sbagliati = old.rigori_sbagliati then
    return new;
  end if;
  raise exception 'Permesso negato: la redazione può modificare solo titolo e descrizione';
end $$;
drop trigger if exists match_players_guard on public.match_players;
create trigger match_players_guard before update on public.match_players
  for each row execute function public.match_players_guard();

-- iscriversi a una lega con il codice d'invito
create or replace function public.join_league(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare lg uuid;
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  select id into lg from leagues where invite_code = code;
  if lg is null then raise exception 'Codice non valido'; end if;
  insert into league_members(league_id, user_id, role) values (lg, auth.uid(), 'member')
  on conflict do nothing;
  return lg;
end $$;
revoke all on function public.join_league(text) from public, anon;
grant execute on function public.join_league(text) to authenticated;

-- ── Permessi sulle tabelle (Row Level Security) ────────────────────────────
alter table public.profiles             enable row level security;
alter table public.app_settings         enable row level security;
alter table public.players              enable row level security;
alter table public.player_stats_history enable row level security;
alter table public.leagues              enable row level security;
alter table public.league_members       enable row level security;
alter table public.league_players       enable row level security;
alter table public.matches              enable row level security;
alter table public.match_players        enable row level security;
alter table public.gazzette             enable row level security;
alter table public.albo                 enable row level security;

-- profili: ognuno vede e modifica il proprio
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (id = auth.uid());

-- impostazioni comuni: le leggono tutti, si cambiano solo dal pannello di Supabase
drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings for select using (true);

-- giocatori
drop policy if exists players_select on public.players;
create policy players_select on public.players for select using (public.player_visible(id));
drop policy if exists players_insert on public.players;
create policy players_insert on public.players for insert to authenticated with check (public.is_any_admin());
drop policy if exists players_update on public.players;
create policy players_update on public.players for update to authenticated using (public.can_edit_player(id));
drop policy if exists players_delete on public.players;
create policy players_delete on public.players for delete to authenticated using (created_by = auth.uid());

-- storico statistiche: lo vede chi vede il giocatore (lo scrive solo l'automatismo)
drop policy if exists stats_history_select on public.player_stats_history;
create policy stats_history_select on public.player_stats_history for select using (public.player_visible(player_id));

-- leghe
drop policy if exists leagues_select on public.leagues;
create policy leagues_select on public.leagues for select using (public.league_visible(id));
drop policy if exists leagues_insert on public.leagues;
create policy leagues_insert on public.leagues for insert to authenticated with check (true);
drop policy if exists leagues_update on public.leagues;
create policy leagues_update on public.leagues for update to authenticated using (public.is_league_admin(id));
drop policy if exists leagues_delete on public.leagues;
create policy leagues_delete on public.leagues for delete to authenticated using (public.is_league_admin(id));

-- membri: li vede chi fa parte della lega; li gestisce l'amministratore; ognuno può uscire
drop policy if exists members_select on public.league_members;
create policy members_select on public.league_members for select
  using (user_id = auth.uid() or public.has_league_role(league_id, array['admin','redazione','member']::public.league_role[]));
drop policy if exists members_insert on public.league_members;
create policy members_insert on public.league_members for insert to authenticated with check (public.is_league_admin(league_id));
drop policy if exists members_update on public.league_members;
create policy members_update on public.league_members for update to authenticated using (public.is_league_admin(league_id));
drop policy if exists members_delete on public.league_members;
create policy members_delete on public.league_members for delete to authenticated
  using (user_id = auth.uid() or public.is_league_admin(league_id));

-- giocatori nella lega
drop policy if exists lplayers_select on public.league_players;
create policy lplayers_select on public.league_players for select using (public.league_visible(league_id));
drop policy if exists lplayers_write on public.league_players;
create policy lplayers_write on public.league_players for all to authenticated
  using (public.is_league_admin(league_id)) with check (public.is_league_admin(league_id));

-- partite
drop policy if exists matches_select on public.matches;
create policy matches_select on public.matches for select using (public.league_visible(league_id));
drop policy if exists matches_write on public.matches;
create policy matches_write on public.matches for all to authenticated
  using (public.is_league_admin(league_id)) with check (public.is_league_admin(league_id));

-- squadre e pagelle (la redazione può aggiornare: l'automatismo la limita a titolo e descrizione)
drop policy if exists mplayers_select on public.match_players;
create policy mplayers_select on public.match_players for select using (public.league_visible(public.match_league(match_id)));
drop policy if exists mplayers_insert on public.match_players;
create policy mplayers_insert on public.match_players for insert to authenticated with check (public.is_league_admin(public.match_league(match_id)));
drop policy if exists mplayers_update on public.match_players;
create policy mplayers_update on public.match_players for update to authenticated
  using (public.has_league_role(public.match_league(match_id), array['admin','redazione']::public.league_role[]));
drop policy if exists mplayers_delete on public.match_players;
create policy mplayers_delete on public.match_players for delete to authenticated using (public.is_league_admin(public.match_league(match_id)));

-- gazzette: amministratore e redazione
drop policy if exists gazzette_select on public.gazzette;
create policy gazzette_select on public.gazzette for select using (public.league_visible(public.match_league(match_id)));
drop policy if exists gazzette_write on public.gazzette;
create policy gazzette_write on public.gazzette for all to authenticated
  using (public.has_league_role(public.match_league(match_id), array['admin','redazione']::public.league_role[]))
  with check (public.has_league_role(public.match_league(match_id), array['admin','redazione']::public.league_role[]));

-- albo d'oro
drop policy if exists albo_select on public.albo;
create policy albo_select on public.albo for select using (public.league_visible(league_id));
drop policy if exists albo_write on public.albo;
create policy albo_write on public.albo for all to authenticated
  using (public.is_league_admin(league_id)) with check (public.is_league_admin(league_id));

-- ── Spazi per le immagini (Storage) ────────────────────────────────────────
--  photos   : foto dei giocatori   → percorso  <id giocatore>.jpg
--  gazzette : Gazzette             → percorso  <id lega>/<id partita>.jpg
insert into storage.buckets (id, name, public) values ('photos', 'photos', true)   on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('gazzette', 'gazzette', true) on conflict (id) do nothing;

drop policy if exists photos_write on storage.objects;
create policy photos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.is_any_admin());
drop policy if exists photos_update on storage.objects;
create policy photos_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.is_any_admin());
drop policy if exists photos_delete on storage.objects;
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.is_any_admin());

drop policy if exists gazzette_files_write on storage.objects;
create policy gazzette_files_write on storage.objects for insert to authenticated
  with check (bucket_id = 'gazzette'
              and public.has_league_role(((storage.foldername(name))[1])::uuid, array['admin','redazione']::public.league_role[]));
drop policy if exists gazzette_files_update on storage.objects;
create policy gazzette_files_update on storage.objects for update to authenticated
  using (bucket_id = 'gazzette'
         and public.has_league_role(((storage.foldername(name))[1])::uuid, array['admin','redazione']::public.league_role[]));
drop policy if exists gazzette_files_delete on storage.objects;
create policy gazzette_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'gazzette'
         and public.has_league_role(((storage.foldername(name))[1])::uuid, array['admin','redazione']::public.league_role[]));

-- fine ✔
