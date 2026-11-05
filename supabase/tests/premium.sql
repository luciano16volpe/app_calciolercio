-- Collaudo delle regole attuali. Nessuna modifica persiste: transazione annullata.
-- Eseguire come postgres: supabase db query --linked -f supabase/tests/premium.sql
begin;
do $test$
declare
  standard uuid := gen_random_uuid(); premium uuid := gen_random_uuid();
  administrator uuid := gen_random_uuid(); editor uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid(); supervisor uuid := gen_random_uuid();
  league uuid := gen_random_uuid(); player uuid := gen_random_uuid();
  current_match uuid := gen_random_uuid(); old_match uuid := gen_random_uuid();
  request uuid; approved uuid; rejected uuid; expired_request uuid; denied boolean; n integer;
  gaz_path text; active boolean; trial boolean;
begin
  insert into auth.users(id,email,aud,role,created_at,raw_user_meta_data)
    select u, 'collaudo-' || u::text || '@example.invalid', 'authenticated', 'authenticated', now(), '{}'
    from unnest(array[standard,premium,administrator,editor,outsider,supervisor]) u;
  -- Il nuovo account riceve automaticamente una prova di un mese.
  perform set_config('request.jwt.claim.sub', standard::text, true);
  set local role authenticated;
  select s.active, s.trial into active, trial from public.my_premium_status() s;
  assert active and trial, 'La prova deve partire alla registrazione';
  reset role;
  perform set_config('request.jwt.claim.sub','',true);
  update public.account_premium set expires_at=now()-interval '1 second', trial_expires_at=now()-interval '1 second'
    where user_id in (standard,administrator,editor);
  insert into public.platform_admins(user_id) values(supervisor);
  insert into public.leagues(id,name) values(league, 'Collaudo ' || league::text);
  insert into public.league_members(league_id,user_id,role) values
    (league,standard,'member'),(league,premium,'member'),(league,administrator,'admin'),(league,editor,'redazione')
    on conflict (league_id,user_id) do update set role=excluded.role;
  insert into public.players(id,name) values(player,'Collaudo giocatore');
  insert into public.league_players(league_id,player_id) values(league,player);
  insert into public.matches(id,league_id,date) values
    (current_match,league,public.current_season_start()),
    (old_match,league,(public.current_season_start()-interval '6 months')::date);
  insert into public.match_players(match_id,player_id,team) values(current_match,player,'A'),(old_match,player,'A');
  gaz_path := league::text || '/' || current_match::text || '-collaudo.jpg';
  insert into storage.objects(bucket_id,name) values('gazzette',gaz_path);

  perform set_config('request.jwt.claim.sub', standard::text, true);
  set local role authenticated;
  select s.active, s.trial into active, trial from public.my_premium_status() s;
  assert not active and not trial, 'Prova scaduta: account Standard';
  denied := false;
  begin perform public.admin_extend_premium(standard,1); exception when others then denied := true; end;
  assert denied, 'Un membro non può assegnarsi Premium';
  denied := false;
  begin perform public.request_league('Richiesta vietata',5,null); exception when others then denied := true; end;
  assert denied, 'Standard non può richiedere una lega';
  select count(*) into n from public.matches where league_id=league;
  assert n=1, 'Standard: lo storico precedente alle ultime due stagioni deve essere filtrato';
  reset role;

  perform set_config('request.jwt.claim.sub', premium::text, true);
  set local role authenticated;
  request := public.request_league('Approvata ' || left(league::text,8),5,null);
  rejected := public.request_league('Rifiutata ' || left(league::text,8),5,null);
  expired_request := public.request_league('Scaduta ' || left(league::text,8),5,null);
  denied := false;
  begin perform public.request_league('Approvata ' || left(league::text,8),5,null); exception when others then denied := true; end;
  assert denied, 'Richiesta duplicata in attesa';
  denied := false;
  begin perform public.admin_decide_league_request(request,true); exception when others then denied := true; end;
  assert denied, 'Solo il super amministratore può approvare';
  select count(*) into n from public.matches where league_id=league;
  assert n=2, 'Premium vede lo storico della propria lega';
  reset role;
  assert not exists(select 1 from public.leagues where name='Approvata ' || left(league::text,8)), 'La richiesta non deve creare subito la lega';

  update public.account_premium set expires_at=now()-interval '1 second', trial_expires_at=now()-interval '1 second' where user_id=premium;
  perform set_config('request.jwt.claim.sub', supervisor::text, true);
  set local role authenticated;
  denied := false;
  begin perform public.admin_decide_league_request(expired_request,true); exception when others then denied := sqlerrm like '%Premium%'; end;
  assert denied, 'Un richiedente scaduto prima della decisione non può ottenere una nuova lega';
  reset role;
  assert exists(select 1 from public.league_creation_requests where id=expired_request and status='pending'), 'Approvazione fallita senza alterare la richiesta';
  update public.account_premium set expires_at=now()+interval '1 month', trial_expires_at=now()+interval '1 month' where user_id=premium;

  perform set_config('request.jwt.claim.sub', supervisor::text, true);
  set local role authenticated;
  approved := public.admin_decide_league_request(request,true);
  perform public.admin_decide_league_request(rejected,false);
  perform public.admin_set_feature_mode('couples','standard');
  reset role;
  assert exists(select 1 from public.league_members where league_id=approved and user_id=premium and role='admin'), 'Il richiedente deve diventare admin';
  assert exists(select 1 from public.leagues where id=approved and owner_id=premium), 'Proprietario della lega approvata';
  assert not exists(select 1 from public.leagues where name='Rifiutata ' || left(league::text,8)), 'Rifiuto senza creare lega';

  perform set_config('request.jwt.claim.sub', standard::text, true);
  set local role authenticated;
  assert public.feature_allowed('couples'), 'Funzione Standard accessibile';
  reset role;
  perform set_config('request.jwt.claim.sub', supervisor::text, true);
  set local role authenticated;
  perform public.admin_set_feature_mode('couples','premium');
  reset role;
  perform set_config('request.jwt.claim.sub', standard::text, true);
  set local role authenticated;
  assert not public.feature_allowed('couples'), 'Funzione Premium negata a Standard';
  reset role;
  perform set_config('request.jwt.claim.sub', premium::text, true);
  set local role authenticated;
  assert public.feature_allowed('couples'), 'Funzione Premium accessibile a Premium';
  reset role;
  perform set_config('request.jwt.claim.sub', supervisor::text, true);
  set local role authenticated;
  perform public.admin_set_feature_mode('couples','beta');
  assert public.feature_allowed('couples'), 'Beta accessibile al super amministratore';
  reset role;
  perform set_config('request.jwt.claim.sub', premium::text, true);
  set local role authenticated;
  assert not exists(select 1 from public.my_feature_modes() where feature='couples'), 'Beta nascosta anche ai Premium';
  reset role;

  perform set_config('request.jwt.claim.sub', administrator::text, true);
  set local role authenticated;
  assert public.is_league_admin(league), 'Admin scaduto mantiene il ruolo';
  assert public.can_edit_player(player), 'Admin scaduto modifica la Rosa';
  assert not public.can_delete_player(player), 'Admin scaduto non elimina giocatori';
  assert not public.is_premium_league_admin(league), 'Impostazioni avanzate non abilitate';
  update public.matches set notes='Modifica amministratore Standard' where id=current_match;
  get diagnostics n = row_count;
  assert n=1, 'Admin scaduto gestisce le partite';
  update public.leagues set name='Non consentito' where id=league;
  get diagnostics n = row_count;
  assert n=0, 'Admin scaduto non cambia impostazioni lega';
  assert not public.can_write_gazzetta(league), 'Admin scaduto non pubblica Gazzette';
  reset role;

  perform set_config('request.jwt.claim.sub', editor::text, true);
  set local role authenticated;
  perform public.publish_gazzetta(current_match,gaz_path);
  assert not exists(select 1 from public.gazzette where match_id=current_match), 'Redazione Standard pubblica ma non legge';
  reset role;
  perform set_config('request.jwt.claim.sub', premium::text, true);
  set local role authenticated;
  assert exists(select 1 from public.gazzette where match_id=current_match), 'Membro Premium legge la Gazzetta';
  assert exists(select 1 from storage.objects where name=gaz_path and bucket_id='gazzette'), 'File accessibile al membro Premium';
  reset role;
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  set local role authenticated;
  assert not exists(select 1 from public.gazzette where match_id=current_match), 'Premium esterno non legge Gazzette';
  assert not exists(select 1 from storage.objects where name=gaz_path and bucket_id='gazzette'), 'Premium esterno non legge i file';
  reset role;

  perform set_config('request.jwt.claim.sub', supervisor::text, true);
  set local role authenticated;
  perform public.admin_grant_lifetime_premium(standard);
  reset role;
  perform set_config('request.jwt.claim.sub', standard::text, true);
  set local role authenticated;
  assert (select s.active and s.lifetime and s.expires_at is null from public.my_premium_status() s), 'Premium a vita';
  reset role;
end $test$;
select 'Collaudo Premium: tutti i controlli superati. Dati e configurazioni annullati con ROLLBACK.' as esito;
rollback;
