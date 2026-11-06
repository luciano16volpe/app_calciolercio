# Ripresa dopo lo spegnimento — 5 novembre 2026

## Ultimo stato: notifiche pubblicate su richiesta dell'utente

Rilascio completato il 5 novembre 2026. Commit `ad13371e87c42d562e423e8c197dd8109705672e` su main e origin/main; pipeline GitHub verifiche superata. Servizio Edge push aggiornato PRIMA della migrazione `20261204000000`; frontend Vercel `calciolercio-cmcp3odgh-calcio-lercio.vercel.app` READY, produzione https://calciolercio.vercel.app .

Migrazione via HTTPS con storico e verifica transazionale che tutte le preferenze preesistenti fossero identiche. Collaudo reale `supabase/tests/notifiche_premium.sql` superato con ROLLBACK; stesso SQL verificato in PGlite da `tests/db/push-collaudo.test.ts`. Zero account e leghe temporanei al controllo finale. Cron push-reminders e push-events attivi ogni minuto. Tipi rigenerati, build e lint passati, pipeline finale superata. Conservare l'annotazione nullable di set_push_reminder.p_minutes nel file generato.

Controllo pubblico iPhone 14/Pixel 7: accesso HTTP 200 senza errori JavaScript o scorrimento orizzontale, bundle con nuovi controlli notifiche, manifest e service worker presenti. Rimane solo la prova di ricezione su un telefono fisico; nessun invio reale effettuato dal collaudo. I paragrafi seguenti sono lo storico e non indicano lavoro ancora da pubblicare.

## Nuovo lavoro locale dopo il rilascio: notifiche Standard/Premium

L'utente ha approvato le notifiche di base per tutti e la personalizzazione Premium. Implementazione completata in locale, NON pubblicata e NON committata: tipi e anticipo (7 del giorno oppure 1/2/3/24 ore prima), interruttore gratuito per account, preferenze disattivate preservate, avvisi raggruppati su variazioni/convocazione (anche ai sostituiti), filtro appartenenza/Premium per Gazzette.

Migrazione nuova: `20261204000000_notifiche_standard_premium.sql`. Specifica e ordine del futuro rilascio in `docs/specifiche/notifiche-standard-premium.md`: Edge aggiornata prima del database, poi tipi e frontend. Il rilascio precedente 145dd2a resta in produzione.

Verifiche completate: 218 test passati in 29 file; build e lint passati; 31 browser passati e 5 skip intenzionali (report notifiche-premium-browser.json). Separato il vecchio test del tema in due scenari per eliminare il timeout nell'apertura di sessioni consecutive. Non ripetere le verifiche senza nuove modifiche. La ricezione push fisica resta manuale. Nessuna notifica reale inviata e nessuna migrazione nuova applicata.

## Rilascio completato su autorizzazione dell'utente

Il 5 novembre l'utente ha richiesto migrazione e pubblicazione. Completate entrambe:

- Migrazione `20261203000000` applicata al progetto Supabase `ivrwqpuikbnvnxgvgegd`, registrata nello storico nella stessa transazione via HTTPS (connessione PostgreSQL diretta in timeout).
- Nuovo collaudo reale `supabase/tests/programma_partita.sql` e collaudo Premium superati con ROLLBACK; verifica finale: zero account e leghe temporanei.
- Tipi rigenerati dallo schema reale, build e lint nuovamente superati.
- Commit `145dd2aba1fe973709dc7cae8fc0b966782c755f` su main e origin/main allineati. Pipeline GitHub verifiche: success.
- Deployment Vercel `dpl_9JchvynTk44SVP8CEpyTkDZhTyu2`, Ready, alias produzione https://calciolercio.vercel.app . Bundle pubblico verificato: nuovo editor e RPC presenti.
- Controllo pubblico in sola lettura iPhone 14 e Pixel 7: HTTP 200, accesso visibile, nessun errore JavaScript, nessuno scorrimento orizzontale; manifest e service worker HTTP 200. Non eseguite modifiche a partite reali.

Nessun lavoro applicativo pendente per questo rilascio. Restano solo i controlli manuali su telefoni fisici. Gli unici file non tracciati sono questo promemoria e test-checkpoints, conservati localmente. I paragrafi sotto sono lo storico del checkpoint e vengono superati da questo aggiornamento.

## Aggiornamento dopo la ripresa: verifiche concluse

La sospensione è terminata. La suite è stata rilanciata dall'inizio e completata: **469 passati, 5 skip intenzionali, zero errori e zero retry**, con i due worker ordinari, in 25,5 minuti. I cinque percorsi iPhone che avevano avuto timeout nella prova aggiuntiva a quattro worker sono stati ripetuti due volte ciascuno: **10 passati, zero errori** (1,9 minuti). Non occorre ripetere queste verifiche senza nuove modifiche.

Report conservati in `test-checkpoints/2026-11-05/collaudo-finale.json` e `collaudo-stabilita.json`. `docs/COLLAUDO.md` ora contiene gli esiti effettivi. `git diff --check` superato. Restano validi unitari/DB (202), lint, build e collaudo Premium con ROLLBACK già completati.

