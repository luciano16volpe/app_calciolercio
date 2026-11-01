-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · una lega si vede solo ai suoi membri
--  Le leghe pubbliche non esistono più (vincolo leagues_solo_invito): si toglie
--  dalla regola di visibilità la vecchia eccezione «lega pubblica».
--  Applicare con:  npx supabase db push --linked
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.league_visible(l uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from league_members where league_id = l and user_id = auth.uid());
$$;

-- fine ✔
