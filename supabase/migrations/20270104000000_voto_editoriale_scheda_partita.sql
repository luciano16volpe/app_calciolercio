-- Il salvataggio della scheda non modifica mai la media dei votanti.
create or replace function public.save_match_ratings(p_match uuid, p_rows jsonb, p_header jsonb default null, p_untouched_texts uuid[] default '{}')
returns void language plpgsql security invoker set search_path=public as $$
declare lid uuid; r record; affected integer; expected integer;
begin
  select league_id into lid from matches where id = p_match;
  if auth.uid() is null or lid is null or not public.is_league_admin(lid) then
    raise exception 'Partita non trovata o permesso negato'; end if;
  perform 1 from matches where id = p_match for update;
  if not found then raise exception 'Partita non trovata'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Pagelle non valide'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) x group by x->>'player_id' having count(*) > 1)
     or exists (select 1 from jsonb_array_elements(p_rows) x where not exists (
       select 1 from match_players mp where mp.match_id = p_match and mp.player_id = (x->>'player_id')::uuid)) then
    raise exception 'Giocatore duplicato o non presente nella partita'; end if;
  select count(*) into expected from match_players where match_id = p_match;
  update match_players mp set goals = 0, assist = 0, autogol = 0, meta = 0, rigori_sbagliati = 0,
    titolo = case when mp.player_id = any(coalesce(p_untouched_texts, '{}')) then mp.titolo else null end,
    descrizione = case when mp.player_id = any(coalesce(p_untouched_texts, '{}')) then mp.descrizione else null end
    where mp.match_id = p_match and not exists (
      select 1 from jsonb_array_elements(p_rows) x where (x->>'player_id')::uuid = mp.player_id);
  get diagnostics affected = row_count;
  if exists (select 1 from jsonb_array_elements(p_rows) x where x ? 'editor_rating' and nullif(x->>'editor_rating','') is not null and ((x->>'editor_rating')::numeric < 1 or (x->>'editor_rating')::numeric > 10 or (x->>'editor_rating')::numeric * 2 <> trunc((x->>'editor_rating')::numeric * 2))) then raise exception 'Voto editoriale non valido'; end if;
  for r in select * from jsonb_to_recordset(p_rows) as x(
    player_id uuid, rating numeric, editor_rating numeric, goals smallint, assist smallint, autogol smallint,
    meta smallint, rigori_sbagliati smallint, titolo text, descrizione text, write_text boolean)
  loop
    update match_players set goals = r.goals, assist = r.assist, autogol = r.autogol, meta = r.meta, rigori_sbagliati = r.rigori_sbagliati,
      editor_rating = case when exists (select 1 from jsonb_array_elements(p_rows) x where (x->>'player_id')::uuid=r.player_id and x ? 'editor_rating') then r.editor_rating else editor_rating end,
      titolo = case when r.write_text then nullif(r.titolo, '') else titolo end,
      descrizione = case when r.write_text then nullif(r.descrizione, '') else descrizione end
      where match_id = p_match and player_id = r.player_id;
    if not found then raise exception 'Pagella non salvata'; end if;
    affected := affected + 1;
  end loop;
  if affected <> expected then raise exception 'Pagelle non salvate'; end if;
  if p_header is not null then
    update matches set score_a = (p_header->>'score_a')::smallint,
      score_b = (p_header->>'score_b')::smallint, notes = nullif(btrim(p_header->>'notes'), ''),
      play_time = (p_header->>'play_time')::time, place = nullif(btrim(p_header->>'place'), ''),
      place_lat = (p_header->>'place_lat')::double precision, place_lng = (p_header->>'place_lng')::double precision,
      place_url = nullif(btrim(p_header->>'place_url'), '') where id = p_match;
    if not found then raise exception 'Risultato non salvato'; end if;
  end if;
end $$;
