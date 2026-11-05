# Regole di CalcioLercio

Le regole sono implementate nella versione corrente in `src/domain/` e verificate direttamente
dai test. I nomi storici indicati nel documento non richiedono confronti con la vecchia app.
Le decisioni recenti dell'utente prevalgono sulle descrizioni delle fasi iniziali.

---

## 1. Giocatori, statistiche, OVR

- 11 statistiche 0–10, ordine fisso: stamina, forza, dribling, velocità, tiro, passaggio, attacco,
  difesa, tecnica, porta, intelligenza (icone in `ICONS`).
- Ruoli: `ATT`, `MED`, `DIF` (anche più di uno). Ordine di visualizzazione ATT → MED → DIF.
- **OVR** = media pesata delle 11 statistiche con i pesi `weights` (in `rosa_calcetto.json`).
  `calcOvr(stats)`. L'OVR NON include le pagelle.
- **Valutazione della figurina** = `round(OVR × 10)` (`futRating`).
- **Nuova app:** statistiche e OVR sono **unici per giocatore, uguali in tutte le leghe**. Le può
  modificare l'amministratore di qualsiasi lega in cui il giocatore gioca; ogni modifica è registrata
  (`player_stats_history`). In futuro l'OVR potrà essere corretto dalle pagelle di tutte le leghe.

## 2. Peso dei voti e "valore di bilanciamento"
- `formWeight(n)`: con n pagelle valide, il peso della media pagelle è 0 fino a 2 pagelle, poi cresce
  linearmente fino al **25%** con **18 pagelle** o più (`FORM_MIN_RATINGS=2`, `FORM_FULL_RATINGS=18`,
  `FORM_MAX_WEIGHT=0.25`).
- `effectiveScore(p) = OVR × (1−w) + media_pagelle × w` (se l'opzione "usa la forma" è attiva,
  predefinita ON). È il valore usato per il bilanciamento (`wScore`). Mostrato come "⚖️ Peso voti".

## 3. Voti (pagelle)
- Voto valido: 1–10 a passi di 0,5 (`clampRating`, `validVote`).
- Chi ha gol / assist / autogol / rigori sbagliati / titolo / descrizione **deve avere un voto**
  (altrimenti il salvataggio si blocca con avviso).
- Campi per giocatore e partita: voto, gol, assist, autogol, meta (tiri alle stelle), rigori
  sbagliati, **titolo** (max 60), **descrizione** (max 2000, con formattazione WhatsApp `*grassetto*`
  e `_corsivo_`, mostrata come grassetto/corsivo: `waHTML`).
- **PAG** (badge): media dei voti validi del periodo comune alle schede. Colori: ≥ 6,5 verde, < 5,5 rosso, altrimenti giallo.
- **Periodo comune** di profilo, scheda aperta dalla Rosa e figurina: stagione corrente se il giocatore ha almeno cinque partite giocate, altrimenti le ultime cinque partite giocate della lega. Stato di forma e peso dei voti mantengono le rispettive formule sullo storico accessibile della lega, identiche in tutte le aperture.

## 4. MVP e peggiore di una partita
- `mvpPerf = voto + gol×0,5 + assist×0,3 − autogol×0,3 − rigori sbagliati×0,3` (`mvpPerf`).
- MVP = perf più alta; Peggiore = perf più bassa; Capocannoniere = più gol (>0); Assistman = più
  assist (>0) (`matchHighlights`). Stessa formula per "Re degli MVP" nell'albo.

## 5. Stato di forma (unico in tutta l'app)
- Media delle **ultime 2 pagelle valide** confrontata con la **media di sempre nella lega selezionata**; contano soltanto partite con risultato non future:
  ≥ +0,2 → **↗ In forma**, ≤ −0,2 → **↘ In calo**, altrimenti **→ Costante** (`FORM_DELTA=0.2`).
- Servono almeno **4 pagelle**, l'ultima deve essere tra le **5 partite giocate più recenti della lega** e **non più vecchia di un mese** da oggi
  (aggiunto a novembre 2026: dopo una pausa lunga ON FIRE / IN CRISI non valgono); altrimenti nessuno stato (`formState`).
