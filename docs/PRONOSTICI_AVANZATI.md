# Pronostici avanzati

CalcioLercio usa React, TypeScript e Supabase. Il catalogo dichiarativo di 140 condizioni, il valutatore e l'estrattore sono in `supabase/functions/_shared/` e sono riutilizzati dai test frontend. Le migrazioni `20261222000000_pronostici_avanzati_fondazioni.sql` e `20261223000000_sondaggio_obbligatorio_voto_editore.sql` e `20261224000000_voto_editoriale_nei_riepiloghi.sql` aggiungono configurazione versionata, assegnazioni, esiti, riepiloghi, audit, RPC e il voto separato dell'editore. La precedente sezione 1/X/2 resta disponibile. Le partite storiche servono per le frequenze, senza assegnazioni retroattive.

La Edge Function `advanced-predictions` verifica utente, lega e partecipazione. Genera al massimo cinque pronostici per avversari effettivi con estrazione deterministica e persistente, rotazione, distribuzione indicativa 2/1/1/1/0 e controllo delle sovrapposizioni. L'RPC mantiene l'idempotenza in una transazione. Se mancano candidati validi, ne assegna meno di dieci. Se cambiano le squadre prima del calcio d'inizio, conserva le condizioni ancora valide e sostituisce solo le altre.

La difficoltà usa le ultime venti partite valutabili e una frequenza smussata; sotto cinque partite individuali usa il riferimento della lega o il valore iniziale del template. La percentuale individuale appare solo da cinque partite valutabili; sotto la soglia non appare alcun messaggio. Le soglie sono 65%, 45%, 25% e 10%. Difficoltà, peso, condizione, storico pertinente e regole vengono congelati nell'assegnazione. La regola aggiornata è nella configurazione versione 3 (`20261228000000_cinque_partite_storiche_pronostici.sql`) e vale per le nuove assegnazioni; quelle già generate mantengono il loro snapshot. I pronostici sui voti usano soltanto la media ufficiale della community. Per scelta del committente si accetta che un partecipante possa influenzare marginalmente la media votando gli altri: da cinque voti il calcolo elimina il minimo e il massimo, mentre con meno di cinque ogni voto incide. Il voto editoriale non entra in statistiche o pronostici.

## Ciclo della partita

Quando l'ADMIN salva per la prima volta un risultato, il database apre il sondaggio pagelle in automatico. Eventuali voti di bozza dell'ADMIN vengono rimossi dalla colonna ufficiale; le statistiche di gioco rimangono. La chiusura naturale o anticipata del sondaggio consolida la media ufficiale. Solo allora il job di riconciliazione valuta gli esiti. I dati mancanti annullano il pronostico interessato, senza confondere NULL con zero. Una correzione ufficiale marca la partita per il ricalcolo; risultati e punti vengono sostituiti, con revisione nell'audit, senza incrementi cumulativi.

I punti sono conservati in interi scalati da 10.000. I pronostici selezionati vincono o perdono il peso assegnato; gli altri valgono zero. Il moltiplicatore si applica al saldo netto positivo con almeno tre pronostici indovinati, accuratezza almeno 70% e risultati definitivi: 3 ×1,25; 4 ×1,50; 5 ×2 (configurazione versione 2, migrazione `20261227000000_cinque_pronostici.sql`). Le partite che avevano già le regole della versione 1 restano a dieci pronostici con i vecchi moltiplicatori. Le classifiche sono isolate per lega e stagione. I badge sono riconoscimenti nel motore esistente e non aggiungono punti.

## Accessi e riservatezza

Gli utenti vedono soltanto le proprie assegnazioni. Le selezioni si modificano fino all'ora ufficiale della partita, verificata dal database in Europe/Rome. Prima del consolidamento l'ADMIN vede soltanto nomi e numero dei giocatori che hanno selezionato almeno una condizione. Le singole scelte sono visibili all'ADMIN solo dopo la chiusura del sondaggio pagelle. Anche il riepilogo amministrativo del vecchio 1/X/2 nasconde le scelte fino al risultato.

L'ADMIN partecipante riceve e seleziona pronostici come gli altri giocatori. Può modificare le statistiche ufficiali: i dati sono pubblici, le correzioni restano nell'audit e i pronostici vengono rivalutati dopo ogni modifica. Questa scelta accetta il rischio residuo di influenza dell'ADMIN sui propri risultati. Le tabelle dei pronostici hanno RLS chiusa; il browser non invia peso, difficoltà o esito. La redazione modifica soltanto titolo, testo e voto editoriale goliardico; il voto ufficiale resta nella colonna rating e arriva dal sondaggio.

## Attivazione e verifica

1. Applicare le migrazioni in ordine cronologico, inclusa `20261221000000_pronostici_partite.sql` se non già applicata.
2. Pubblicare la funzione `advanced-predictions` con JWT attivo. La migrazione `20261225000000_cron_pronostici_con_jwt.sql` fa usare al job il JWT anonimo legacy registrato in `private_config.edge_anon_jwt`; il codice verifica anche `private_config.cron_secret`, uguale al segreto `CRON_SECRET` della funzione. pg_cron richiama la funzione ogni minuto quando ci sono partite da riconciliare.
3. Nel tab Scommesse, l'ADMIN abilita i pronostici avanzati per la lega tramite il flag dedicato. La funzionalità parte solo per partite future con formazioni definitive e ora stabilita.
4. Verificare con `npm run build`, `npm run lint`, `npm test`, `node scripts/verifyAdvancedMigration.mjs` e `node scripts/verifyEditorialMigration.mjs`.

Il sondaggio pagelle si apre automaticamente anche se il flag dei pronostici avanzati è disattivato. Il vecchio percorso di conferma delle statistiche rimane solo per partite storiche senza sondaggio.
