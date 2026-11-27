-- Fino a tre foto conservate per giocatore; photo_path rimane la foto attiva.
alter table public.players add column photo_gallery text[] not null default '{}';
update public.players set photo_gallery=array[photo_path] where photo_path is not null;
alter table public.players add constraint players_photo_gallery_limit check (cardinality(photo_gallery)<=3);

-- I client già installati aggiornano solo photo_path: sincronizziamo anche l'archivio.
create function public.sync_legacy_player_photo()
returns trigger language plpgsql set search_path=public as $$
declare position integer;
begin
  if new.photo_gallery is distinct from old.photo_gallery or new.photo_path is not distinct from old.photo_path then return new; end if;
  if old.photo_path is not null then
    position:=array_position(old.photo_gallery,old.photo_path);
  end if;
  if new.photo_path is null then
    new.photo_gallery:=array_remove(old.photo_gallery,old.photo_path);
  elsif new.photo_path=any(old.photo_gallery) then
    new.photo_gallery:=old.photo_gallery;
  elsif position is not null then
    new.photo_gallery[position]:=new.photo_path;
  elsif cardinality(old.photo_gallery)<3 then
    new.photo_gallery:=array_append(old.photo_gallery,new.photo_path);
  else
    new.photo_gallery:=old.photo_gallery;
    new.photo_gallery[1]:=new.photo_path;
  end if;
  return new;
end $$;
create trigger players_sync_legacy_photo before update of photo_path on public.players
for each row execute function public.sync_legacy_player_photo();

create function public.manage_player_photo(p_player uuid,p_action text,p_path text default null,p_old_path text default null)
returns text[] language plpgsql security definer set search_path=public as $$
declare item players%rowtype; gallery text[]; position integer;
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  select * into item from players where id=p_player for update;
  if not found then raise exception 'Giocatore non trovato'; end if;
  if item.user_id is distinct from auth.uid() and not exists(
    select 1 from league_players lp join league_members lm on lm.league_id=lp.league_id
    where lp.player_id=p_player and lm.user_id=auth.uid() and lm.role='admin'
  ) then raise exception 'Non puoi modificare le foto di questo giocatore'; end if;
  gallery:=item.photo_gallery;
  if p_action in ('add','replace') then
    if p_path is null or p_path !~ ('^'||p_player::text||'(-[0-9]+)?\.jpg$') then
      raise exception 'Percorso foto non valido'; end if;
    if not exists(select 1 from storage.objects where bucket_id='photos' and name=p_path) then
      raise exception 'Carica la foto prima di salvarla'; end if;
    if p_path=any(gallery) then raise exception 'Foto già presente'; end if;
  end if;
  if p_action='add' then
    if cardinality(gallery)>=3 then raise exception 'Puoi conservare al massimo 3 foto'; end if;
    gallery:=array_append(gallery,p_path);
    update players set photo_gallery=gallery,photo_path=p_path where id=p_player;
  elsif p_action='replace' then
    position:=array_position(gallery,p_old_path);
    if position is null then raise exception 'Foto da sostituire non trovata'; end if;
    gallery[position]:=p_path;
    update players set photo_gallery=gallery,
      photo_path=case when photo_path=p_old_path then p_path else photo_path end where id=p_player;
  elsif p_action='select' then
    if p_path is null or not p_path=any(gallery) then raise exception 'Foto non trovata'; end if;
    update players set photo_path=p_path where id=p_player;
  elsif p_action='remove' then
    if p_path is null or not p_path=any(gallery) then raise exception 'Foto non trovata'; end if;
    gallery:=array_remove(gallery,p_path);
    update players set photo_gallery=gallery,
      photo_path=case when photo_path=p_path then gallery[1] else photo_path end where id=p_player;
  else
    raise exception 'Operazione foto non valida';
  end if;
  return gallery;
end $$;
revoke all on function public.manage_player_photo(uuid,text,text,text) from public,anon;
grant execute on function public.manage_player_photo(uuid,text,text,text) to authenticated;

-- Compatibilità per i client precedenti: una nuova foto sostituisce quella attiva.
create or replace function public.set_my_photo(p_path text)
returns void language plpgsql security definer set search_path=public as $$
declare me uuid:=public.my_player_id(); old_path text;
begin
  if me is null then raise exception 'Non sei collegato a nessun giocatore'; end if;
  select photo_path into old_path from players where id=me;
  if p_path is null then
    if old_path is not null then perform public.manage_player_photo(me,'remove',old_path,null); end if;
  elsif old_path is null then
    perform public.manage_player_photo(me,'add',p_path,null);
  else
    perform public.manage_player_photo(me,'replace',p_path,old_path);
  end if;
end $$;
