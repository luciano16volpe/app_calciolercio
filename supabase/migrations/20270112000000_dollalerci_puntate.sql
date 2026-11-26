-- Punto 2: ogni elemento scelto del Bet costa un dollalercio.
-- La puntata e la scelta vengono salvate nella stessa transazione.
-- Le giocate già presenti prima di questa migrazione restano gratuite: si addebitano solo nuove scelte.
create table public.wallet_stakes (
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  element_key text not null check (length(element_key) between 1 and 60),
  created_at timestamptz not null default now(),
  primary key (league_id,user_id,match_id,element_key)
);
create index wallet_stakes_match_idx on public.wallet_stakes(match_id);
alter table public.wallet_stakes enable row level security;
revoke all on public.wallet_stakes from anon,authenticated;

create function public.wallet_place_stake(p_league uuid,p_user uuid,p_match uuid,p_key text)
returns void language plpgsql security definer set search_path=public as $$
declare initial_id uuid; balance integer;
begin
  if auth.uid() is distinct from p_user or not exists(select 1 from league_members
      where league_id=p_league and user_id=p_user) then raise exception 'Permesso negato'; end if;
  if exists(select 1 from wallet_stakes where league_id=p_league and user_id=p_user
      and match_id=p_match and element_key=p_key) then return; end if;
  perform public.wallet_state(p_league);
  select id into initial_id from wallet_transactions where league_id=p_league and user_id=p_user
    and kind='INITIAL' for update;
  if initial_id is null then raise exception 'Conto non disponibile'; end if;
  select coalesce(sum(amount),0) into balance from wallet_transactions
    where league_id=p_league and user_id=p_user;
  if balance<1 then raise exception 'Dollalerci insufficienti'; end if;
  insert into wallet_stakes(league_id,user_id,match_id,element_key)
    values(p_league,p_user,p_match,p_key) on conflict do nothing;
  if found then
    insert into wallet_transactions(league_id,user_id,match_id,amount,kind,note)
      values(p_league,p_user,p_match,-1,'STAKE',p_key);
  end if;
end $$;
revoke all on function public.wallet_place_stake(uuid,uuid,uuid,text) from public,anon,authenticated;

create function public.wallet_release_stake(p_user uuid,p_match uuid,p_key text)
returns void language plpgsql security definer set search_path=public as $$
declare lid uuid; initial_id uuid;
begin
  select league_id into lid from wallet_stakes where user_id=p_user and match_id=p_match and element_key=p_key;
  if lid is null then return; end if;
  select id into initial_id from wallet_transactions where league_id=lid and user_id=p_user
    and kind='INITIAL' for update;
  delete from wallet_stakes where league_id=lid and user_id=p_user and match_id=p_match and element_key=p_key;
  if found then
    insert into wallet_transactions(league_id,user_id,match_id,amount,kind,note)
      values(lid,p_user,case when exists(select 1 from matches where id=p_match) then p_match else null end,
        1,'REFUND',p_key);
  end if;
end $$;
revoke all on function public.wallet_release_stake(uuid,uuid,text) from public,anon,authenticated;

-- Rimborsa anche le scelte tolte automaticamente quando cambiano le formazioni.
create function public.wallet_assignment_release()
returns trigger language plpgsql security definer set search_path=public as $$
declare owner_user uuid;
begin
  if old.selected_at is null then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_op='UPDATE' then
    if new.selected_at is not null and new.status not in ('VOID','EXPIRED') then return new; end if;
  end if;
  select user_id into owner_user from players where id=old.predictor_player_id;
  if owner_user is not null then
    perform public.wallet_release_stake(owner_user,old.match_id,'ASSIGNMENT:'||old.id::text);
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger wallet_assignment_release_update after update of selected_at,status
  on public.advanced_prediction_assignments for each row execute function public.wallet_assignment_release();
create trigger wallet_assignment_release_delete after delete
  on public.advanced_prediction_assignments for each row execute function public.wallet_assignment_release();

create function public.wallet_prediction_release()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.wallet_release_stake(old.user_id,old.match_id,'OUTCOME');
  perform public.wallet_release_stake(old.user_id,old.match_id,'EXACT');
  return old;
end $$;
create trigger wallet_prediction_release_delete after delete
  on public.match_predictions for each row execute function public.wallet_prediction_release();

-- La cancellazione di una partita restituisce le puntate prima delle eliminazioni a cascata.
create function public.wallet_match_release()
returns trigger language plpgsql security definer set search_path=public as $$
declare stake record;
begin
  for stake in select user_id,element_key from wallet_stakes where match_id=old.id loop
    perform public.wallet_release_stake(stake.user_id,old.id,stake.element_key);
  end loop;
  return old;
end $$;
create trigger wallet_match_release_delete before delete
  on public.matches for each row execute function public.wallet_match_release();

