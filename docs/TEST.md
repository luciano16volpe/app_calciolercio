# Test dell'app

- `npm test`: logica, permessi SQL su PostgreSQL in memoria e altri controlli automatici.
- `npm run build`: controllo TypeScript e compilazione.
- `npm run lint`: controlli statici sul codice.
- `npm run e2e -- entrambi`: schermate nei browser emulati iPhone, Android e 360 px. Per un'area specifica si puo aggiungere il percorso del file, per esempio `npm run e2e -- entrambi e2e/immagini.spec.ts`.

I test in `tests/domain/` verificano le regole attuali con esempi, soglie e invarianti espliciti. I confronti con la vecchia applicazione e il caricamento del suo codice sono stati rimossi. Le fixture storiche restano dati per le prove e per l'importazione, senza usare la vecchia app come risultato atteso.

Playwright usa l'app compilata, un server preview dedicato sulla porta 4173 e due worker. Non riutilizza server aperti a mano e non esegue retry automatici. I contesti dei test con più telefoni vengono chiusi dopo ogni test; i service worker reali sono bloccati per mantenere le richieste nel database simulato. In caso di errore rimangono screenshot e trace in `test-results/`. Le prove PWA simulano gli eventi: non certificano installazione e aggiornamento su un telefono fisico.

`npm run e2e` compila prima di avviare il runner: la durata della build non consuma il tempo di avvio del server. Per chiamare direttamente Playwright eseguire prima `npm run build`.

Il collaudo Premium è descritto in `docs/COLLAUDO.md`. `tests/db/premium-collaudo.test.ts` esegue anche `supabase/tests/premium.sql` e verifica il ROLLBACK. Per ripeterlo sul progetto collegato: `supabase db query --linked -f supabase/tests/premium.sql`.

Le immagini condivisibili sono provate nel browser: generazione, dimensioni, visualizzatore e salvataggio. Queste prove non confrontano i pixel e non garantiscono da sole che ogni elemento grafico sia corretto: per modifiche visive serve anche un controllo delle immagini generate. Le vecchie prove che confrontavano ogni istruzione canvas e le schermate di partita col markup storico sono state rimosse per permettere l'evoluzione grafica.

Nel menu i test controllano soprattutto i comportamenti e le voci disponibili per ruolo, senza imporre un elenco esatto delle intestazioni o misure per ogni elemento. Rimane una prova che verifica l'assenza di scorrimento orizzontale e la raggiungibilita delle voci su schermo piccolo.

La pipeline GitHub esegue installazione da lockfile, lint, `npm test` e build sulle pull request e su `main`, senza credenziali di produzione. Le prove browser e i file in `supabase/tests/` non sono eseguiti dalla pipeline; i test PGlite inclusi in `npm test` usano un ambiente simulato e non sostituiscono Supabase. Non viene avviato un progetto Supabase cloud o locale.

Le fixture comprendono dati del gruppo: non pubblicarle o copiarle fuori dal progetto senza valutarne la riservatezza.
