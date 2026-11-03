# Test dell'app

- `npm test`: logica, permessi SQL su PostgreSQL in memoria e altri controlli automatici.
- `npm run build`: controllo TypeScript e compilazione.
- `npm run lint`: controlli statici sul codice.
- `npm run e2e -- entrambi`: schermate nei browser emulati iPhone, Android e 360 px. Per un'area specifica si puo aggiungere il percorso del file, per esempio `npm run e2e -- entrambi e2e/immagini.spec.ts`.

Alcuni test in `tests/golden/` confrontano ancora formule e casi di dominio con la vecchia app: servono a proteggere i risultati finche quelle regole restano valide. Non sono una richiesta di mantenere la vecchia grafica. Quando cambia una regola, aggiornare i test in base alla decisione attuale.

Le immagini condivisibili sono provate nel browser: generazione, dimensioni, visualizzatore e salvataggio. Queste prove non confrontano i pixel e non garantiscono da sole che ogni elemento grafico sia corretto: per modifiche visive serve anche un controllo delle immagini generate. Le vecchie prove che confrontavano ogni istruzione canvas e le schermate di partita col markup storico sono state rimosse per permettere l'evoluzione grafica.

Nel menu i test controllano soprattutto i comportamenti e le voci disponibili per ruolo, senza imporre un elenco esatto delle intestazioni o misure per ogni elemento. Rimane una prova che verifica l'assenza di scorrimento orizzontale e la raggiungibilita delle voci su schermo piccolo.

La pipeline GitHub esegue installazione da lockfile, lint, `npm test` e build sulle pull request e su `main`, senza credenziali di produzione. Le prove browser e i file in `supabase/tests/` non sono eseguiti dalla pipeline; i test PGlite inclusi in `npm test` usano un ambiente simulato e non sostituiscono Supabase. Non viene avviato un progetto Supabase cloud o locale.

Le fixture comprendono dati del gruppo: non pubblicarle o copiarle fuori dal progetto senza valutarne la riservatezza.
