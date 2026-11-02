-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · «salta le pagelle» di molte partite in una volta (e le rimette tutte insieme)
--  Come set_ratings_skipped, ma su un elenco di partite: serve alla redazione per ripulire le vecchie partite
--  senza aprirle una per una. Tutte le partite dell'elenco devono essere di leghe in cui chi chiama è amministratore
--  o redazione, altrimenti non cambia niente.
--  Applicare con:  npx supabase db push --linked
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.set_ratings_skipped_many(p_matches uuid[], p_skip boolean)
returns integer language plpgsql security definer set search_path = public as $$
declare m uuid; lg uuid; n integer;
begin
  if p_matches is null or cardinality(p_matches) = 0 then return 0; end if;
  if cardinality(p_matches) > 1000 then raise exception 'Troppe partite in una volta (massimo 1000)'; end if;
  -- prima si controlla TUTTO: se una sola partita non è della redazione/amministratore di chi chiama, non si cambia niente
  foreach m in array p_matches loop
    lg := public.match_league(m);
    if lg is null then raise exception 'Partita non trovata'; end if;
    if not public.has_league_role(lg, array['admin', 'redazione']::public.league_role[]) then
      raise exception 'Permesso negato: solo l''amministratore o la redazione della lega';
    end if;
  end loop;
  update matches set ratings_skipped = p_skip where id = any (p_matches) and ratings_skipped is distinct from p_skip;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.set_ratings_skipped_many(uuid[], boolean) from public, anon;
grant execute on function public.set_ratings_skipped_many(uuid[], boolean) to authenticated;

-- fine ✔
