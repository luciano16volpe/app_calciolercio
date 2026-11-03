# Caricamento dei dati: primo passo

La cache separa identita della lega, rosa, storico, giocatori usciti e regole comuni. Gli aggiornamenti delle regole ricaricano solo le regole; quelli della partita ricaricano lo storico; le modifiche ai giocatori nella rosa ricaricano la rosa. Altre operazioni conservano l'invalidazione completa per sicurezza. Le Gazzette vengono filtrate sul server per gli id delle partite della lega, a gruppi; le altre leghe non sono scaricate.

Le query sono isolate per account e lega. La combinazione continua a usare l'intero storico, inclusi i giocatori usciti, per non cambiare classifiche, profili, forma, pagelle da scrivere e sorteggio. Le righe sono lette a pagine dal server, ma **tutte** le pagine sono ancora caricate all'avvio: non e una paginazione su richiesta. Anche il dettaglio della partita e ancora contenuto nello storico. Questa modifica riduce riletture e dati di altre leghe; non completa la separazione fra caricamento iniziale e storico.

Misure del 3 novembre 2026: il database conteneva 16 partite, 164 righe squadra/pagella, 3 Gazzette e 39.327 byte complessivi di testi. Sul computer di sviluppo, con fixture di 22 giocatori, 16 partite e 162 pagelle, 300 ripetizioni del calcolo statistiche e classifica per media hanno richiesto mediana 0,449 ms e 95 percentile 0,640 ms dopo 50 ripetizioni di riscaldamento. Non sono misure su telefono, di rete o di rendering. Con questi volumi non e stata introdotta un'aggregazione SQL.

Per caricare lo storico davvero su richiesta serve prima definire risultati completi per profilo, forma e classifiche senza presentare dati parziali, poi introdurre pagine stabili per l'elenco e dettagli per partita e giocatore; verificare parita con legacy, cambi concorrenti, permessi RLS, cache e invalidazioni.
