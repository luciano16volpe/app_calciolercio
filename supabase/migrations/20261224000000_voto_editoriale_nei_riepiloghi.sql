-- Mantiene leggibile il voto goliardico anche quando l'editore non scrive testo.
create or replace view public.match_player_summaries with (security_invoker = true) as
select match_id,player_id,team,position,rating,goals,assist,autogol,meta,rigori_sbagliati,
  (btrim(coalesce(titolo,''))<>'' or btrim(coalesce(descrizione,''))<>'' or editor_rating is not null) as has_text,
  editor_rating
from public.match_players;
