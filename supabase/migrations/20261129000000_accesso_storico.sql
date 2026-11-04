-- Limite Standard: stagione corrente e stagione immediatamente precedente,
-- calcolate con il calendario italiano (l'inverno inizia il 1 dicembre).
create function public.current_season_start()
returns date language sql stable set search_path = public as $$
  with t as (select (now() at time zone 'Europe/Rome')::date as d)
  select make_date(extract(year from d)::int - case when extract(month from d) < 3 then 1 else 0 end,
    case when extract(month from d) in (12,1,2) then 12 when extract(month from d) < 6 then 3 when extract(month from d) < 9 then 6 else 9 end, 1) from t;
$$;

create function public.history_date_visible(p_date date)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((auth.uid() is not null and public.feature_allowed('history'))
    or (p_date >= (public.current_season_start() - interval '3 months')::date
      and p_date < (public.current_season_start() + interval '3 months')::date), false);
$$;
revoke all on function public.history_date_visible(date) from public;
grant execute on function public.history_date_visible(date) to authenticated, anon;

create function public.season_key_for_date(p_date date)
returns text language sql immutable set search_path = public as $$
  select (extract(year from p_date)::int - case when extract(month from p_date) < 3 then 1 else 0 end)::text || '-' ||
    case when extract(month from p_date) in (12,1,2) then 'INV' when extract(month from p_date) < 6 then 'PRI' when extract(month from p_date) < 9 then 'EST' else 'AUT' end;
$$;

create function public.history_season_visible(p_season text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((auth.uid() is not null and public.feature_allowed('history')) or p_season in (
    public.season_key_for_date(public.current_season_start()),
    public.season_key_for_date((public.current_season_start() - interval '3 months')::date)
  ), false);
$$;
revoke all on function public.history_season_visible(text) from public;
grant execute on function public.history_season_visible(text) to authenticated, anon;

create function public.feature_visible_to_account(p_feature text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.feature_allowed(p_feature);
$$;
revoke all on function public.feature_visible_to_account(text) from public;
grant execute on function public.feature_visible_to_account(text) to authenticated, anon;

-- Le regole restrittive si aggiungono ai permessi di lega esistenti e valgono
-- anche per le richieste dirette alle tabelle, non solo per l'interfaccia.
create policy matches_history_limit on public.matches as restrictive for select using (public.history_date_visible(date));
create policy match_players_history_limit on public.match_players as restrictive for select using (
  exists (select 1 from public.matches m where m.id = match_id and public.history_date_visible(m.date)));
create policy gazzette_history_limit on public.gazzette as restrictive for select using (
  exists (select 1 from public.matches m where m.id = match_id and public.history_date_visible(m.date)));
create policy match_editors_history_limit on public.match_editors as restrictive for select using (
  exists (select 1 from public.matches m where m.id = match_id and public.history_date_visible(m.date)));
create policy albo_history_limit on public.albo as restrictive for select using (public.history_season_visible(season_key));
create policy albo_feature_limit on public.albo as restrictive for select using (public.feature_visible_to_account('albo'));

-- Le immagini non possono rimanere pubbliche se lo storico è riservato.
update storage.buckets set public = false where id = 'gazzette';
create policy gazzette_files_read on storage.objects for select to authenticated using (
  bucket_id = 'gazzette' and exists (
    select 1 from public.gazzette g join public.matches m on m.id = g.match_id
    where (storage.objects.name = g.file_path or storage.objects.name = regexp_replace(g.file_path, '\.jpg$', '-t.jpg'))
      and public.league_visible(m.league_id) and public.history_date_visible(m.date)
  )
);
