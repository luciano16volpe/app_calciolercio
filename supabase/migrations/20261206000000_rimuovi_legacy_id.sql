-- Toglie la colonna `legacy_id` (id della vecchia app, usata solo dall'importazione, ormai completata).
alter table public.players drop column if exists legacy_id;
alter table public.matches drop column if exists legacy_id;
