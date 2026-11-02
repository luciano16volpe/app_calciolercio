-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · notifiche push: l'app legge la chiave PUBBLICA per iscrivere il telefono
--  (la chiave privata sta solo nei «Secrets» del servizio che invia, mai nel database né nel codice).
--  Applicare con:  npx supabase db push --linked
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.push_public_key()
returns text language sql stable security definer set search_path = public as $$
  select value #>> '{}' from app_settings where key = 'vapid_public';
$$;
revoke all on function public.push_public_key() from public, anon;
grant execute on function public.push_public_key() to authenticated;

-- fine ✔
