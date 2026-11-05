# Collaudo prima del passaggio — regole attuali

Aggiornamento del 5 novembre 2026. Sostituisce il resoconto della Fase 4 del 1 novembre: i vecchi esiti non certificano le funzioni aggiunte dopo quella data.

## Ambienti e limiti

- `npm test`: logica e PostgreSQL in memoria (PGlite), con tutte le migrazioni. Auth e servizi Storage sono simulati; funzioni e RLS applicative sono eseguite.
- `npm run e2e -- entrambi`: app compilata nei browser emulati iPhone, Android e 360 px. Accessi e dati simulati, nessuna scrittura in produzione. Verifica interfaccia e richieste; non sostituisce Supabase.
- `supabase/tests/premium.sql`: controlli sul progetto collegato dentro una transazione con `ROLLBACK`. Account, contenuti e modifiche alle modalità delle funzioni vengono annullati. Prima viene eseguito anche da `tests/db/premium-collaudo.test.ts`, che verifica l'annullamento.
- Installazione PWA, push ricevuti e fluidità su telefoni fisici richiedono ancora una prova manuale.

## Matrice Premium

Premium appartiene all'account. Ruolo e abbonamento sono distinti: Premium non concede accesso alle leghe altrui.

| Operazione | Standard | Premium / prova attiva | Controllo |
|---|---|---|---|
| Prova gratuita | Un mese dalla registrazione, una sola volta | Accesso fino alla scadenza | Trigger di registrazione |
| Rinnovo, revoca, vita | Non modificabile dal titolare | Durata assegnata; vita senza scadenza | Solo super amministratore |
| Richiesta nuova lega | Negata | In attesa, senza creare subito la lega | Super amministratore approva/rifiuta; richiedente ancora Premium alla decisione |
| Funzione Standard | Accessibile nella propria lega | Accessibile nella propria lega | Modalità configurata dalla piattaforma |
| Funzione Premium | Negata | Accessibile nella propria lega | Controllo dell'account |
| Funzione Beta | Nascosta | Nascosta | Solo super amministratore |
| Storico in modalità Premium | Stagione corrente e precedente | Storico disponibile della lega | Database, anche su richieste dirette |
| Storico in modalità Standard | Storico disponibile della lega | Storico disponibile della lega | Cambio modalità e invalidazione cache |
| Leggere Gazzette e file | Negato | Solo nelle proprie leghe | Se non ci sono contenuti la sezione non appare |
| Pubblicare Gazzette | Redazione della lega; admin Standard escluso | Admin o redazione autorizzati | Appartenenza e ruolo, anche per Storage |

La qualifica di super amministratore abilita le funzioni di piattaforma. Non va confusa con l'appartenenza a una lega per leggere le sue Gazzette.

## Admin senza Premium

| Azione nella propria lega | Consentita |
|---|---|
| Sorteggio, partite, voti, pagelle | Sì |
| Aggiungere e modificare la Rosa | Sì |
| Membri e inviti | Sì, rispettando le regole del creatore |
| Programma e convocati prima della partita | Sì, senza risultati o dati di gioco già registrati |
| Impostazioni avanzate ed eliminazione lega | No |
| Eliminare definitivamente giocatori | No |
| Pubblicare Gazzette come admin | No |
| Leggere Gazzette come Standard | No |

La scadenza non cancella l'appartenenza né il ruolo amministrativo. Per una redazione Standard resta valida l'autorizzazione distinta a pubblicare.

Gli incontri futuri devono restare visibili anche se rinviati alla stagione successiva: il limite Standard riguarda le partite storiche. La nuova migrazione `20261203000000_modifica_programma_partita.sql` copre anche questo caso; va applicata prima di pubblicare l'editor.

## Prove ripetibili

