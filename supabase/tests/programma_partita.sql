-- Verifica della RPC installata in ambiente; tutti i dati sono annullati.
begin;
do $test$
declare
  v_admin uuid := gen_random_uuid(); v_member uuid := gen_random_uuid();
  v_league uuid := gen_random_uuid(); v_match uuid := gen_random_uuid();
  v_a uuid := gen_random_uuid(); v_b uuid := gen_random_uuid();
  v_sub uuid := gen_random_uuid(); v_outside uuid := gen_random_uuid();
  v_original jsonb; v_updated jsonb; v_denied boolean;
  v_future date := (public.current_season_start()+interval '4 months')::date;
begin
  insert into auth.users(id,email,aud,role,created_at,raw_user_meta_data)
    select u,'collaudo-programma-'||u::text||'@example.invalid','authenticated','authenticated',now(),'{}'
    from unnest(array[v_admin,v_member]) u;
  update public.account_premium set expires_at=now()-interval '1 second', trial_expires_at=now()-interval '1 second'
    where user_id=v_admin;
  perform set_config('request.jwt.claim.sub','',true);
  insert into public.leagues(id,name) values(v_league,'Collaudo programma '||left(v_league::text,8));
  insert into public.league_members(league_id,user_id,role) values
    (v_league,v_admin,'admin'),(v_league,v_member,'member');
  insert into public.players(id,name) values
    (v_a,'Collaudo Uno'),(v_b,'Collaudo Due'),(v_sub,'Collaudo Sostituto'),(v_outside,'Collaudo Esterno');
  insert into public.league_players(league_id,player_id) values(v_league,v_a),(v_league,v_b),(v_league,v_sub);
  insert into public.matches(id,league_id,date,play_time,place,pred,pred_rank)
    values(v_match,v_league,current_date,'21:00','Campo originale',0.1,1);
  insert into public.match_players(match_id,player_id,team,position) values(v_match,v_a,'A',0),(v_match,v_b,'B',0);
  v_original:=jsonb_build_object('date',current_date::text,'time','21:00','place','Campo originale','notes','',
    'teamA',jsonb_build_array(v_a),'teamB',jsonb_build_array(v_b));

  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  set local role authenticated;
  v_denied:=false;
  begin
    perform public.update_planned_match(v_match,v_future,'20:00','Campo nuovo','Serale',array[v_outside],array[v_b],v_original);
  exception when others then
    assert sqlerrm like '%Rosa%', 'Rifiuto del sostituto esterno per un motivo inatteso';
    v_denied:=true;
  end;
  assert v_denied, 'Il sostituto esterno deve essere rifiutato';
  assert (select place='Campo originale' from public.matches where id=v_match), 'Il rifiuto deve lasciare intatto il programma';

  perform public.update_planned_match(v_match,v_future,'20:00','Campo nuovo','Serale',array[v_sub],array[v_b],v_original);
  assert (select date=v_future and play_time='20:00'::time and place='Campo nuovo' and notes='Serale'
    and pred is null and pred_rank=0 from public.matches where id=v_match), 'Programma e previsione non aggiornati';
  assert (select count(*)=2 from public.match_players where match_id=v_match), 'Numero convocati inatteso';
  assert exists(select 1 from public.match_players where match_id=v_match and player_id=v_sub and team='A'), 'Sostituto non salvato';
  assert not exists(select 1 from public.match_players where match_id=v_match and player_id=v_a), 'Assente ancora convocato';
  assert public.history_date_visible(v_future), 'La partita futura deve restare visibile a Standard';

  v_denied:=false;
  begin
    perform public.update_planned_match(v_match,v_future,'20:00','Campo nuovo','Serale',array[v_sub],array[v_b],v_original);
  exception when others then
    assert sqlerrm like '%modificata%', 'Conflitto rifiutato per un motivo inatteso';
    v_denied:=true;
  end;
  assert v_denied, 'Snapshot vecchio accettato';
  v_updated:=jsonb_build_object('date',v_future::text,'time','20:00','place','Campo nuovo','notes','Serale',
    'teamA',jsonb_build_array(v_sub),'teamB',jsonb_build_array(v_b));
  update public.matches set score_a=0 where id=v_match;
  v_denied:=false;
  begin
    perform public.update_planned_match(v_match,v_future,'20:00','Campo nuovo','Serale',array[v_sub],array[v_b],v_updated);
  exception when others then
    assert sqlerrm like '%risultati o pagelle%', 'Risultato rifiutato per un motivo inatteso';
    v_denied:=true;
  end;
  assert v_denied, 'Una partita con risultato zero non deve essere riprogrammabile';
  reset role;

  perform set_config('request.jwt.claim.sub',v_member::text,true);
  set local role authenticated;
  v_denied:=false;
  begin
    perform public.update_planned_match(v_match,v_future,'20:00','Campo nuovo','Serale',array[v_sub],array[v_b],v_updated);
  exception when others then
    assert sqlerrm like '%permesso%', 'Membro rifiutato per un motivo inatteso';
    v_denied:=true;
  end;
  assert v_denied, 'Un membro semplice non deve poter modificare i convocati';
  reset role;
  assert not has_function_privilege('anon','public.update_planned_match(uuid,date,time,text,text,uuid[],uuid[],jsonb)','execute'),
    'La RPC non deve essere eseguibile da anon';
end $test$;
select 'Programma partita: tutti i controlli superati; dati annullati con ROLLBACK.' as esito;
rollback;
