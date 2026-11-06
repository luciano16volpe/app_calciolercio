# CalcioLercio

App per il calcetto tra amici: rosa e figurine, sorteggio squadre equilibrate, partite e pagelle,
classifiche, albo d'oro, Gazzette. Nuova versione multi-lega su Supabase.

- Guida per lo sviluppo (Claude Code): `CLAUDE.md`
- Test e copertura: `docs/TEST.md`
- Regole dell'app: `docs/REGOLE.md` · Decisioni: `docs/DECISIONI.md` · Piano: `docs/PIANO.md`

## Provare (Fase 4)
- `npx tsc --noEmit`, `npx vitest run` (logica), `npm run build`, `npm run e2e` (schermate: ti chiede se provare su iOS, Android o entrambi; `npm run e2e -- ios`, `-- android`, `-- entrambi`).
- Database (vero, senza tracce): `npx supabase db query --linked -f supabase/tests/registro_attivita.sql` (anche `permessi_per_ruolo.sql`, `scenario_completo.sql`); il resoconto compare nel messaggio «REPORT».
- Pubblicare: `npx supabase migration list --linked`, `npx supabase db push --linked`, poi `npx supabase gen types typescript --linked > src/data/types.ts`.
- Amministratore supremo: una volta, nello SQL Editor: `insert into platform_admins select id from auth.users where email='luciano16volpe@gmail.com';`

## Notifiche push
- Il promemoria Standard arriva alle 7 italiane del giorno della partita. Premium può scegliere invece 1, 2, 3 o 24 ore prima; `pg_cron` controlla ogni minuto e sveglia la funzione `push` (`supabase/functions/push`) solo quando ci sono invii pronti.
- Gli eventi disponibili sono **risultato inserito** (1 min dopo), **pagelle pronte** (2 min dopo l'ultima modifica, solo se tutte le pagelle con voto hanno testo), **Gazzetta caricata** (30 s dopo). Solo ai giocatori ancora nella lega, per partite degli ultimi 3 giorni, mai per le importazioni, una volta sola per persona e partita. Le Gazzette notificano solo i Premium. Tutti possono sospendere gli invii; Premium personalizza i tipi (Impostazioni → Notifiche), conservando le disattivazioni alla scadenza.
- Variazioni di giorno, ora, luogo e squadre: un solo avviso dopo un minuto dall'ultima modifica, anche a chi viene sostituito. Le modifiche annullate prima dell'invio non notificano nulla. Dettagli e ordine di rilascio: `docs/specifiche/notifiche-standard-premium.md`.
- Dopo aver modificato la funzione: `npm run push:deploy` (da un terminale normale, chiede conferma).
- **Configurazione, una volta sola:** `npm run push:setup` (genera le chiavi, le mette nei «Secrets» di Supabase e nel database, pubblica la funzione). Le chiavi non vanno mai nel codice.
- Ognuno le attiva da ☰ → Impostazioni app → Notifiche (su iPhone serve l'app installata nella schermata Home); lì c'è anche «Invia una notifica di prova».
- Prove: `tests/push-reminder.test.ts` (testi), `supabase/tests/push.sql` e `supabase/tests/push_eventi.sql` (database), `e2e/impostazioni.spec.ts` (scheda Notifiche).