create or replace function public.save_match_prediction(p_match uuid,p_outcome text,p_score_a smallint default null,p_score_b smallint default null)
returns void language plpgsql security definer set search_path=public as $$
declare m matches%rowtype; previous match_predictions%rowtype; kickoff timestamptz;
begin
  if auth.uid() is null then raise exception 'Devi accedere'; end if;
  select * into m from matches where id=p_match for update;
  if not found or not m.betting_enabled or not exists(select 1 from league_members
      where league_id=m.league_id and user_id=auth.uid()) then raise exception 'Partita non disponibile'; end if;
  if m.play_time is null then raise exception 'L’orario della partita non è ancora definito'; end if;
  kickoff := (m.date+m.play_time) at time zone 'Europe/Rome';
  if m.score_a is not null or m.score_b is not null or now()>=kickoff then
    raise exception 'Pronostici chiusi'; end if;
  if (p_score_a is null) <> (p_score_b is null)
    or (p_score_a is not null and p_score_a not between 0 and 99)
    or (p_score_b is not null and p_score_b not between 0 and 99)
    or (p_outcome is not null and p_outcome not in ('1','X','2'))
    or (p_outcome is null and p_score_a is not null)
    or (p_score_a is not null and p_outcome <> case when p_score_a>p_score_b then '1'
      when p_score_a<p_score_b then '2' else 'X' end) then raise exception 'Pronostico non valido'; end if;
  select * into previous from match_predictions where match_id=p_match and user_id=auth.uid() for update;
  if p_outcome is null then
    if previous.match_id is not null then
      delete from match_predictions where match_id=p_match and user_id=auth.uid();
    end if;
    return;
  end if;
  if previous.match_id is null then
    perform public.wallet_place_stake(m.league_id,auth.uid(),p_match,'OUTCOME');
  end if;
  if p_score_a is not null and (previous.match_id is null or previous.score_a is null) then
    perform public.wallet_place_stake(m.league_id,auth.uid(),p_match,'EXACT');
  end if;
  insert into match_predictions(match_id,user_id,outcome,score_a,score_b)
    values(p_match,auth.uid(),p_outcome,p_score_a,p_score_b)
    on conflict(match_id,user_id) do update set outcome=excluded.outcome,score_a=excluded.score_a,
      score_b=excluded.score_b,updated_at=now();
  if previous.match_id is not null and previous.score_a is not null and p_score_a is null then
    perform public.wallet_release_stake(auth.uid(),p_match,'EXACT');
  end if;
end $$;

create or replace function public.advanced_prediction_select(p_assignment uuid,p_selected boolean)
returns void language plpgsql security definer set search_path=public as $$
declare a advanced_prediction_assignments%rowtype; m matches%rowtype; owner_user uuid;
begin
  if auth.uid() is null then raise exception 'Devi accedere'; end if;
  select * into a from advanced_prediction_assignments where id=p_assignment;
  if not found then raise exception 'Pronostico non trovato'; end if;
  select * into m from matches where id=a.match_id for update;
  select * into a from advanced_prediction_assignments where id=p_assignment for update;
  select user_id into owner_user from players where id=a.predictor_player_id;
  if owner_user is distinct from auth.uid() or not exists(select 1 from league_members
      where league_id=m.league_id and user_id=auth.uid()) then raise exception 'Permesso negato'; end if;
  if not m.betting_enabled or not exists(select 1 from advanced_prediction_league_settings
      where league_id=m.league_id and enabled) then raise exception 'Bet non attivo per questa partita'; end if;
  if m.play_time is null or m.score_a is not null or m.score_b is not null
    or now()>=(m.date+m.play_time) at time zone 'Europe/Rome' then raise exception 'Selezioni chiuse'; end if;
  if not exists(select 1 from match_players target where target.match_id=a.match_id
      and target.player_id=a.target_player_id and not exists(select 1 from match_players predictor
        where predictor.match_id=a.match_id and predictor.player_id=a.predictor_player_id
          and predictor.team=target.team)) then raise exception 'Formazione modificata: pronostico non compatibile'; end if;
  if a.status not in ('AVAILABLE','SELECTED') then raise exception 'Pronostico non modificabile'; end if;
  if p_selected and a.status='AVAILABLE' and (select count(*) from advanced_prediction_assignments
      where match_id=a.match_id and predictor_player_id=a.predictor_player_id and status='SELECTED')
      >=coalesce((a.rules_snapshot->>'maxAssignments')::integer,10) then
    raise exception 'Limite di pronostici raggiunto'; end if;
  if (a.status='SELECTED')=p_selected then return; end if;
  if p_selected then perform public.wallet_place_stake(m.league_id,auth.uid(),a.match_id,'ASSIGNMENT:'||a.id::text); end if;
  update advanced_prediction_assignments set status=case when p_selected then 'SELECTED' else 'AVAILABLE' end,
    selected_at=case when p_selected then now() else null end where id=p_assignment;
  insert into advanced_prediction_audit(assignment_id,match_id,actor_user_id,action,old_values,new_values)
    values(p_assignment,a.match_id,auth.uid(),case when p_selected then 'SELECT' else 'DESELECT' end,
      jsonb_build_object('status',a.status),jsonb_build_object('status',case when p_selected then 'SELECTED' else 'AVAILABLE' end));
end $$;
