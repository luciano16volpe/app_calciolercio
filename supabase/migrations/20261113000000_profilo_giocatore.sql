-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · il giocatore collegato gestisce il proprio profilo
--   · cambia la SUA foto (e solo quella);
--   · cambia il SUO nome (se non è già usato nelle sue leghe): stesso giocatore, nessuna cronologia persa,
--     il vecchio nome resta come «altro nome» così le vecchie pagelle da WhatsApp si riconoscono ancora;
--   · NON può più scollegarsi: il collegamento lo fa e lo toglie solo l'amministratore.
--  Applicare con:  npx supabase db push --linked
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Niente scollegamento da sé ──────────────────────────────────────────
drop function if exists public.unlink_me();

-- ── 2. Il mio giocatore ────────────────────────────────────────────────────
create or replace function public.my_player_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from players where user_id = auth.uid();
$$;
revoke all on function public.my_player_id() from public, anon;
grant execute on function public.my_player_id() to authenticated;

-- ── 3. Foto: ognuno carica, cambia e toglie solo i file del proprio giocatore (<id>.jpg o <id>-<numero>.jpg) ──
drop policy if exists photos_own_insert on storage.objects;
create policy photos_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.my_player_id() is not null
              and name ~ ('^' || public.my_player_id()::text || '(-[0-9]+)?\.jpg$'));
drop policy if exists photos_own_update on storage.objects;
create policy photos_own_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.my_player_id() is not null
         and name ~ ('^' || public.my_player_id()::text || '(-[0-9]+)?\.jpg$'))
  with check (bucket_id = 'photos' and public.my_player_id() is not null
              and name ~ ('^' || public.my_player_id()::text || '(-[0-9]+)?\.jpg$'));
drop policy if exists photos_own_delete on storage.objects;
create policy photos_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.my_player_id() is not null
         and name ~ ('^' || public.my_player_id()::text || '(-[0-9]+)?\.jpg$'));

-- imposta (o toglie, con null) la foto del MIO giocatore: il file deve essere suo
create or replace function public.set_my_photo(p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_player_id();
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  if me is null then raise exception 'Non sei collegato a nessun giocatore'; end if;
  if p_path is not null and p_path !~ ('^' || me::text || '(-[0-9]+)?\.jpg$') then
    raise exception 'La foto non è del tuo giocatore';
  end if;
  update players set photo_path = p_path where id = me;
end $$;
revoke all on function public.set_my_photo(text) from public, anon;
grant execute on function public.set_my_photo(text) to authenticated;

-- ── 4. Nome: lo stesso giocatore (stesso id, stessa cronologia), se il nome è libero ──
create or replace function public.norm_name(t text)
returns text language sql immutable as $$
  select lower(regexp_replace(btrim(coalesce(t, '')), '\s+', ' ', 'g'));
$$;

create or replace function public.rename_my_player(p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.my_player_id();
  nn text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  old text;
  taken text;
begin
  if auth.uid() is null then raise exception 'Devi prima accedere'; end if;
  if me is null then raise exception 'Non sei collegato a nessun giocatore'; end if;
  if char_length(nn) < 2 or char_length(nn) > 30 then raise exception 'Il nome deve avere da 2 a 30 caratteri'; end if;
  if nn ~ '[[:cntrl:]<>]' then raise exception 'Il nome contiene caratteri non ammessi'; end if;
  select name into old from players where id = me;
  if public.norm_name(old) = public.norm_name(nn) then
    -- stesso nome (al più maiuscole o spazi diversi): si aggiorna e basta
    update players set name = nn where id = me;
    return nn;
  end if;
  -- libero = nessun altro giocatore delle mie leghe ha quel nome o lo usa come «altro nome»
  select l.name into taken
    from league_players mine
    join league_players lp on lp.league_id = mine.league_id and lp.player_id <> me
    join players p on p.id = lp.player_id
    join leagues l on l.id = lp.league_id
   where mine.player_id = me
     and (public.norm_name(p.name) = public.norm_name(nn)
          or exists (select 1 from unnest(lp.aliases) a where public.norm_name(a) = public.norm_name(nn)))
   limit 1;
  if taken is not null then raise exception 'Il nome «%» è già usato da un altro giocatore (lega %)', nn, taken; end if;
  -- il vecchio nome diventa «altro nome» in ogni mia lega (le vecchie pagelle si riconoscono ancora)
  update league_players lp
     set aliases = aliases || old
   where lp.player_id = me
     and not exists (select 1 from unnest(lp.aliases) a where public.norm_name(a) = public.norm_name(old));
  update players set name = nn where id = me;
  return nn;
end $$;
revoke all on function public.rename_my_player(text) from public, anon;
grant execute on function public.rename_my_player(text) to authenticated;

-- fine ✔
