-- Rinomina senza cambiare l'identità del giocatore né perdere lo storico.
create function public.admin_rename_player(p_player uuid, p_name text)
returns text language plpgsql security definer set search_path=public as $$
declare
  nn text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  old_name text;
  taken text;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Permesso negato';
  end if;
  if char_length(nn) < 2 or char_length(nn) > 30 then
    raise exception 'Il nome deve avere da 2 a 30 caratteri';
  end if;
  if nn ~ '[[:cntrl:]<>]' then
    raise exception 'Il nome contiene caratteri non ammessi';
  end if;
  select name into old_name from players where id=p_player for update;
  if not found then raise exception 'Giocatore non trovato'; end if;
  if public.norm_name(old_name) <> public.norm_name(nn) then
    select l.name into taken
    from league_players mine
    join league_players lp on lp.league_id=mine.league_id and lp.player_id<>p_player
    join players p on p.id=lp.player_id
    join leagues l on l.id=lp.league_id
    where mine.player_id=p_player
      and (public.norm_name(p.name)=public.norm_name(nn)
        or exists (select 1 from unnest(lp.aliases) a where public.norm_name(a)=public.norm_name(nn)))
    limit 1;
    if taken is not null then
      raise exception 'Il nome «%» è già usato da un altro giocatore (lega %)', nn, taken;
    end if;
    update league_players lp set aliases=aliases || old_name
    where lp.player_id=p_player
      and not exists (select 1 from unnest(lp.aliases) a where public.norm_name(a)=public.norm_name(old_name));
  end if;
  update players set name=nn where id=p_player;
  return nn;
end $$;
revoke all on function public.admin_rename_player(uuid,text) from public,anon;
grant execute on function public.admin_rename_player(uuid,text) to authenticated;
