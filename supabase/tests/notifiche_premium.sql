-- Collaudo delle notifiche sul progetto collegato. Nessun invio: rollback totale.
begin;
do $test$
declare
  u_standard uuid:=gen_random_uuid(); u_premium uuid:=gen_random_uuid(); u_reserve uuid:=gen_random_uuid();
  l uuid:=gen_random_uuid(); m uuid:=gen_random_uuid();
  a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
  day date:=(now() at time zone 'Europe/Rome')::date+2;
  denied boolean; old_revision text;
begin
  insert into auth.users(id,email,aud,role,created_at,raw_user_meta_data)
    select u,'collaudo-notifiche-'||u::text||'@example.invalid','authenticated','authenticated',now(),'{}'
    from unnest(array[u_standard,u_premium,u_reserve]) u;
  delete from public.account_premium where user_id in (u_standard,u_reserve);
  perform set_config('request.jwt.claim.sub','',true);
  insert into public.leagues(id,name) values(l,'Collaudo notifiche '||left(l::text,8));
  insert into public.league_members(league_id,user_id,role) values(l,u_standard,'admin'),(l,u_premium,'member'),(l,u_reserve,'member');
  insert into public.players(id,name,user_id) values(a,'Collaudo Uno',u_standard),(b,'Collaudo Due',u_premium),(c,'Collaudo Tre',u_reserve);
  insert into public.league_players(league_id,player_id) values(l,a),(l,b),(l,c);
  insert into public.matches(id,league_id,date,play_time,place) values(m,l,day,'21:00','Campo');
  insert into public.match_players(match_id,player_id,team,position) values(m,a,'A',0),(m,b,'B',0);
  insert into public.push_subscriptions(user_id,endpoint,p256dh,auth)
    select u,'https://example.invalid/collaudo-'||u::text,'test','test' from unnest(array[u_standard,u_premium,u_reserve]) u;
  insert into public.push_prefs(user_id,ratings) values(u_standard,false);
  set constraints all immediate;
  set constraints all deferred;
  assert not exists(select 1 from public.push_program_changes where match_id=m),'Creazione iniziale notificata';

  perform set_config('request.jwt.claim.sub',u_standard::text,true);
  set local role authenticated;
  denied:=false;
  begin perform public.set_push_pref('result',false); exception when others then
    assert sqlerrm like '%Premium%'; denied:=true; end;
  assert denied,'Standard ha personalizzato i tipi';
  denied:=false;
  begin perform public.set_push_reminder(60); exception when others then
    assert sqlerrm like '%Premium%'; denied:=true; end;
  assert denied,'Standard ha personalizzato l’anticipo';
  perform public.set_push_enabled(false);
  reset role;
  assert not exists(select 1 from public.push_due_at((day+'08:00'::time) at time zone 'Europe/Rome') d where d.match_id=m and d.user_id=u_standard),'Sospensione ignorata';
  perform set_config('request.jwt.claim.sub',u_standard::text,true); set local role authenticated;
  perform public.set_push_enabled(true);
  assert (select ratings=false from public.my_push_prefs()),'Preferenza precedente riattivata';
  reset role;
  assert exists(select 1 from public.push_due_at((day+'07:00'::time) at time zone 'Europe/Rome') d where d.match_id=m and d.user_id=u_standard),'Promemoria Standard mancante';

  perform set_config('request.jwt.claim.sub',u_premium::text,true); set local role authenticated;
  perform public.set_push_reminder(120);
  perform public.set_push_pref('ratings',false);
  reset role;
  assert not exists(select 1 from public.push_due_at((day+'08:00'::time) at time zone 'Europe/Rome') d where d.match_id=m and d.user_id=u_premium),'Anticipo Premium ignorato';
  assert exists(select 1 from public.push_due_at((day+'19:00'::time) at time zone 'Europe/Rome') d where d.match_id=m and d.user_id=u_premium),'Anticipo Premium mancante';
  insert into public.gazzette(match_id,file_path,uploaded_at) values(m,l::text||'/'||m::text||'.jpg',now()-interval '2 minutes');
  assert exists(select 1 from public.push_due_at(now()) d where d.match_id=m and d.user_id=u_premium and d.kind='gazzetta'),'Gazzetta Premium mancante';
  assert not exists(select 1 from public.push_due_at(now()) d where d.match_id=m and d.user_id=u_standard and d.kind='gazzetta'),'Gazzetta inviata a Standard';
  delete from public.account_premium where user_id=u_premium;
  assert exists(select 1 from public.push_due_at((day+'08:00'::time) at time zone 'Europe/Rome') d where d.match_id=m and d.user_id=u_premium and d.kind='reminder'),'Scadenza: non torna alle 7';
  assert (select not ratings and reminder_minutes=120 from public.push_prefs where user_id=u_premium),'Scadenza: preferenze perse';

  update public.matches set place='Altro campo' where id=m;
  delete from public.match_players where match_id=m;
  insert into public.match_players(match_id,player_id,team,position) values(m,c,'A',0),(m,b,'B',0);
  set constraints all immediate;
  set constraints all deferred;
  assert (select count(*)=3 from public.push_program_changes where match_id=m),'Variazioni: destinatari errati';
  assert not exists(select 1 from public.push_due_at(now()) d where d.match_id=m and d.kind like 'change:%'),'Debounce assente';
  assert exists(select 1 from public.push_due_at(now()+interval '2 minutes') d where d.match_id=m and d.user_id=u_standard and d.team='out' and d.kind like 'change:%'),'Sostituito non avvisato';
  select 'change:'||revision::text into old_revision from public.push_program_changes where match_id=m and user_id=u_premium;
  insert into public.push_sent(kind,match_id,user_id) values(old_revision,m,u_premium);
  update public.matches set place='Terzo campo' where id=m;
  set constraints all immediate;
  set constraints all deferred;
  assert exists(select 1 from public.push_due_at(now()+interval '2 minutes') d where d.match_id=m and d.user_id=u_premium and d.kind like 'change:%' and d.kind<>old_revision),'Revisione nuova soppressa';
  perform set_config('request.jwt.claim.sub','',true);
  delete from public.league_members where league_id=l and user_id=u_premium;
  assert not exists(select 1 from public.push_due_at(now()+interval '2 minutes') d where d.match_id=m and d.user_id=u_premium),'Avviso dopo uscita dalla lega';
end $test$;
select 'Notifiche: tutti i controlli superati; dati temporanei annullati con ROLLBACK.' as esito;
rollback;
