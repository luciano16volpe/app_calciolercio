-- pg_cron si presenta al gateway con il JWT anonimo legacy e al codice con il segreto interno.
-- Entrambi i valori restano in private_config; la verifica JWT della funzione rimane attiva.
create or replace function public.advanced_prediction_reconcile_run()
returns void language plpgsql security definer set search_path=public,extensions as $$
declare secret text; anon_jwt text;
begin
  if not exists(select 1 from advanced_prediction_dirty_matches d
      where public.advanced_prediction_ready(d.match_id)) then return; end if;
  select value into secret from private_config where key='cron_secret';
  select value into anon_jwt from private_config where key='edge_anon_jwt';
  if secret is null or anon_jwt is null then
    raise warning 'advanced_prediction_reconcile_run: credenziali del job mancanti';
    return;
  end if;
  perform net.http_post(url:='https://ivrwqpuikbnvnxgvgegd.supabase.co/functions/v1/advanced-predictions',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||anon_jwt,
      'apikey',anon_jwt,'x-cron-secret',secret),
    body:='{"action":"reconcile"}'::jsonb,timeout_milliseconds:=20000);
end $$;
