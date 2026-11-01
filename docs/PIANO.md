# Piano di lavoro

Ogni fase finisce con: test verdi, prova su iPhone e Android (emulati), breve riepilogo all'utente.

## Fase 0 — Progetto vuoto
- [x] Vite + React + TypeScript (strict), ESLint, Vitest, Playwright, vite-plugin-pwa
- [x] `src/styles/app.css` portato da `legacy/index.html` (aspetto identico)
- [x] Supabase: client (`src/data/supabase.ts`), `.env.local` con URL e chiave pubblica,
      migrazione `supabase/migrations/20261031000000_schema.sql` applicata, tipi generati
- [x] Pubblicazione su Vercel/Cloudflare Pages dal nuovo repository (privato)

## Fase 1 — Logica pura, con test golden
Portare da legacy, un modulo alla volta, con test che confrontano i risultati con legacy sugli
stessi dati (`tests/fixtures/app_data.json`, `legacy/rosa_calcetto.json`):
- [x] ovr (calcOvr, futRating, futTier) · form (formWeight, effectiveScore, formState)
- [x] seasons (seasonOf, seasonStatus, seasonsList) · stats (seasonStats)
- [x] awards (computeSeasonAwards, matchEvents, Occasionali, albo)
- [x] pairs · records · h2h
- [x] balancing (comboMetrics, roleFitScore, roleCountPenalty, generateTeams, predGoals)
- [x] whatsapp (parseWhatsAppPagelle + abbinamento nomi) — i 4 messaggi reali: 40/40

## Fase 2 — Importazione dei dati (ripetibile)
- [x] Strumento (pagina o script) che legge l'attuale script Google (azione `matches`: partite,
      pagelle, albo, gazzette) e `rosa_calcetto.json`, e scrive in Supabase usando `legacy_id`
      (una seconda importazione aggiorna, non duplica)
- [x] Foto dei giocatori (base64 nella rosa) → Storage `photos`; Gazzette (Drive, azione `gazFile`)
      → Storage `gazzette/<lega>/<partita>.jpg`
- [x] Lega "CalcioLercio" pubblica, l'utente come admin; controllo: stessi numeri della legacy

## Fase 3 — Schermate, collegate a Supabase
Ogni passo: aspetto identico a legacy (confronto con screenshot iPhone/Android/360 px), test, riepilogo.
- [x] 3.1 Struttura (intestazione, 4 schede in basso, cache dati) · Rosa: elenco delle carte · riquadro installa su iPhone
- [x] 3.2 Scheda giocatore (sola lettura: foto, ruoli, statistiche, pagelle, bacheca, compagni e avversari)
- [x] 3.3a Classifiche: stagione, quattro numeri, schede Marcatori · Assist · Media voto · Coppie · Record
- [x] 3.3b Classifiche: Statistiche (tabella) · Confronto testa a testa · Albo d'oro
- [x] 3.4 Partite: ultima partita, elenco, scheda partita (sola lettura) con equilibrio squadre, Gazzette (striscia, archivio, visualizzatore), testo delle pagelle
- [x] 3.5 Gioca: formato, convocati, sorteggio, campo, proposte, scambi trascinando, precisione (condividi/foglio/crea partita: 3.6 e 3.7)
- [x] 3.6 Immagini canvas: figurina, riepilogo, formazioni, foglio, confronto (+ visualizzatore a schermo intero)
- [x] 3.7 Accesso admin e modifiche, a passi:
  - [x] 3.7a Accesso con email e password (Impostazioni → Account), ruolo nella lega
  - [x] 3.7b Crea partita da Gioca, risultato, voti, gol e pagelle (scheda partita modificabile), elimina partita
  - [x] 3.7c Importazione pagelle da WhatsApp
  - [x] 3.7d Rosa e statistiche (modifica statistiche e ruoli, foto, aggiungi giocatore)
  - [x] 3.7e Gazzetta (carica, sostituisci, rimuovi) e miniature
- [x] 3.8 Impostazioni (versione e aggiornamento, formazioni, forma recente, pesi in sola lettura, account)

