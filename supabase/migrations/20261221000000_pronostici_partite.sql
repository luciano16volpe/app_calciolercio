-- Pronostici di lega senza puntate in denaro, quote o premi.
create table public.match_predictions (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  outcome text not null check (outcome in ('1','X','2')),
  score_a smallint check (score_a between 0 and 99),
  score_b smallint check (score_b between 0 and 99),
  updated_at timestamptz not null default now(),
  primary key (match_id,user_id),
  check ((score_a is null) = (score_b is null)),
  check (score_a is null or outcome = case when score_a > score_b then '1' when score_a < score_b then '2' else 'X' end)
);
create index match_predictions_user_idx on public.match_predictions(user_id,updated_at desc);
alter table public.match_predictions enable row level security;
revoke all on public.match_predictions from anon,authenticated;

create function public.save_match_prediction(p_match uuid,p_outcome text,p_score_a smallint default null,p_score_b smallint default null)
returns void language plpgsql security definer set search_path=public as $$
declare m record; kickoff timestamptz;
begin
  if auth.uid() is null then raise exception 'Devi accedere'; end if;
  select league_id,date,play_time,score_a,score_b into m from matches where id=p_match for update;
  if not found or not exists(select 1 from league_members where league_id=m.league_id and user_id=auth.uid()) then
    raise exception 'Partita non disponibile'; end if;
  if m.play_time is null then raise exception 'L’orario della partita non è ancora definito'; end if;
  kickoff := (m.date+m.play_time) at time zone 'Europe/Rome';
  if m.score_a is not null or m.score_b is not null or now()>=kickoff then
    raise exception 'Pronostici chiusi'; end if;
  if p_outcome not in ('1','X','2') or (p_score_a is null) <> (p_score_b is null)
    or p_score_a not between 0 and 99 and p_score_a is not null
    or p_score_b not between 0 and 99 and p_score_b is not null
    or (p_score_a is not null and p_outcome <> case when p_score_a>p_score_b then '1' when p_score_a<p_score_b then '2' else 'X' end) then
    raise exception 'Pronostico non valido'; end if;
  insert into match_predictions(match_id,user_id,outcome,score_a,score_b)
    values(p_match,auth.uid(),p_outcome,p_score_a,p_score_b)
    on conflict(match_id,user_id) do update set outcome=excluded.outcome,score_a=excluded.score_a,
      score_b=excluded.score_b,updated_at=now();
end $$;
revoke all on function public.save_match_prediction(uuid,text,smallint,smallint) from public,anon;
grant execute on function public.save_match_prediction(uuid,text,smallint,smallint) to authenticated;

create function public.betting_board(p_league uuid)
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
    'entries',case when admin then coalesce((select jsonb_agg(jsonb_build_object(
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
