-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · Fase 4.6 (correzione): accept_player_invite dava «column reference "player_id" is ambiguous»
--  (il nome della colonna coincideva con un campo restituito dalla funzione). Si qualificano le colonne.
--  Trovato dallo scenario completo (supabase/tests/scenario_completo.sql).
--  Applicare con:  npx supabase db push --linked
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.accept_player_invite(tok text)
returns table (player_id uuid, player_name text, league_id uuid, league_name text, league_slug text)
language plpgsql security definer set search_path = public as $$
declare i player_invites%rowtype; pl players%rowtype; mine players%rowtype;
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  select * into i from player_invites where token = tok for update;
  if i.token is null then raise exception 'Link non valido: chiedi un nuovo invito'; end if;
  select * into pl from players where id = i.player_id for update;
  -- già fatto dallo stesso account (apre il link due volte): nessun errore
  if pl.user_id = auth.uid() then
    insert into league_members(league_id, user_id, role) values (i.league_id, auth.uid(), 'member') on conflict do nothing;
    return query select pl.id, pl.name, i.league_id, (select name from leagues where id = i.league_id), (select slug from leagues where id = i.league_id);
    return;
  end if;
  if i.used_at is not null then raise exception 'Questo link è già stato usato'; end if;
  if i.revoked then raise exception 'Questo link non è più valido: chiedi un nuovo invito'; end if;
  if i.expires_at < now() then raise exception 'Questo link è scaduto: chiedi un nuovo invito'; end if;
  if pl.user_id is not null then raise exception 'Questo giocatore è già collegato a un altro account'; end if;
  select * into mine from players where user_id = auth.uid();
  if mine.id is not null then raise exception 'Il tuo account è già collegato a %', mine.name; end if;
  perform set_config('app.linking', 'on', true);
  update players set user_id = auth.uid() where id = pl.id;
  insert into league_members(league_id, user_id, role) values (i.league_id, auth.uid(), 'member') on conflict do nothing;
  update player_invites set used_at = now(), used_by = auth.uid() where token = tok;
  update player_claims pc set status = 'rejected', decided_at = now() where pc.status = 'pending' and (pc.player_id = pl.id or pc.user_id = auth.uid());
  return query select pl.id, pl.name, i.league_id, (select name from leagues where id = i.league_id), (select slug from leagues where id = i.league_id);
end $$;

revoke all on function public.accept_player_invite(text) from public, anon;
grant execute on function public.accept_player_invite(text) to authenticated;

-- fine ✔
