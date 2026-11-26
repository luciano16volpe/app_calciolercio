-- Porta a 5 anche i pronostici delle partite che non sono ancora iniziate e avevano già le regole della versione 1 (10 pronostici).
-- Per ogni giocatore si tengono 5 pronostici: prima quelli già scelti, poi gli altri nell'ordine di assegnazione.
-- Gli esuberi diventano VOID (con traccia nell'audit). Le partite già giocate o già chiuse non si toccano.
do $$
declare cfg jsonb; open_matches uuid[]; r record;
begin
  select rules into cfg from advanced_prediction_configurations where version=2;
  if cfg is null then raise exception 'Manca la configurazione versione 2: applica prima 20261227000000_cinque_pronostici.sql'; end if;

  select coalesce(array_agg(m.id),'{}') into open_matches
  from matches m join advanced_prediction_match_rules mr on mr.match_id=m.id
  where mr.configuration_version<2 and m.score_a is null and m.score_b is null
    and (m.play_time is null or now()<(m.date+m.play_time) at time zone 'Europe/Rome');

  for r in
    select id,match_id,status from (
      select a.id,a.match_id,a.status,
        row_number() over (partition by a.match_id,a.predictor_player_id
          order by (a.status='SELECTED') desc,a.selected_at nulls last,a.assigned_at,a.id) as pos
      from advanced_prediction_assignments a
      where a.match_id=any(open_matches) and a.status in ('AVAILABLE','SELECTED')) x
    where pos>5
  loop
    update advanced_prediction_assignments set status='VOID',selected_at=null,locked_at=now() where id=r.id;
    insert into advanced_prediction_audit(assignment_id,match_id,action,old_values,new_values,reason)
      values(r.id,r.match_id,'VOID',jsonb_build_object('status',r.status),jsonb_build_object('status','VOID'),
        'Limite ridotto a 5 pronostici');
  end loop;

  update advanced_prediction_assignments set configuration_version=2,rules_snapshot=cfg
    where match_id=any(open_matches) and status in ('AVAILABLE','SELECTED');
  update advanced_prediction_match_rules set configuration_version=2,rules_snapshot=cfg where match_id=any(open_matches);
end $$;
