-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · Fase 4.3: "questo sono io" (collegare il proprio account al proprio giocatore)
--  Incollare tutto in Supabase → SQL Editor → New query → Run.
--  Si può rieseguire: le parti già create vengono sostituite senza errori.
--
--  Come funziona: chi ha un account sceglie il proprio nome nella rosa di una lega e manda la richiesta.
--  L'amministratore di quella lega la conferma (o la rifiuta). Un giocatore può essere collegato a un solo
--  account e un account a un solo giocatore (players.user_id è già unico).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.player_claims (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid not null references public.leagues(id) on delete cascade,
  player_id   uuid not null references public.players(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at  timestamptz not null default now(),
  decided_by  uuid references auth.users(id) on delete set null,
  decided_at  timestamptz,
  unique (player_id, user_id)
);
create index if not exists player_claims_league_idx on public.player_claims(league_id, status);

alter table public.player_claims enable row level security;
-- le richieste si leggono: le proprie, oppure (amministratore) quelle della propria lega. Si scrive solo con le funzioni qui sotto.
drop policy if exists claims_select on public.player_claims;
create policy claims_select on public.player_claims for select to authenticated
  using (user_id = auth.uid() or public.is_league_admin(league_id));

-- Manda la richiesta "questo sono io"
create or replace function public.request_claim(l uuid, p uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  if not public.league_visible(l) then raise exception 'Lega non trovata'; end if;
  if not exists (select 1 from league_players where league_id = l and player_id = p) then
    raise exception 'Questo giocatore non è nella lega';
  end if;
  if exists (select 1 from players where user_id = auth.uid()) then
    raise exception 'Sei già collegato a un giocatore';
  end if;
  if exists (select 1 from players where id = p and user_id is not null) then
    raise exception 'Questo giocatore è già collegato a un altro account';
  end if;
  insert into player_claims(league_id, player_id, user_id, status) values (l, p, auth.uid(), 'pending')
  on conflict (player_id, user_id) do update set status = 'pending', league_id = excluded.league_id, decided_by = null, decided_at = null;
end $$;
revoke all on function public.request_claim(uuid, uuid) from public, anon;
grant execute on function public.request_claim(uuid, uuid) to authenticated;

-- L'amministratore della lega conferma o rifiuta una richiesta
create or replace function public.review_claim(c uuid, approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare cl player_claims%rowtype;
begin
  select * into cl from player_claims where id = c;
  if cl.id is null then raise exception 'Richiesta non trovata'; end if;
  if not public.is_league_admin(cl.league_id) then raise exception 'Permesso negato: solo l''amministratore decide'; end if;
  if cl.status <> 'pending' then raise exception 'Richiesta già decisa'; end if;
  if approve then
    if exists (select 1 from players where id = cl.player_id and user_id is not null) then
      raise exception 'Questo giocatore è già collegato a un altro account';
    end if;
    if exists (select 1 from players where user_id = cl.user_id) then
      raise exception 'Questo account è già collegato a un giocatore';
    end if;
    update players set user_id = cl.user_id where id = cl.player_id;
    update player_claims set status = 'approved', decided_by = auth.uid(), decided_at = now() where id = c;
    -- le altre richieste per lo stesso giocatore o dello stesso account non hanno più senso
    update player_claims set status = 'rejected', decided_by = auth.uid(), decided_at = now()
     where status = 'pending' and id <> c and (player_id = cl.player_id or user_id = cl.user_id);
  else
    update player_claims set status = 'rejected', decided_by = auth.uid(), decided_at = now() where id = c;
  end if;
end $$;
revoke all on function public.review_claim(uuid, boolean) from public, anon;
grant execute on function public.review_claim(uuid, boolean) to authenticated;

-- Richieste in attesa di una lega, con chi le ha fatte (solo amministratore)
create or replace function public.claims_pending(l uuid)
returns table (id uuid, player_id uuid, player_name text, user_id uuid, display_name text, email text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_league_admin(l) then raise exception 'Permesso negato: solo l''amministratore vede le richieste'; end if;
  return query
    select c.id, c.player_id, pl.name, c.user_id, pr.display_name, u.email::text, c.created_at
      from player_claims c
      join players pl on pl.id = c.player_id
      left join profiles pr on pr.id = c.user_id
      left join auth.users u on u.id = c.user_id
     where c.league_id = l and c.status = 'pending'
     order by c.created_at;
end $$;
revoke all on function public.claims_pending(uuid) from public, anon;
grant execute on function public.claims_pending(uuid) to authenticated;

-- Scollegarsi dal proprio giocatore
create or replace function public.unlink_me()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  update players set user_id = null where user_id = auth.uid();
  delete from player_claims where user_id = auth.uid();
end $$;
revoke all on function public.unlink_me() from public, anon;
grant execute on function public.unlink_me() to authenticated;

-- fine ✔
