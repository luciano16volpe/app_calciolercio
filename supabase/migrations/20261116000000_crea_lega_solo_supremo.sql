-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · per ora le leghe le crea solo l'amministratore supremo
--  (per evitare leghe create a caso: la regola si potrà allargare più avanti, cambiando solo questa regola).
--  Chi è già amministratore di una lega continua a gestirla normalmente.
--  Applicare con:  npx supabase db push --linked
-- ═══════════════════════════════════════════════════════════════════════════
drop policy if exists leagues_insert on public.leagues;
create policy leagues_insert on public.leagues for insert to authenticated with check (public.is_super_admin());

-- fine ✔
