-- Comandi transazionali. Le RLS e i trigger restano applicati all'utente chiamante.
create function public.create_match_with_teams(p_match jsonb, p_team_a uuid[], p_team_b uuid[])
returns uuid language plpgsql security invoker set search_path = public as $$
declare mid uuid; lid uuid := (p_match->>'league_id')::uuid;
begin
  if auth.uid() is null or not public.is_league_admin(lid) then
    raise exception 'Permesso negato: solo amministratori della lega';
  end if;
  if coalesce(cardinality(p_team_a), 0) = 0 or coalesce(cardinality(p_team_b), 0) = 0 then
    raise exception 'Servono due squadre non vuote';
  end if;
  if exists (select 1 from unnest(p_team_a || p_team_b) t(p)
      where p is null or not exists (select 1 from league_players lp where lp.league_id = lid and lp.player_id = p)) then
    raise exception 'Le squadre devono contenere solo giocatori della rosa';
  end if;
  insert into matches(league_id, date, play_time, place, notes, score_a, score_b, pred, pred_rank)
    values (lid, (p_match->>'date')::date, (p_match->>'play_time')::time,
      nullif(btrim(p_match->>'place'), ''), nullif(p_match->>'notes', ''),
      (p_match->>'score_a')::smallint, (p_match->>'score_b')::smallint,
      (p_match->>'pred')::numeric, (p_match->>'pred_rank')::smallint)
    returning id into mid;
  -- Un giocatore ripetuto causa una violazione della chiave e annulla anche la partita.
  insert into match_players(match_id, player_id, team, position)
    select mid, p, 'A', (n - 1)::integer from unnest(p_team_a) with ordinality t(p, n)
    union all
    select mid, p, 'B', (n - 1)::integer from unnest(p_team_b) with ordinality t(p, n);
  return mid;
end $$;

create function public.create_player_in_league(p_league uuid, p_name text)
returns uuid language plpgsql security invoker set search_path = public as $$
declare pid uuid := gen_random_uuid();
begin
  if auth.uid() is null or not public.is_league_admin(p_league) then
    raise exception 'Permesso negato: solo amministratori della lega';
  end if;
  if nullif(btrim(p_name), '') is null then raise exception 'Nome non valido'; end if;
  -- Evita INSERT RETURNING: player_visible legge la tabella e non vede ancora la riga nuova.
  insert into players(id, name, roles, stats)
    values (pid, btrim(p_name), array['MED'], array[5,5,5,5,5,5,5,5,5,5,5]);
  insert into league_players(league_id, player_id) values (p_league, pid);
  return pid;
end $$;

-- L'intestazione viene aggiornata nella stessa transazione delle pagelle solo se modificata.
-- I testi non toccati vengono conservati anche per i giocatori senza voto.
create function public.save_match_ratings(p_match uuid, p_rows jsonb, p_header jsonb default null, p_untouched_texts uuid[] default '{}')
returns void language plpgsql security invoker set search_path = public as $$
declare lid uuid; r record; affected integer; expected integer;
begin
  select league_id into lid from matches where id = p_match;
  if auth.uid() is null or lid is null or not public.is_league_admin(lid) then
    raise exception 'Partita non trovata o permesso negato';
  end if;
  perform 1 from matches where id = p_match for update;
  if not found then raise exception 'Partita non trovata'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Pagelle non valide'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) x group by x->>'player_id' having count(*) > 1)
     or exists (select 1 from jsonb_array_elements(p_rows) x where not exists (
       select 1 from match_players mp where mp.match_id = p_match and mp.player_id = (x->>'player_id')::uuid)) then
    raise exception 'Giocatore duplicato o non presente nella partita';
  end if;
  select count(*) into expected from match_players where match_id = p_match;
  update match_players mp set rating = null, goals = 0, assist = 0, autogol = 0, meta = 0, rigori_sbagliati = 0,
    titolo = case when mp.player_id = any(coalesce(p_untouched_texts, '{}')) then mp.titolo else null end,
    descrizione = case when mp.player_id = any(coalesce(p_untouched_texts, '{}')) then mp.descrizione else null end
    where mp.match_id = p_match and not exists (
      select 1 from jsonb_array_elements(p_rows) x where (x->>'player_id')::uuid = mp.player_id);
  get diagnostics affected = row_count;
  for r in select * from jsonb_to_recordset(p_rows) as x(
    player_id uuid, rating numeric, goals smallint, assist smallint, autogol smallint,
    meta smallint, rigori_sbagliati smallint, titolo text, descrizione text, write_text boolean)
  loop
    update match_players set rating = r.rating, goals = r.goals, assist = r.assist,
      autogol = r.autogol, meta = r.meta, rigori_sbagliati = r.rigori_sbagliati,
      titolo = case when r.write_text then nullif(r.titolo, '') else titolo end,
      descrizione = case when r.write_text then nullif(r.descrizione, '') else descrizione end
      where match_id = p_match and player_id = r.player_id;
    if not found then raise exception 'Pagella non salvata'; end if;
    affected := affected + 1;
  end loop;
  if affected <> expected then raise exception 'Pagelle non salvate'; end if;
  if p_header is not null then
    update matches set score_a = (p_header->>'score_a')::smallint,
      score_b = (p_header->>'score_b')::smallint, notes = nullif(p_header->>'notes', ''),
      play_time = (p_header->>'play_time')::time, place = nullif(btrim(p_header->>'place'), '')
      where id = p_match;
    if not found then raise exception 'Risultato non salvato'; end if;
  end if;
end $$;

create function public.save_match_texts(p_match uuid, p_rows jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare lid uuid; r record;
begin
  select league_id into lid from matches where id = p_match;
  if auth.uid() is null or lid is null or not public.has_league_role(lid, array['admin','redazione']::public.league_role[]) then
    raise exception 'Partita non trovata o permesso negato';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Testi non validi'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) x group by x->>'player_id' having count(*) > 1) then
    raise exception 'Giocatore duplicato';
  end if;
  for r in select * from jsonb_to_recordset(p_rows) as x(player_id uuid, titolo text, descrizione text)
  loop
    update match_players set titolo = nullif(r.titolo, ''), descrizione = nullif(r.descrizione, '')
      where match_id = p_match and player_id = r.player_id;
    if not found then raise exception 'Giocatore non presente nella partita'; end if;
  end loop;
end $$;

revoke all on function public.create_match_with_teams(jsonb, uuid[], uuid[]) from public, anon;
revoke all on function public.create_player_in_league(uuid, text) from public, anon;
revoke all on function public.save_match_ratings(uuid, jsonb, jsonb, uuid[]) from public, anon;
revoke all on function public.save_match_texts(uuid, jsonb) from public, anon;
grant execute on function public.create_match_with_teams(jsonb, uuid[], uuid[]) to authenticated;
grant execute on function public.create_player_in_league(uuid, text) to authenticated;
grant execute on function public.save_match_ratings(uuid, jsonb, jsonb, uuid[]) to authenticated;
grant execute on function public.save_match_texts(uuid, jsonb) to authenticated;
