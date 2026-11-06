# Caricamento di storico e pagelle

Lo storico numerico resta completo per preservare classifiche, forma, record e statistiche. Le descrizioni non sono incluse nel caricamento iniziale.

- `match_player_summaries` restituisce valori numerici, squadre e il flag `has_text`. La vista usa `security_invoker`, quindi mantiene le policy di accesso a lega e stagioni della tabella originale.
- `league_data_versions` contiene un token opaco per lega. I trigger lo cambiano per modifiche a partite, pagelle, Gazzette, firme e albo. Le nuove leghe ricevono subito il token.
- `useLeagueData` controlla il token al ritorno in primo piano se il controllo precedente risale ad almeno 15 secondi fa, e ogni minuto mentre l'app e' attiva. Se il token resta uguale, riutilizza lo storico in memoria. Se cambia, aggiorna lo storico senza smontare le schermate aperte.
- Le modifiche locali continuano a invalidare immediatamente le query interessate. Il gesto di aggiornamento manuale resta disponibile.
- `useMatchTexts` legge i testi di una sola partita (o di un solo giocatore in quella partita) quando richiesti: scheda partita, pagella aperta, testo condivisibile e immagine riepilogo.
- Prima di abilitare l'editor si attendono i testi, per evitare di salvarli come vuoti. Gli aggiornamenti in background conservano la bozza aperta.
- Storico e testi non vengono salvati nella cache persistente del browser. La cache in memoria e' separata per account e lega; le query di storico includono anche il permesso di accesso alle stagioni precedenti. I testi in cache sono distinti per revisione dei dati e non riusano contenuto fra account o partite diverse.
- Query inattive: storico eliminato dalla memoria dopo 30 minuti, testi dopo 10 minuti.

La migrazione `20261205000000_history_loading.sql` deve essere applicata prima di pubblicare il frontend che usa le nuove relazioni. La vecchia applicazione resta compatibile durante il rilascio.

Verifiche: `tests/history-loading.test.ts` copre la migrazione con PostgreSQL locale (PGlite), le policy, i trigger e l'unione dei testi ai numeri; `e2e/history-loading.spec.ts` controlla le richieste effettive e il mantenimento delle modifiche non salvate.
