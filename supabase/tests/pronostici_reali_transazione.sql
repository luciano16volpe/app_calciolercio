-- Prova su membri reali, completamente annullata al termine.
begin;

do $$
declare pair record;
begin
  select m.id as match_id, m.league_id, member.user_id as member_id, admin.user_id as admin_id
    into pair
    from public.matches m
    join public.league_members member on member.league_id=m.league_id and member.role='member'
    join public.league_members admin on admin.league_id=m.league_id and admin.role='admin'
    where m.score_a is null and m.score_b is null and m.play_time is not null
      and now() < (m.date+m.play_time) at time zone 'Europe/Rome'
      and member.user_id<>admin.user_id
      and not exists (select 1 from public.match_predictions p where p.match_id=m.id and p.user_id=member.user_id)
    order by m.date,m.id limit 1;
  if pair.match_id is null then raise exception 'Nessuna coppia membro/ADMIN adatta alla prova'; end if;
  perform set_config('test.match_id',pair.match_id::text,true);
  perform set_config('test.league_id',pair.league_id::text,true);
  perform set_config('test.member_id',pair.member_id::text,true);
  perform set_config('test.admin_id',pair.admin_id::text,true);
end $$;

set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claim.sub',current_setting('test.member_id'),true);
  perform public.save_match_prediction(current_setting('test.match_id')::uuid,'1',2::smallint,1::smallint);
end $$;

do $$
declare item jsonb;
begin
  select x into item from jsonb_array_elements(public.betting_board(current_setting('test.league_id')::uuid)) x
    where x->>'match_id'=current_setting('test.match_id');
  if item->'my_prediction'->>'outcome' <> '1' or item->'my_prediction'->>'score_a' <> '2'
    or (item->>'total')::integer < 1 or item->'entries' <> 'null'::jsonb then
    raise exception 'Il membro non vede correttamente il proprio pronostico'; end if;
end $$;

do $$ begin perform set_config('request.jwt.claim.sub',current_setting('test.admin_id'),true); end $$;
do $$
declare item jsonb;
begin
  select x into item from jsonb_array_elements(public.betting_board(current_setting('test.league_id')::uuid)) x
    where x->>'match_id'=current_setting('test.match_id');
  if not exists (select 1 from jsonb_array_elements(item->'entries') entry
    where entry->>'user_id'=current_setting('test.member_id')
      and entry->>'outcome'='1' and entry->>'score_a'='2' and entry->>'score_b'='1') then
    raise exception 'L’ADMIN non vede il pronostico del membro'; end if;
end $$;

rollback;