- **🔥 ON FIRE** = In forma (`onFire`). **🌧️ IN CRISI** = In calo (`inCrisi`).
- Il risultato usa sempre lo storico della lega, anche nel profilo dove le pagelle mostrate seguono la stagione o le ultime cinque partite.
- Visibile: scheda giocatore (intestazione + "📈 Pagelle"), figurina (etichetta sotto PAG), miniatura
  (freccia nel PAG), 🔥/🌧️ accanto al nome in Rosa.

## 6. Fasce delle figurine (su OVR × 10)
| Valutazione | Carta |
|---|---|
| ≥ 74 | Top player (viola, olografica) |
| 68–73 | Oro |
| 60–67 | Argento |
| 51–59 | Bronzo |
| 41–50 | Cacca (marrone, 💩 al posto delle scintille) |
| ≤ 40 | **MARCIO VOMITO** (verde muffa, mosche 🪰) |
(Novembre 2026: prima era Bronzo 55–59, Cacca 40–54, Marcia < 40.)
(`futTier`, `FUT_TIERS`)

## 7. Sorteggio delle squadre (Gioca)
- Formati 5vs5, 6vs6, 7vs7, anche asimmetrici (es. 5vs6). Moduli per formato in `MODULES`
  (il portiere ruota: lo slot DIF più arretrato non conta per i ruoli).
- `comboMetrics(tA,tB,modA,modB)` — punteggio (più basso = meglio):
  `score = diff×1,00 + distrib×0,28 + rolePenalty×1,30 + repartiPenalty×1,10 + extremePenalty`
  - `diff` = |media A − media B| (sui valori di bilanciamento)
  - `distrib` = top1×0,30 + top2×0,25 + bottom1×0,20 + bottom2×0,15 + std×0,10 (differenze tra
    squadre del migliore, dei due migliori, del peggiore, dei due peggiori, della dispersione)
  - `rolePenalty = (1 − roleFit) × 0,15` (`roleFitScore`), `repartiPenalty` (`roleCountPenalty`:
    ATT×0,60 + MED×0,35 + DIF×0,45), `extremePenalty = |(top1−bottom1)A − (top1−bottom1)B| × 0,05`
- `generateTeams`: tutte le combinazioni, punteggio, duplicati tolti, prima quelle vicine alla
  differenza migliore (margine), poi le altre; si tengono le prime **50** proposte (navigatore ◀ ▶).
- **Squilibrio in gol**: `pred = media Blu − media Bianchi`; gol = `pred × 9` (`GOALS_PER_POINT=9`,
  misurato sulle vostre partite). Etichetta: < 0,5 → "≈ pari", altrimenti "≈ +X gol per i Blu/Bianchi".
  Colore: < 1 gol verde, < 2,5 giallo, oltre rosso. Alla creazione della partita si salvano `pred` e
  `pred_rank` (quale proposta: 1ª, 2ª… 0 = modificate a mano).
- 🎯 **Precisione bilanciamento**: ultime 10 partite con risultato (scarto medio, % entro 2 gol) e,
  per le partite con previsione salvata, % favorita vincente ed errore medio (`renderGiocaPrecision`
  e dintorni).

## 8. Stagioni e albo d'oro
- Stagioni a mesi interi (`seasonOf`): Primavera mar–mag, Estate giu–ago, Autunno set–nov,
  Inverno dic–feb (a cavallo d'anno). Chiave `AAAA-PRI|EST|AUT|INV`, etichetta «Autunno 26» (anno a due cifre; l'inverno con l'anno di inizio: «Inverno 25» = dic 2025–feb 2026).
  (Novembre 2026: prima era «Autunno 2026» e «Inverno 2026/27».)
- Stato (`seasonStatus`): **in corso** fino alla fine; **in chiusura** per 14 giorni dopo
  (`ALBO_GRACE_DAYS`, pagelle in ritardo); poi **chiusa** → l'albo viene salvato e **congelato**.
- Soglia presenze `minPres = max(2, ceil(partite × 0,4))`. Stagioni con < 3 partite assegnano solo
  le imprese (`ALBO_MIN_MATCHES=3`).
- Premi (`AWARDS`, `computeSeasonAwards`): Goleador, Assistman, Miglior media (≥ minPres),
  Re degli MVP (≥ 2 MVP), Re delle Stelle (mete), Stakanovista (presenze), Coppia d'oro (più vittorie
  insieme, min 3 partite insieme). Premi della vergogna: Peggior media e Cucchiaio di legno
  (≥ minPres), Re dei rigori sbagliati, Re degli autogol.
  Parità: media voto (più alta; più bassa per la vergogna), poi presenze.
