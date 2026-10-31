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
- [ ] awards (computeSeasonAwards, matchEvents, Occasionali) · pairs · records · h2h
- [ ] balancing (comboMetrics, roleFitScore, roleCountPenalty, generateTeams, predGoals)
- [ ] whatsapp (parseWhatsAppPagelle + abbinamento nomi) — i 4 messaggi reali: 40/40

## Fase 2 — Importazione dei dati (ripetibile)
- [ ] Strumento (pagina o script) che legge l'attuale script Google (azione `matches`: partite,
      pagelle, albo, gazzette) e `rosa_calcetto.json`, e scrive in Supabase usando `legacy_id`
      (una seconda importazione aggiorna, non duplica)
- [ ] Foto dei giocatori (base64 nella rosa) → Storage `photos`; Gazzette (Drive, azione `gazFile`)
      → Storage `gazzette/<lega>/<partita>.jpg`
- [ ] Lega "CalcioLercio" pubblica, l'utente come admin; controllo: stessi numeri della legacy

## Fase 3 — Schermate, collegate a Supabase
- [ ] Rosa (+ scheda giocatore) · Gioca · Partite (+ scheda partita, importazione WhatsApp,
      Gazzette) · Classifiche (8 schede) · Impostazioni
- [ ] Immagini canvas: figurina, riepilogo, formazioni, foglio, confronto (+ visualizzatore)
- [ ] Accesso admin (email) per modificare; tutti gli altri vedono senza account

## Fase 4 — Multi-lega e account
- [ ] Creare una lega, codice d'invito, ruoli (admin / redazione / member), cambio lega
- [ ] Registrazione giocatori, "questo sono io" (confermato dall'admin), profilo personale con le
      partite di tutte le leghe; storico delle statistiche
- [ ] Privacy: informativa, cancellazione account

## Fase 5 — Passaggio
- [ ] Ultima importazione, prova con gli amici sull'indirizzo nuovo, pagina di trasferimento sul
      vecchio repository (già pronta: vedi chat), spegnimento dello script Google
