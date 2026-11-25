-- La frequenza individuale dei nuovi pronostici richiede almeno cinque partite valutabili.
-- Le regole già congelate per le partite precedenti restano invariate.
insert into public.advanced_prediction_configurations(version,rules)
select 3,
  jsonb_set(
    jsonb_set(rules,'{version}','3'::jsonb),
    '{minIndividualSample}','5'::jsonb
  )
from public.advanced_prediction_configurations
where version=2
on conflict (version) do nothing;
