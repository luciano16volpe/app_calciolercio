-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · Regole di gioco uniche per tutta l'app, modificabili solo dall'amministratore supremo
--  Pesi delle statistiche (ovr_weights), formazioni (game_modules, testo come nel telefono) e forma recente (use_form)
--  stanno in app_settings. L'app le legge per calcolare OVR e squadre; nell'interfaccia le vedono solo gli amministratori di lega
--  (sola lettura) e le cambia solo il superadmin, con questa funzione. Ogni modifica finisce nel registro attività.
--  Applicare con:  npx supabase db push --linked
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.app_settings(key, value) values ('use_form', 'true'::jsonb) on conflict (key) do nothing;

create or replace function public.admin_set_setting(k text, v jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare old jsonb; ok boolean := true; x jsonb;
begin
  if not public.is_super_admin() then raise exception 'Permesso negato: solo l''amministratore della piattaforma'; end if;
  if k = 'ovr_weights' then
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) <> 11 then raise exception 'Servono 11 pesi'; end if;
    for x in select * from jsonb_array_elements(v) loop
      if jsonb_typeof(x) <> 'number' or (x #>> '{}')::numeric < 0 or (x #>> '{}')::numeric > 3 then raise exception 'Ogni peso va da 0 a 3'; end if;
    end loop;
  elsif k = 'use_form' then
    if jsonb_typeof(v) <> 'boolean' then raise exception 'Valore non valido'; end if;
  elsif k = 'game_modules' then
    if jsonb_typeof(v) <> 'string' or length(v #>> '{}') > 20000 then raise exception 'Formazioni non valide'; end if;
    begin x := (v #>> '{}')::jsonb; exception when others then raise exception 'Formazioni non valide'; end;
  else
    raise exception 'Impostazione sconosciuta';
  end if;
  select value into old from app_settings where key = k;
  insert into app_settings(key, value) values (k, v) on conflict (key) do update set value = excluded.value;
  perform public.audit_event('app_settings.update', 'app_settings', k, null, k, 'account',
    case when k = 'game_modules' then jsonb_build_object('valore', jsonb_build_array(null, 'formazioni aggiornate'))
         else jsonb_build_object('valore', jsonb_build_array(old, v)) end);
end $$;
revoke all on function public.admin_set_setting(text, jsonb) from public, anon;
grant execute on function public.admin_set_setting(text, jsonb) to authenticated;

-- fine ✔
