# Dati di prova (REALI — tenere il repository privato)

- `app_data.json` — 16 partite (20/05/2026 → 28/10/2026) e 162 pagelle come le legge l'app
  legacy (`matches`, `ratings`). Squadre: `teamA` = Blu, `teamB` = Bianchi. Non contiene titoli e
  descrizioni (salvati dopo).
- `../../legacy/rosa_calcetto.json` — 22 giocatori (statistiche, ruoli, foto in base64, alias),
  pesi dell'OVR, indirizzo dello script Google attuale.
- `whatsapp/` — 4 messaggi veri della Redazione, ognuno della sua partita:

| File | Partita (`date`) | Stile |
|---|---|---|
| `2026-10-28_pagelle.txt` | 2026-10-28 (6-8) | `*Nome 6,5* testo` + `_TITOLO_ 🔋` |
| `2026-10-21_pagelle_il_ritorno.txt` | 2026-10-21 (8-2) | come sopra, titoli anche a fine frase |
| `2026-10-14_contropagelle_corsivo.txt` | 2026-10-14 (8-9) | `_NOME voto 5,5_` + titolo MAIUSCOLO |
| `2026-10-07_contropagelle_semplici.txt` | 2026-10-07 (9-10) | `NOME 6,5` / `NOME voto 5,5` |

**Risultato atteso nei messaggi di prova**: 40 pagelle su 40 abbinate al giocatore giusto,
voto letto uguale a quello in `app_data.json`, titoli corretti (es. «RISPARMIO ENERGETICO 🔋»,
«MVP 🥇», «ANTIDOPING 💉», «TROY MCLURE», «SI’, CHEF!», «IN(PS)FERNALE», «É UN BEL PRODOTTINO»).
"Gianluca" = **Cioccolata** (per esclusione la prima volta, poi ricordato come alias). I corsivi in
mezzo al testo (`_non abbiamo ruoli_`, `_amaro in bocca_`) restano nella descrizione.

- `live_feed.json` — copia di ciò che risponde lo script Google (azione `matches`) il 31/10/2026: 16 partite,
  162 pagelle **con titoli (40) e descrizioni (68)**, 77 righe di albo (3 stagioni), 3 Gazzette. Qui le date sono
  istanti in UTC (`2026-06-16T22:00:00.000Z` = 17 giugno): l'importazione le porta al giorno italiano.
  Serve ai test dello strumento di importazione (`tests/import/`).
