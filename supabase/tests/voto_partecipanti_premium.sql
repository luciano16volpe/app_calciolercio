-- Eseguire come postgres dopo la migrazione. La transazione viene annullata.
begin;
do $test$
declare
  standard_user uuid := gen_random_uuid(); premium_user uuid := gen_random_uuid();
  admin_user uuid := gen_random_uuid(); outsider_user uuid := gen_random_uuid();
  league uuid := gen_random_uuid(); game uuid := gen_random_uuid();
  standard_player uuid := gen_random_uuid(); premium_player uuid := gen_random_uuid(); admin_player uuid := gen_random_uuid();
  denied boolean;
begin
  insert into auth.users(id,email,aud,role,created_at,raw_user_meta_data)
    select u, 'vote-' || u::text || '@example.invalid', 'authenticated', 'authenticated', now(), '{}'
    from unnest(array[standard_user,premium_user,admin_user,outsider_user]) u;
  update public.account_premium set expires_at=now()-interval '1 minute', trial_expires_at=now()-interval '1 minute'
    where user_id in (standard_user,admin_user);
  insert into public.leagues(id,name) values(league,'Voto Premium ' || league::text);
  insert into public.league_members(league_id,user_id,role) values
    (league,standard_user,'member'),(league,premium_user,'member'),
    (league,admin_user,'admin'),(league,outsider_user,'member');
  insert into public.players(id,name,user_id) values
    (standard_player,'Standard',standard_user),
    (premium_player,'Premium',premium_user),
    (admin_player,'Admin',admin_user);
  insert into public.league_players(league_id,player_id) values
    (league,standard_player),(league,premium_player),(league,admin_player);
  insert into public.matches(id,league_id,date) values(game,league,current_date);
  insert into public.match_players(match_id,player_id,team) values
    (game,standard_player,'A'),(game,premium_player,'A'),(game,admin_player,'B');
  insert into public.community_vote_settings(match_id,started_at,enabled_by)
    values(game,now()-interval '1 hour',admin_user);

  perform set_config('request.jwt.claim.sub',standard_user::text,true);
  set local role authenticated;
  assert (public.community_vote_state(game)->>'is_open')::boolean, 'Il pulsante deve restare visibile';
  assert not (public.community_vote_state(game)->>'has_premium')::boolean, 'Standard deve vedere il requisito Premium';
  assert not (public.community_vote_state(game)->>'can_vote')::boolean, 'Standard non può votare';
  denied := false;
  begin
    perform public.submit_community_votes(game,jsonb_build_array(jsonb_build_object('player_id',premium_player,'rating',7)));
  exception when others then denied := sqlerrm like '%Premium%'; end;
  assert denied, 'La RPC deve respingere Standard';
  reset role;

  perform set_config('request.jwt.claim.sub',premium_user::text,true);
  set local role authenticated;
  assert (public.community_vote_state(game)->>'can_vote')::boolean, 'Premium partecipante può votare';
  assert (public.community_vote_state(game)->>'has_premium')::boolean, 'Premium deve essere riconosciuto';
  perform public.submit_community_votes(game,jsonb_build_array(jsonb_build_object('player_id',standard_player,'rating',7)));
  assert (public.community_vote_state(game)->'my_votes'->>standard_player::text)::numeric=7,
    'Il voto Premium deve essere salvato';
  denied := false;
  begin
    perform public.submit_community_votes(game,jsonb_build_array(jsonb_build_object('player_id',premium_player,'rating',8)));
  exception when others then denied := sqlerrm like '%altri partecipanti%'; end;
  assert denied, 'L’autovoto deve restare vietato';
  reset role;

  perform set_config('request.jwt.claim.sub',outsider_user::text,true);
  set local role authenticated;
  assert not (public.community_vote_state(game)->>'can_vote')::boolean, 'Premium non partecipante non può votare';
  denied := false;
  begin
    perform public.submit_community_votes(game,jsonb_build_array(jsonb_build_object('player_id',standard_player,'rating',8)));
  exception when others then denied := sqlerrm like '%Solo chi ha giocato%'; end;
  assert denied, 'La RPC deve respingere chi non ha giocato';
  reset role;

  perform set_config('request.jwt.claim.sub','',true);
  update public.account_premium set expires_at=now()-interval '1 minute', trial_expires_at=now()-interval '1 minute'
    where user_id=premium_user;
  assert exists(select 1 from public.community_votes where match_id=game and voter_user_id=premium_user),
    'La scadenza Premium non deve cancellare i voti esistenti';
  perform set_config('request.jwt.claim.sub',premium_user::text,true);
  set local role authenticated;
  assert not (public.community_vote_state(game)->>'can_vote')::boolean,
    'Il Premium scaduto non può correggere i voti';
  denied := false;
  begin
    perform public.submit_community_votes(game,jsonb_build_array(jsonb_build_object('player_id',standard_player,'rating',8)));
  exception when others then denied := sqlerrm like '%Premium%'; end;
  assert denied, 'La RPC deve respingere il Premium scaduto';
  reset role;
  perform set_config('request.jwt.claim.sub','',true);
  update public.account_premium set expires_at=now()+interval '1 month' where user_id=admin_user;
  perform set_config('request.jwt.claim.sub',admin_user::text,true);
  set local role authenticated;
  assert (public.community_vote_state(game)->>'can_vote')::boolean, 'Admin Premium partecipante può votare';
  perform public.submit_community_votes(game,jsonb_build_array(jsonb_build_object('player_id',standard_player,'rating',8)));
  assert (public.community_vote_progress(game)->>'eligible')::integer=1,
    'Il riepilogo deve contare solo i partecipanti Premium attivi';
  assert (public.community_vote_progress(game)->>'voted')::integer=1,
    'Il voto dell’admin Premium deve essere contato';
  reset role;
end $test$;
rollback;