| Area | File |
|---|---|
| Prova, rinnovo, revoca, vita, admin scaduto | `tests/db/account-premium.test.ts` |
| Richieste di lega | `tests/db/league-requests.test.ts`, `supabase/tests/premium.sql` |
| Standard / Premium / Beta | `tests/db/feature-modes.test.ts` |
| Storico e cambio anno | `tests/db/history-access.test.ts`, `tests/previous-season.test.ts` |
| Gazzette e isolamento fra leghe | `tests/db/gazzette-premium.test.ts`, `supabase/tests/premium.sql` |
| Collaudo SQL e ROLLBACK | `tests/db/premium-collaudo.test.ts` |
| Programma partita sul database reale, con ROLLBACK | `supabase/tests/programma_partita.sql` |
| Salvataggi atomici e modifiche concorrenti | `tests/db/atomic-saves.test.ts`, `tests/db/planned-match.test.ts` |
| Schede coerenti | `e2e/scheda-coerente.spec.ts`, `tests/profile-season.test.ts` |
| Anteprime protette | `e2e/gazzetta-privata.spec.ts` |
| Swipe e Abbonamenti | `e2e/menu.spec.ts` |
| Più telefoni e ruoli | `e2e/scenario.spec.ts` |

Non vengono più confrontati codice, markup o risultati prodotti dalla vecchia app. I test di dominio verificano esempi, soglie e invarianti delle regole attuali. Le fixture storiche restano dati per le prove e per l'importazione.

## Esito dell'ultima esecuzione

Verifiche completate il 5 novembre 2026 sulle modifiche locali:

- Unitari e database in memoria: **202 test passati in 28 file**.
- Lint e build: superati.
- Suite browser completa, due worker e nessun retry: **469 passati, 5 esclusi intenzionalmente, 0 errori** su iPhone, Android e 360 px (25,5 minuti). Report salvato in `test-checkpoints/2026-11-05/collaudo-finale.json`.
- I cinque casi esclusi riguardano tre prove push che richiedono l'installazione PWA su iPhone e due varianti Android della spiegazione specifica per iPhone.
- Ripetizione mirata dei cinque percorsi iPhone che avevano avuto timeout (Panchina, collegamenti alle partite, caricamento Gazzetta, footer e statistiche del profilo), due esecuzioni ciascuno: **10 passati, 0 errori**, con due worker e nessun retry. Report: `test-checkpoints/2026-11-05/collaudo-stabilita.json`.
- Prove browser mirate su foto/pagelle ed editor del programma partita: **27 passate** sui tre formati, compreso il conflitto con aggiornamenti in background.
- Collaudo Premium sul progetto Supabase collegato: superato; dati e configurazioni di prova annullati con `ROLLBACK`.
- Dopo la migrazione in produzione: superata anche `supabase/tests/programma_partita.sql` con un admin Standard (sostituto dalla Rosa, rifiuto esterno, conflitto, risultato zero, visibilità futura e permessi). Collaudo Premium ripetuto e superato. Entrambe le prove annullano i dati temporanei con `ROLLBACK`.

La prova aggiuntiva con quattro worker è stata interrotta dopo cinque timeout nei percorsi iPhone; non è certificata. La configurazione ordinaria usa due worker, senza aumentare i timeout o riprovare automaticamente i test falliti.

La migrazione `supabase/migrations/20261203000000_modifica_programma_partita.sql` è stata applicata in produzione il 5 novembre 2026, prima del frontend, su autorizzazione dell'utente. La nuova RPC è stata verificata anche nell'ambiente Supabase reale. I tipi TypeScript sono stati rigenerati dallo schema aggiornato; build e lint sono passati nuovamente. Il rilascio di queste modifiche resta distinto dal passaggio finale descritto sotto.

## Prove manuali prima del passaggio

1. Standard e Premium nella stessa lega, più un Premium esterno: Gazzette, storico e link diretti.
2. Admin scaduto: gestione ordinaria disponibile, funzioni riservate non abilitate; ripristino al rinnovo.
3. Richiesta di lega: approvazione/rifiuto e scadenza del richiedente prima della decisione.
4. Cambio modalità su una sessione aperta: lo storico non deve restare accessibile tramite cache dopo una revoca.
5. Telefoni fisici: installazione e aggiornamento PWA, push, foto/miniature, tema scuro, swipe e larghezza 412 px.
6. Seguire `docs/passaggio/PIANO_PASSAGGIO.md` solo con il via al passaggio. Backup, importazione finale, inviti e modifica del vecchio sito restano azioni distinte.
