-- ═══════════════════════════════════════════════════════════════════════════
--  Scollegare un giocatore dal suo account: solo l'amministratore.
--  Prima la funzione ammetteva anche «la persona stessa»: ora no (il test del profilo l'ha scoperto).
--  Applicare con:  npx supabase db push --linked
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.unlink_player(p uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select user_id into uid from players where id = p;
  if uid is null then return; end if;
  if not public.can_edit_player(p) then
    raise exception 'Permesso negato: solo un amministratore della lega scollega un giocatore';
  end if;
  perform set_config('app.linking', 'on', true);
  update players set user_id = null where id = p;
  delete from player_claims where player_id = p;
end $$;

-- fine ✔
