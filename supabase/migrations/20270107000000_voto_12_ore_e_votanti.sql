-- Voto dei partecipanti: la finestra dura 12 ore (prima 24), oppure meno se l'admin chiude prima.
-- Tutte le funzioni (stato, invio, chiusura automatica, notifiche) leggono questa scadenza.
create or replace function public.community_vote_deadline(p_started timestamptz, p_early timestamptz)
returns timestamptz language sql stable set search_path=public as $$
  select least(p_started+interval '12 hours', coalesce(p_early,'infinity'::timestamptz));
$$;

-- Quanti hanno votato e quanti mancano: ora lo vede ogni membro della lega (solo i numeri, mai chi ha votato).
create or replace function public.community_vote_progress(p_match uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare lid uuid; eligible integer; voted integer;
begin
  select league_id into lid from matches where id=p_match;
  if lid is null or auth.uid() is null or not exists (
    select 1 from league_members where league_id=lid and user_id=auth.uid()) then
    raise exception 'Permesso negato';
  end if;

  select count(*)::integer,
    count(*) filter (where exists (
      select 1 from community_votes cv
      where cv.match_id=p_match and cv.voter_user_id=p.user_id
    ))::integer
    into eligible,voted
    from match_players mp
    join players p on p.id=mp.player_id
    where mp.match_id=p_match and p.user_id is not null
      and exists (
        select 1 from league_members lm
        where lm.league_id=lid and lm.user_id=p.user_id
      );

  return jsonb_build_object('eligible',eligible,'voted',voted,'remaining',eligible-voted);
end $$;