- **🧳 Occasionali** (automatici): chi ha giocato **da 2 partite fino a sotto minPres**. Premi a
  partita: 💎 Miglior Occasionale (media, ≥ 2 pagelle), 🎯 Bomber a gettone (gol/partita),
  🍀 Portafortuna (% vittorie), ✈️ Pendolare d'oro (presenze). Parità: presenze, poi media.
- Imprese (`FEATS`): 🎩 Tripletta (3+ gol), 🖐️ Manita (5+), 🧠 Regista (3+ assist), 🌟 Fuoriclasse
  (voto ≥ 8), 🧱 Imbattibile (5 di fila senza sconfitte), 🏠 Il Ritorno (dopo ≥ 4 partite di assenza
  del gruppo), 🎆 Ritorno col botto (al ritorno vince o segna ≥ 2), 🎟️ Il Debutto (prima partita;
  esclusa la primissima giornata registrata) — `matchEvents`.
- Categorie aggiunte dopo la chiusura di una stagione (`ALBO_NEW_KEYS`) si aggiungono **una volta**
  alle stagioni già chiuse, senza toccare il resto.

## 9. Classifiche
- Selettore stagione (default la più recente) + "♾️ Sempre"; schede: Marcatori, Assist, Media voto
  (sotto: classifica a parte degli Occasionali), Statistiche (filtri Tutti / Titolari ≥ 40% /
  Occasionali).
- Nel **menu laterale** (sezione Giocatori), ognuno con la propria scelta della stagione: Confronto testa a
  testa (`headToHead`, `compareRows`), Coppie (≥ 3 partite insieme; migliori e peggiori), Albo d'oro, Record.
- Una sola fonte statistica: `seasonStats(scope)` (scope = chiave stagione o 'all').

## 10. Scheda giocatore
- Riga del titolo: nome + 🔥/🌧️ (nelle Classifiche anche i ruoli).
- Fascia: foto | ruoli | miniatura figurina (stessa altezza). Statistiche (12 caselle: 11 + Peso voti).
- 📈 Pagelle: stato di forma; 12 caselle; grafico delle **ultime 10** partite (`PG_CHART_MAX`),
  barre **toccabili** (riquadro con data, voto, «titolo», inizio descrizione); riga
  "📝 Ultima pagella: «…» · data ›" → finestra "Le pagelle di X" (tutte, più recenti prima; quelle
  scritte in evidenza; firma della Redazione in fondo).
- 🏆 Bacheca **apribile** (chiusa = riga riassuntiva; aperta = vinti raggruppati ×N con stagione
  per intero «Estate 26» (niente più sigle), riga "⏳ In lizza" con emoji, imprese in testo). Resta aperta tra giocatori.
