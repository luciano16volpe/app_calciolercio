# Salvataggi atomici

Partita e squadre, giocatore e appartenenza alla lega, pagelle e intestazione della partita,
soli testi della redazione vengono salvati con comandi PostgreSQL transazionali.
Un errore annulla tutte le scritture del comando, compresi audit, firma e marcatori delle notifiche.
I testi non modificati dall'amministratore vengono conservati; l'intestazione viene riscritta solo se modificata.

Le quattro RPC sono SECURITY INVOKER: applicano le RLS e i trigger esistenti, oltre al controllo esplicito
sul ruolo nella lega. Le funzioni non sono eseguibili da utenti anonimi.
I caricamenti Storage restano operazioni separate e non fanno parte di queste transazioni SQL.
L'atomicita non introduce una risoluzione automatica dei conflitti fra modifiche concorrenti.

## Verifiche

- `npm test`: include i test in `tests/db/atomic-saves.test.ts`.
- `npm run build`.
- `npm run e2e -- entrambi e2e/modifica.spec.ts e2e/redazione.spec.ts e2e/scenario.spec.ts`.

I test SQL usano PGlite, PostgreSQL in memoria: applicano tutte le migrazioni del repository,
con RLS e trigger reali, e simulano errori dopo una prima scrittura riuscita.
Ogni caso viene annullato. Nessun collegamento alla produzione.
Auth e Storage sono predisposti con tabelle minime; il servizio HTTP pg_net non viene installato
e i job pg_cron non vengono avviati. Questi test non verificano i servizi di piattaforma o la consegna delle push.

## Ordine di pubblicazione

1. Verificare le migrazioni pendenti con `npx supabase migration list --linked`.
2. Applicare `20261123000000_atomic_saves.sql` prima di pubblicare il nuovo frontend.
   Controllare l'elenco prima di eseguire `npx supabase db push --linked`: potrebbe includere altre migrazioni.
3. Rigenerare i tipi dal database e controllare il diff di `src/data/types.ts`.
   I tipi di questo branch sono stati rigenerati dal database dopo l'applicazione della migrazione.
4. Pubblicare il frontend tramite il normale flusso GitHub/Vercel.

La migrazione aggiunge funzioni e non rimuove i vecchi accessi alle tabelle: il frontend precedente
continua a funzionare durante il passaggio. Anche un rollback del solo frontend e compatibile.
Il frontend nuovo richiede invece le nuove funzioni: una preview Vercel che punta a un database
senza questa migrazione non potra eseguire questi quattro salvataggi.
