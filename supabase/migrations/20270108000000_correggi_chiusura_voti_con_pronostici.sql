-- Correzione: la chiusura del voto dei partecipanti falliva sulle partite con un pronostico 1-X-2
-- ("record new has no field goals"). Il controllo sui gol veniva calcolato anche quando il trigger
-- scatta dalla tabella dei voti, che non ha quei campi. Ora si controlla prima la tabella.
create or replace function public.advanced_prediction_mark_dirty()
returns trigger language plpgsql security definer set search_path=public as $$
declare mid uuid;
begin
  mid:=coalesce(new.match_id,old.match_id);
  if exists(select 1 from advanced_prediction_generations where match_id=mid)
    or exists(select 1 from match_predictions where match_id=mid) then
    if tg_table_name='match_players' and tg_op='UPDATE' then
      if (new.goals,new.assist,new.autogol,new.meta) is distinct from
         (old.goals,old.assist,old.autogol,old.meta) then
        delete from advanced_prediction_stat_confirmations where match_id=mid;
      end if;
    end if;
    insert into advanced_prediction_dirty_matches(match_id) values(mid)
      on conflict(match_id) do update set changed_at=now();
  end if;
  return coalesce(new,old);
end $$;
