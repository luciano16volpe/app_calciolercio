-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · Nessuna lega pubblica: ogni lega si vede solo con un invito (link personale o codice).
--  Tutte le leghe esistenti diventano private e il database non accetta più leghe pubbliche.
--  Applicare con:  npx supabase db push --linked
-- ═══════════════════════════════════════════════════════════════════════════
update public.leagues set is_public = false where is_public;
alter table public.leagues drop constraint if exists leagues_solo_invito;
alter table public.leagues add constraint leagues_solo_invito check (not is_public);
-- fine ✔
