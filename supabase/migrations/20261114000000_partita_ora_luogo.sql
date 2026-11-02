-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · ora e luogo della partita (oltre alla data)
--  Servono al promemoria del giorno della partita. Le partite già giocate restano senza (campi vuoti).
--  Applicare con:  npx supabase db push --linked
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.matches add column if not exists play_time time;
alter table public.matches add column if not exists place text;
alter table public.matches drop constraint if exists matches_place_len;
alter table public.matches add constraint matches_place_len check (place is null or char_length(place) between 1 and 80);

-- fine ✔
