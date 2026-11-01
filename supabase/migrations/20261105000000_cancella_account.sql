-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · Fase 4.8: cancellazione dell'account (privacy)
--  L'account (email, nome, password, appartenenze) viene eliminato. Il giocatore e il suo storico restano
--  nelle leghe, senza account collegato. La proprietà delle leghe passa all'amministratore più anziano
--  (automatismo users_before_delete). Il registro attività è anonimizzato nella migrazione successiva.
--  Applicare con:  npx supabase db push --linked
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Devi prima accedere'; end if;
  if exists (select 1 from platform_admins where user_id = uid)
     and (select count(*) from platform_admins) <= 1 then
    raise exception 'Sei l''unico amministratore della piattaforma: nomina prima un altro amministratore supremo';
  end if;
  -- le funzioni di sistema (cessione della proprietà, scollegamento del giocatore) devono poter passare dai controlli
  perform set_config('app.membership', 'on', true);
  perform set_config('app.linking', 'on', true);
  delete from auth.users where id = uid;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
