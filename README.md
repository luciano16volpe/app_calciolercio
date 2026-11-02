# CalcioLercio

App per il calcetto tra amici: rosa e figurine, sorteggio squadre equilibrate, partite e pagelle,
classifiche, albo d'oro, Gazzette. Nuova versione multi-lega su Supabase.

- Guida per lo sviluppo (Claude Code): `CLAUDE.md`
- Regole dell'app: `docs/REGOLE.md` · Decisioni: `docs/DECISIONI.md` · Piano: `docs/PIANO.md`
- App attuale (riferimento): `legacy/`

## Provare (Fase 4)
- `npx tsc --noEmit`, `npx vitest run` (logica), `npm run build`, `npm run e2e` (schermate: ti chiede se provare su iOS, Android o entrambi; `npm run e2e -- ios`, `-- android`, `-- entrambi`).
- Database (vero, senza tracce): `npx supabase db query --linked -f supabase/tests/registro_attivita.sql` (anche `permessi_per_ruolo.sql`, `scenario_completo.sql`); il resoconto compare nel messaggio «REPORT».
- Pubblicare: `npx supabase migration list --linked`, `npx supabase db push --linked`, poi `npx supabase gen types typescript --linked > src/data/types.ts`.
- Amministratore supremo: una volta, nello SQL Editor: `insert into platform_admins select id from auth.users where email='luciano16volpe@gmail.com';`

## Notifiche push (promemoria della mattina della partita)
- Alle 7 (ora italiana) del giorno della partita, `pg_cron` sveglia la funzione `push` (`supabase/functions/push`), che manda a chi è in squadra ora, luogo e colore della squadra.
- **Configurazione, una volta sola:** `npm run push:setup` (genera le chiavi, le mette nei «Secrets» di Supabase e nel database, pubblica la funzione). Le chiavi non vanno mai nel codice.
- Ognuno le attiva da ☰ → Impostazioni app → Notifiche (su iPhone serve l'app installata nella schermata Home); lì c'è anche «Invia una notifica di prova».
- Prove: `tests/push-reminder.test.ts` (testo), `supabase/tests/push.sql` (database), `e2e/impostazioni.spec.ts` (scheda Notifiche).