## Fase 4 — Multi-lega e account
- [x] 4.1 Creare una lega, codice d'invito, cambio lega, uscire (Impostazioni → Le mie leghe)
- [x] 4.2 Membri della lega e ruoli (admin / redazione / member): lista con nomi, cambio ruolo, rimozione — richiede la migrazione `20261101000000_membri.sql` (da incollare in Supabase)
- [x] 4.3 "Questo sono io" (richiesta del giocatore, conferma dell'admin) — richiede la migrazione `20261102000000_questo_sono_io.sql`
- [x] 4.4 Profilo personale (Impostazioni → Il mio profilo): partite di tutte le leghe, storico delle statistiche
      (da completare nel passo 4.8: "con chi le ha cambiate e quando")

Completamento della Fase 4 (comando `/completa-fase-4`, in un'unica sessione). Parte da quello che esiste e lo adatta.
Tutte le modifiche al database sono **nuove migrazioni** applicate sempre allo stesso modo:
`npx supabase migration list --linked` → `npx supabase db push --linked` (il progetto vero è l'unico ambiente: nessun progetto di prova).
- [x] 4.0 Verifica del database: `membri.sql` mancava ed è stata applicata; storico delle migrazioni allineato (`migration repair`)
> **Stato al 1/11 notte**: Fase 4 completata e collaudata (`docs/COLLAUDO.md`). Migrazioni applicate fino a `20261108000100`. Restano le decisioni segnalate nel collaudo,
> la riga SQL dell'amministratore supremo e la prova su telefono vero; poi Fase 5 (`docs/passaggio/PIANO_PASSAGGIO.md`).
- [x] 4.5 Menu laterale e leghe — `docs/specifiche/menu-e-leghe.md`
  - [x] ☰ in alto a sinistra, pillola con la lega attiva, menu a sezioni per ruolo (Le mie leghe · Redazione · Gestione · Piattaforma · App)
  - [x] "Le mie leghe" spostata da Impostazioni al menu; crea lega (nome, visibilità, formato, giorno), codice d'invito condivisibile, entra con codice
  - [x] Lega nell'indirizzo `/l/<slug>/…`; ultima lega ricordata; guida "Aggiungi i giocatori" per la lega vuota (dalle mie altre leghe, senza doppioni)
  - [x] Nuova migrazione: `slug`, creatore (`owner_id`), proposte di admin, cessione della proprietà, controlli nel database sui ruoli,
        ingresso automatico del giocatore collegato, funzioni per l'amministratore supremo (`is_super_admin`, tutte le leghe, utenti)
  - [x] Più amministratori: solo il creatore nomina/toglie gli admin, gli altri propongono; Impostazioni della lega (rigenera codice, elimina scrivendo il nome)
- [x] 4.6 Collegamento account — `docs/specifiche/collegamento-account.md`
  - [x] Link d'invito personale (strada principale, pagina `/invito/<token>`, valido 7 giorni); "Questo sono io" resta come riserva
  - [x] Scollega (admin o utente); Unisci giocatori (doppioni); blocco su `players.user_id` (si cambia solo con le funzioni sicure)
- [x] 4.7 Registro attività — `docs/specifiche/registro-attivita.md`
  - [x] Amministratore supremo (`platform_admins`, riga da inserire a mano nello SQL Editor), tabella `audit_log` scritta dai trigger del database
  - [x] 4 gruppi (accessi/account · leghe/membri/ruoli · partite/pagelle/Gazzette · giocatori/statistiche), IP e dispositivo, conservazione 60 giorni (pg_cron)
  - [x] Schermata "🛡️ Registro attività": filtri, azioni delicate ⚠️, dettaglio, esporta CSV
- [x] 4.8 Profilo e privacy
  - [x] Storico delle statistiche con **chi** le ha cambiate e **quando**
  - [x] Informativa privacy (comprese le righe sul registro attività) in menu → Privacy e all'avviso di registrazione
  - [x] Cancellazione dell'account: il giocatore e il suo storico restano senza account collegato; nel registro compare "utente cancellato"
- [x] 4.9 Collaudo finale — `.claude/commands/collaudo-finale.md`: matrice dei permessi per ruolo, scenario completo, test esistenti verdi,
      `docs/COLLAUDO.md`, piano del passaggio in `docs/passaggio/PIANO_PASSAGGIO.md`

## Fase 5 — Passaggio
- [ ] Ultima importazione, prova con gli amici sull'indirizzo nuovo, pagina di trasferimento sul
      vecchio repository (già pronta: vedi chat), spegnimento dello script Google
