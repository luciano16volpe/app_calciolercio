-- Le scelte 1/X/2 sono visibili solo dopo il risultato ufficiale.
-- Prima della partita l'ADMIN può conoscere i partecipanti, ma non i pronostici.
create or replace function public.betting_board(p_league uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb; admin boolean;
begin
  if auth.uid() is null or not exists(select 1 from league_members where league_id=p_league and user_id=auth.uid()) then
    raise exception 'Permesso negato'; end if;
  admin := public.is_league_admin(p_league);
  select coalesce(jsonb_agg(jsonb_build_object(
    'match_id',m.id,'date',m.date,'play_time',m.play_time,'score_a',m.score_a,'score_b',m.score_b,
    'is_open',m.play_time is not null and m.score_a is null and m.score_b is null
      and now() < (m.date+m.play_time) at time zone 'Europe/Rome',
    'my_prediction',(select jsonb_build_object('outcome',v.outcome,'score_a',v.score_a,'score_b',v.score_b)
      from match_predictions v where v.match_id=m.id and v.user_id=auth.uid()),
    'total',(select count(*) from match_predictions v where v.match_id=m.id),
    'entries',case when admin and m.score_a is not null and m.score_b is not null then
      coalesce((select jsonb_agg(jsonb_build_object(
        'user_id',v.user_id,'name',coalesce(public.audit_user_name(v.user_id),'Account'),
        'outcome',v.outcome,'score_a',v.score_a,'score_b',v.score_b)
        order by coalesce(public.audit_user_name(v.user_id),'Account'),v.user_id)
        from match_predictions v where v.match_id=m.id),'[]'::jsonb) else null end
  ) order by m.date desc,m.play_time desc,m.id),'[]'::jsonb) into result
    from (select * from matches where league_id=p_league order by date desc,play_time desc,id limit 30) m;
  return result;
end $$;
revoke all on function public.betting_board(uuid) from public,anon;
grant execute on function public.betting_board(uuid) to authenticated;

create function public.betting_admin_participation(p_match uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare league uuid; result jsonb;
begin
  select league_id into league from matches where id=p_match;
  if auth.uid() is null or league is null or not public.is_league_admin(league) then
    raise exception 'Permesso negato'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',v.user_id,'name',coalesce(public.audit_user_name(v.user_id),'Account'))
    order by coalesce(public.audit_user_name(v.user_id),'Account'),v.user_id),'[]'::jsonb)
    into result from match_predictions v where v.match_id=p_match;
  return result;
end $$;
revoke all on function public.betting_admin_participation(uuid) from public,anon;
grant execute on function public.betting_admin_participation(uuid) to authenticated;
