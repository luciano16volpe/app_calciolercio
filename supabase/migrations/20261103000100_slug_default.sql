-- Lo slug lo calcola sempre il database (automatismo leagues_before_insert): chi inserisce una lega non deve passarlo.
alter table public.leagues alter column slug set default '';
