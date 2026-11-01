-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · Fase 4.8: storico delle statistiche con CHI le ha cambiate e QUANDO
--  Funzione di sola lettura: l'elenco delle modifiche a statistiche e ruoli di un giocatore, con il nome di chi le ha fatte.
--  Si vede solo se il giocatore è visibile a chi chiede (come già avviene per lo storico).
--  Applicare con:  npx supabase db push --linked
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.player_history(p uuid)
returns table (changed_at timestamptz, old_stats smallint[], new_stats smallint[], old_roles text[], new_roles text[], changed_by_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.player_visible(p) then raise exception 'Permesso negato'; end if;
  return query
    select h.changed_at, h.old_stats, h.new_stats, h.old_roles, h.new_roles,
           coalesce(nullif(pr.display_name, ''), case when h.changed_by is null then 'Importazione o sistema' else 'Un amministratore' end)
      from player_stats_history h
      left join profiles pr on pr.id = h.changed_by
     where h.player_id = p
     order by h.changed_at desc
     limit 30;
end $$;

revoke all on function public.player_history(uuid) from public, anon;
grant execute on function public.player_history(uuid) to anon, authenticated;   -- come lo storico: lo vede anche chi guarda senza accesso, se il giocatore è visibile

-- fine ✔
