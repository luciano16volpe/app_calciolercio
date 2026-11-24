-- Le nuove partite con risultato aprono sempre il sondaggio delle pagelle.
-- Il voto editoriale e' separato dal voto ufficiale, che resta la media della community.
alter table public.match_players
  add column editor_rating numeric(3,1)
    check (editor_rating between 1 and 10 and editor_rating * 2 = trunc(editor_rating * 2));

create or replace function public.open_community_vote_for_result()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.score_a is not null and new.score_b is not null
    and (tg_op='INSERT' or old.score_a is null or old.score_b is null) then
    insert into public.community_vote_settings(match_id,started_at,enabled_by)
      values(new.id,now(),auth.uid()) on conflict(match_id) do nothing;
    -- On the first save the admin may have supplied draft ratings. They are not official.
    if found then
      update public.match_players set rating=null where match_id=new.id and rating is not null;
    end if;
  end if;
  return new;
end $$;
create trigger open_community_vote_for_result
  after insert or update of score_a,score_b on public.matches
  for each row execute function public.open_community_vote_for_result();

create or replace function public.save_match_texts(p_match uuid,p_rows jsonb)
returns void language plpgsql security invoker set search_path=public as $$
declare lid uuid; item jsonb; vote numeric;
begin
  select league_id into lid from matches where id=p_match;
  if auth.uid() is null or lid is null or not public.has_league_role(lid,array['admin','redazione']::public.league_role[]) then
    raise exception 'Partita non trovata o permesso negato'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Pagelle non valide'; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) x group by x->>'player_id' having count(*)>1) then
    raise exception 'Giocatore duplicato'; end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    vote := nullif(item->>'editor_rating','')::numeric;
    if vote is not null and (vote<1 or vote>10 or vote*2<>trunc(vote*2)) then
      raise exception 'Il voto editoriale deve essere tra 1 e 10, a passi di mezzo punto'; end if;
    update match_players set titolo=nullif(item->>'titolo',''),
      descrizione=nullif(item->>'descrizione',''),
      editor_rating=case when item ? 'editor_rating' then vote else editor_rating end
      where match_id=p_match and player_id=(item->>'player_id')::uuid;
    if not found then raise exception 'Giocatore non presente nella partita'; end if;
  end loop;
end $$;

-- Prima della chiusura l'ADMIN conosce soltanto chi ha partecipato e il totale.
create function public.advanced_prediction_admin_participation(p_match uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare lid uuid; output jsonb;
begin
  select league_id into lid from matches where id=p_match;
  if auth.uid() is null or lid is null or not public.is_league_admin(lid) then
    raise exception 'Permesso negato'; end if;
  select jsonb_build_object('count',count(*),'players',coalesce(jsonb_agg(
    jsonb_build_object('player_id',p.id,'name',p.name) order by p.name),'[]'::jsonb)) into output
    from (select distinct predictor_player_id from advanced_prediction_assignments
      where match_id=p_match and selected_at is not null) chosen
      join players p on p.id=chosen.predictor_player_id;
  return output;
end $$;
revoke all on function public.advanced_prediction_admin_participation(uuid) from public,anon;
grant execute on function public.advanced_prediction_admin_participation(uuid) to authenticated;