Tutte le modifiche restano locali e non committate; nuova migrazione NON applicata, nessun deploy. Restano le prove manuali su telefono fisico e il rilascio quando richiesto. Le sezioni seguenti conservano il checkpoint originale dello spegnimento e i passi allora ancora pendenti: sono superati da questo aggiornamento.

Richiesta: salvare lo stato e sospendere per spegnimento del PC. Non pubblicare, non applicare migrazioni, non avviare altri test fino alla ripresa.

## Stato del lavoro

Branch main, base fb7ecda. Modifiche locali NON committate e NON pubblicate. Conservare tutti i file modificati e nuovi. Nessun reset/clean.

- Collaudo Premium riscritto in docs/COLLAUDO.md e supabase/tests/premium.sql: prova, richieste lega, modalità funzioni, storico limitato, admin Standard, redazione, Storage.
- Rimosse le comparazioni eseguibili con la vecchia app (tests/golden); sostituite con aspettative indipendenti in tests/domain.
- Stabilità Playwright: preview compilata prima dell'avvio server, default 2 worker, fixture chiude i contesti manuali, Storage simulato per evitare richieste reali. Foto: date relative per evitare scadenze al cambio giorno.
- Nuovo editor delle partite non giocate: giorno, ora, luogo, note, scambi squadre e sostituti dalla Rosa della lega. Pulsante admin nella scheda partita: Modifica programma e squadre.
- RPC e migrazione locale supabase/migrations/20261203000000_modifica_programma_partita.sql: permessi, blocco partite già giocate, transazione atomica, controllo concorrenza, visibilità futura per Standard. NON applicata in ambiente.
- Snapshot iniziale dell'editor congelato con useState(originalMatch): un aggiornamento in background non deve aggirare il conflitto. Verifica SQL ROW_COUNT dopo UPDATE.

## Risultati già verificati

- Unitari/DB: 28 file, 202 test passati.
- Lint: passato.
- Build: passata.
- Browser mirati: pagelle-foto + programma-partita, 27 passati sui tre dispositivi. Include regressione di aggiornamento concorrente.
- Collaudo Premium SQL sull'ambiente Supabase collegato: ultima esecuzione passata con ROLLBACK, senza pubblicare la nuova migrazione. Precedente verifica residui: zero account e leghe di collaudo.

## Suite completa interrotta / non certificata

Ultimo comando:

```powershell
$env:PLAYWRIGHT_JSON_OUTPUT_NAME='test-results/collaudo-finale.json'
node scripts/e2e.mjs entrambi --workers=4 --reporter=line,json --max-failures=8 2>&1 | Tee-Object -FilePath collaudo-e2e.log
```

474 casi previsti. Ultimo log osservato: avvio del caso 310/474, progetto android; nessun errore osservato fino a quel punto. Il numero indica casi avviati, NON certifica 310 successi. Nessun report JSON finale disponibile al salvataggio. Sessione nativa 30740 non più recuperabile: NON cercare di riprenderla dopo il riavvio. Il processo non è stato terminato esplicitamente; lo spegnimento lo fermerà.

Log salvato anche in test-checkpoints/2026-11-05/collaudo-e2e-interrotto.log. Patch dei file già tracciati e git-status nella stessa cartella. I file nuovi sono presenti nel workspace ma non inclusi nella patch; questa cartella non è un backup completo del repository. Gli artefatti temporanei Playwright sono in test-results e saranno sostituiti dal prossimo run.

## Prossimi passi

1. Leggere questo file e git status; mantenere tutte le modifiche. Controllare eventuali report finali/log prodotti dopo questo salvataggio prima di dichiarare la suite interrotta.
2. Dopo il riavvio rilanciare la suite completa dall'inizio (Playwright non riprende dal caso 310). Usare il comando qui sopra; se dist manca o il codice è cambiato, eseguire prima npm.cmd run build. Comandi lunghi con yield_time_ms=10000, polling write_stdin >=30000.
3. Verificare il report JSON finale: expected/unexpected/flaky/skipped. Attesi 5 skip intenzionali relativi a PWA iPhone e notifiche. Non dichiarare passata la suite senza esito completo.
4. Se utile per confermare i vecchi timeout, una sola ripetizione mirata con 2 worker, repeat-each=2, file pagelle-foto/profilo/regole/ruoli/scenario e filtro Foto:|Footer:|superadmin cambia|creatore nomina|Scenario completo. Output separato per conservare il report completo.
5. Aggiornare data ed Esito dell'ultima esecuzione in docs/COLLAUDO.md: contiene ancora il segnaposto verifiche in corso. Indicare solo risultati realmente completati.
6. git diff --check, verifica finale. Restano manuali le prove fisiche PWA/push. Nessun commit/push/deploy richiesto per questa sospensione.

Supabase CLI disponibile in $env:LOCALAPPDATA/npm-cache/_npx/aa8e5c70f9d8d161/node_modules/@supabase/cli-windows-x64/bin/supabase.exe. Per rieseguire il collaudo reversibile: db query --linked -f supabase/tests/premium.sql --yes. Non occorre ripeterlo senza nuove modifiche.
