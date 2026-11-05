# Notifiche Standard e personalizzazione Premium

Decisione del 5 novembre 2026. Servizio push e migrazione applicati in produzione, con collaudo reale superato e dati temporanei annullati.

## Regole

- Tutti possono attivare/disattivare questo telefono e sospendere/riattivare gratuitamente gli invii per l'intero account.
- Standard: promemoria alle 7 italiane del giorno della partita, variazioni di programma/convocazione, risultato e pagelle. Le precedenti disattivazioni per tipo non vengono riattivate.
- Premium (compresa la prova): sceglie i tipi e un solo promemoria, alle 7 oppure 1/2/3/24 ore prima. Alla scadenza torna all'orario Standard; i tipi spenti restano spenti e l'anticipo scelto resta memorizzato per un eventuale rinnovo.
- Gazzette: avviso solo ai Premium che appartengono alla lega e partecipano alla partita. Il messaggio non include anteprime o contenuti protetti.
- Tutti gli invii richiedono ancora l'appartenenza alla lega e un telefono iscritto. Nessun invio se l'account ha sospeso le notifiche.
- Preferenze per singola lega e fascia silenziosa sono rinviate.

## Variazioni della partita

Si controllano giorno, ora, luogo e composizione delle squadre delle partite senza risultato. I cambi vengono confrontati a fine transazione: ricreare le righe dei convocati nello stesso salvataggio non genera avvisi intermedi.

Si aspetta un minuto dall'ultima modifica. Gli avvisi includono chi viene aggiunto e chi viene sostituito (convocazione annullata), purché appartenga ancora alla lega. Un ritorno al programma originale prima dell'invio annulla l'avviso. Creazione iniziale, importazioni, sole note, partite già iniziate e risultati non producono avvisi di variazione.

Ogni revisione ha un identificativo distinto per non confondere una modifica nuova con una già inviata. Sul telefono il tag della partita rimane lo stesso, così una notifica successiva aggiorna quella precedente. Il servizio continua a registrare gli invii riusciti per persona e a rimuovere le iscrizioni scadute.

## Promemoria

Il database calcola l'istante usando il fuso Europe/Rome, compresi i cambi dell'ora. Il job controlla ogni minuto e invia solo quando l'orario è raggiunto, prima dell'inizio e se non c'è già un invio registrato. Un anticipo di 24 ore può cadere il giorno prima: il messaggio indica la data corretta. Se manca l'ora della partita, si usa l'orario Standard.

## Verifica e rilascio

- `tests/db/push-premium.test.ts`: permessi SQL, disattivazioni, scadenza, orari, ora legale, Gazzette, cambi atomici e revisione degli invii.
- `tests/push-reminder.test.ts`: testi, data del promemoria e avviso al giocatore sostituito.
- `e2e/notifiche-premium.spec.ts`: Standard, Premium e ripristino dei campi dopo un errore sui tre formati.
- Le prove browser usano un telefono simulato: ricezione reale e installazione PWA vanno provate su dispositivi fisici.

Ordine di rilascio: funzione Edge `push` con i nuovi messaggi; migrazione `20261204000000_notifiche_standard_premium.sql`; rigenerazione dei tipi e frontend. La funzione Edge aggiornata è compatibile con gli eventi precedenti; il database nuovo può generare eventi che la vecchia funzione non riconosce. Il generatore non descrive gli argomenti SQL nullable: conservare `number | null` per `set_push_reminder.p_minutes` (NULL ripristina le 7).

`supabase/tests/notifiche_premium.sql` verifica in ambiente permessi, sospensione gratuita, preferenze conservate, anticipo Premium, scadenza, Gazzette, variazioni, sostituiti, revisioni e uscita dalla lega, con ROLLBACK. Lo stesso script è eseguito da `tests/db/push-collaudo.test.ts`, che verifica anche l'annullamento dei dati.