- 🤝 Compagni e avversari (compagno d'oro / maledetto, bestia nera, vittima preferita) + ⚔️ Confronta.

## 11. Partite
- Pulsanti di condivisione: **non giocata** → Formazioni · Riepilogo · Foglio; **giocata** →
  Riepilogo + 📰 Gazzetta (se c'è) + 📜 Pagelle (se c'è almeno un titolo/descrizione).
- Elenco: segnalini 📰 (Gazzetta) e ✍️ / ✍️ 4/10 (descrizioni presenti / parziali).
- ⚖️ Equilibrio squadre nella scheda partita: previsione alla creazione, ricalcolo "con i valori di
  oggi", confronto col risultato, confronto delle 11 statistiche.
- 📜 Pagelle: testo unico in formato WhatsApp (`pagelleText`).
- 📰 Gazzetta: **una per partita**, compressa nel telefono (lato max 2000 px, JPEG 0,86); nuova
  Gazzetta = la vecchia va nel cestino. Striscia "Le Gazzette" in Partite + archivio per stagione.

## 12. Importazione pagelle da WhatsApp (`parseWhatsAppPagelle`, `waAnalyze`, `waApply`)
- Assegna **solo titolo e descrizione**. Voti, gol e risultato **non** vengono toccati.
- Stili riconosciuti: `*Nome 6,5* testo…` + ultima riga `_TITOLO_ 🔋` (anche a fine frase o senza
  trattini); `_NOME voto 5,5_` / `NOME 6,5` / `NOME voto 5,5` + righe + ultima riga in MAIUSCOLO;
  righe squadra `*BLU 8*` / `⚪ *BIANCHI 2*` (separano solo le squadre).
- Titolo = ultima riga (o fine dell'ultima riga) quasi tutta maiuscola, ≤ 60 caratteri, ≤ 9 parole,
  con la sua emoji. I corsivi in mezzo al testo restano nella descrizione.
- Una riga "Nome voto" è un giocatore solo se il nome corrisponde a chi ha giocato, **oppure** è in
  grassetto/corsivo, **oppure** tutta maiuscola ("Altri 3 gol per lui" non lo è).
- Abbinamento nomi: alias ricordato (100) > nome intero (90) > primo nome (70) > una parola (60) >
  inizio del nome (40). Un solo blocco e un solo giocatore rimasti → abbinati "per esclusione".
  Gli abbinamenti fatti a mano/per esclusione vengono **ricordati** (alias).
- Test: i 4 messaggi in `tests/fixtures/whatsapp/` → **40 pagelle su 40** abbinate, voti uguali a
  quelli registrati, titoli corretti (vedi `tests/fixtures/README.md`).

## 13. Figurina (canvas) — aspetto attuale, scelto con l'utente
- Foto nel **cerchio** con anello metallico del colore della fascia; senza foto: iniziali nello
  stesso cerchio con lo stesso anello.
- **🔥 ON FIRE**: anello arroventato (giallo→arancio→rosso) con bagliore caldo e scintille che salgono;
  bordo di tutta la carta arancione luminoso, tinta calda, fiamme ai lati e in fondo, fascia
  diagonale "ON FIRE".
- **🌧️ IN CRISI**: foto **a colori** con luce leggermente fredda e pioggia; anello grigio temporale
  con nuvoletta e fulmine; carta spenta ma leggibile (desaturazione 0,55, velo in alto 0,28),
  bordo grigio-blu, nuvole e fulmine attorno, fascia "IN CRISI".
- Didascalia: "CalcioLercio · figurina ufficiale" (+ versione). La firma «Redazione <nome>» compare **solo** sulle pagelle ed è di chi le ha scritte (non più un nome fisso).
- Si apre a schermo intero prima di condividere / salvare (`openFutCard`, `openImageViewer`).

## 14. Ruoli nella nuova app (multi-lega)
- **admin** (gestisce la lega), **redazione** (solo titoli/descrizioni pagelle + Gazzetta),
  **member** (vede). Iscrizione con codice d'invito. Lega "pubblica" = visibile senza account
  (serve nella Fase 1 perché gli amici vedano tutto come oggi).

## Profilo: periodo e lega
- Il profilo mostra i dati della lega selezionata. Le 11 statistiche, i ruoli e l'OVR del giocatore restano comuni alle leghe; il peso dei voti e calcolato sulla lega selezionata.
- Nella scheda del profilo pagelle, media, forma e vittorie considerano la stagione in corso quando il giocatore ha almeno 5 partite con risultato; altrimenti le sue ultime 5 partite con risultato della lega, anche di una stagione precedente. Il periodo e indicato nella scheda e nella finestra delle pagelle.
- Nel profilo le ultime partite sono al massimo 10 della lega selezionata, ordinate dalla piu recente. Il riepilogo complessivo per tutte le leghe e stato rimosso.
- La bacheca e i calcoli delle altre schermate mantengono le regole precedenti.
