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
- [ ] 3.2 Scheda giocatore (sola lettura: foto, ruoli, statistiche, pagelle, bacheca, compagni e avversari)
- [ ] 3.3 Classifiche (8 schede: Marcatori, Assist, Media voto, Statistiche, Coppie, Confronto, Albo d'oro, Record)
- [ ] 3.4 Partite: elenco e scheda partita (pagelle, equilibrio squadre) · Gazzette
- [ ] 3.5 Gioca: convocati, sorteggio, proposte, scambi a mano
- [ ] 3.6 Immagini canvas: figurina, riepilogo, formazioni, foglio, confronto (+ visualizzatore a schermo intero)
- [ ] 3.7 Accesso admin (email) e modifiche: rosa e statistiche, nuova partita, voti, importazione WhatsApp, Gazzetta
- [ ] 3.8 Impostazioni

## Fase 4 — Multi-lega e account
- [ ] Creare una lega, codice d'invito, ruoli (admin / redazione / member), cambio lega
- [ ] Registrazione giocatori, "questo sono io" (confermato dall'admin), profilo personale con le
      partite di tutte le leghe; storico delle statistiche
- [ ] Privacy: informativa, cancellazione account

## Fase 5 — Passaggio
- [ ] Ultima importazione, prova con gli amici sull'indirizzo nuovo, pagina di trasferimento sul
      vecchio repository (già pronta: vedi chat), spegnimento dello script Google
