# Decisioni prese (e alternative scartate)

Registro delle scelte fatte con l'utente durante lo sviluppo dell'app attuale. Le alternative
**scartate** non vanno riproposte senza un motivo nuovo.

## Architettura (nuova app)
- **Supabase** come database (Postgres + Auth + Storage, regione EU). Scartati: Firebase (database a
  documenti, statistiche costose), PocketBase (server da gestire), server su misura (troppo lento).
- **React + TypeScript + Vite**, PWA con service worker. Scartato per ora Svelte.
- **Statistiche/OVR unici per giocatore**, uguali in tutte le leghe; modificabili dagli admin delle
  leghe del giocatore, con storico delle modifiche. (Alternativa "solo la lega di casa" non scelta.)
- Ruoli: admin / redazione / member. Lega pubblica per la Fase 1.
- **Due ambienti**: vecchio repository GitHub = produzione (gli amici continuano a usarlo); nuovo =
  sviluppo. Il foglio Google resta la fonte ufficiale fino al passaggio; l'importazione in Supabase
  deve essere **ripetibile** (aggiorna, non duplica: usa `legacy_id`).

## Dati e caricamento (legacy)
- La rosa arriva **sempre da GitHub** (`rosa_calcetto.json`, con parametro anti-cache). Solo senza
  rete si usa la copia nel telefono (aggiornata a ogni download) con avviso. La scritta
  "📡 Dati da rosa_calcetto.json" nell'intestazione è stata **tolta** (invadente).
- Le modifiche fatte nell'app restano sul telefono finché non si esporta la rosa su GitHub.

## Stato di forma
- **Uno solo** in tutta l'app (ultime 3 pagelle vs media di sempre, ±0,2). Scartati: tendenza su
  tutta la storia come stato; soglia ±0,3; carta speciale nera/oro "In forma" (stesso nome, regola
  diversa → confondeva).
- **ON FIRE segue "In forma"** (non le vittorie di fila: scartato). **IN CRISI** segue "In calo".
- Per IN CRISI scelti: nuvole + pioggia + fulmine (scartati ❄️ Surgelato e 💤 In letargo).

## Figurine
- Fasce su OVR (non sulla media pagelle: scartato). Nomi: Top player, Oro, Argento, Bronzo, Cacca, Marcia.
- Foto: **cerchio** con anello del colore della fascia. Scartati: sfumato (brutto), cornice
  quadrata, angoli tagliati, arco.
- ON FIRE: **anello incandescente con scintille** + bordo carta arancione + tinta calda. Scartati:
  fiamme a raggiera ("sembra un sole"), fiamme che salgono dalla foto.
- IN CRISI: **leggera**, foto a colori. Scartati: foto in bianco e nero, carta molto scura.
- Didascalia senza nome del pagellista (Peppe Rella firma solo le pagelle).
- Prima si **apre** a schermo intero, poi Condividi / Salva. Scartato il suggerimento iPhone
  "tieni premuto → Aggiungi a Foto" (inutile).

## Partite e pagelle
- Importazione WhatsApp: **solo titolo e descrizione** (mai voti, gol o risultato).
- Titoli e descrizioni: colonne dedicate; un avviso compare se il backend non li salva.
- Una Gazzetta per partita (su Drive in legacy; su Supabase Storage nella nuova app).
- Partita giocata: niente più Formazioni e Foglio tra i pulsanti; compaiono Gazzetta e Pagelle.
- Formazioni e Riepilogo: anteprima a schermo intero prima di condividere. Foglio e Confronto:
  condivisione diretta (per ora).

## Premi
- **Occasionali** (nome scelto al posto di "Fuorisede"), **automatici** (non segnati a mano):
  da 2 partite a sotto il 40%. Soglia Titolari allineata al 40% ovunque.
- Imprese Il Ritorno / Ritorno col botto / Il Debutto (debutto escluso il primo giorno registrato).

## Interfaccia
- 4 schede in basso: Rosa · Gioca · Partite · Classifiche; Impostazioni toccando il logo.
- Intestazione sottile (logo 44 px). Gioca: tolti il "5 vs 5" grande e il suggerimento (ridondanti),
  riga "Squadre asimmetriche" compatta.
- Scheda giocatore: nome nella riga della ✕; grafico pagelle massimo 10 barre; griglia pagelle a 12
  caselle (la riduzione a 9 è stata **rifiutata**); bacheca compatta e apribile.

## Importazione in Supabase (Fase 2)
- **Strumento a riga di comando**, non una pagina: `npm run import` (prova a secco, non scrive) e
  `npm run import -- --apply --admin-email=<email>`; controllo con `npm run import:verify`. Ripetibile: giocatori e
  partite si ritrovano con `legacy_id`; squadre e pagelle di ogni partita si allineano al foglio.
- **La chiave di amministrazione non sta in nessun file**: lo strumento la chiede alla CLI di Supabase (dove si è già
  collegati) e la tiene solo in memoria. Scartato: file `.env.import` con la chiave.
- **Date**: lo script Google le dà in UTC; vanno portate al giorno italiano (Europe/Rome), altrimenti ogni partita
  slitta di un giorno.
- **Id dei giocatori**: nel database si usa l'UUID contenuto nell'id attuale (`p_<uuid>`). Così l'ordine tra giocatori è
  identico a prima: da quello dipende come si scrivono i due nomi della Coppia d'oro.
- Pesi dell'OVR in `app_settings`, chiave `ovr_weights`. Stato dell'albo: "in corso" nel foglio = "aperta" nel database.
- Se nei dati c'è qualcosa che non torna (giocatore fuori rosa, pagella senza squadra, data illeggibile…) l'importazione
  vera si ferma e lo dice. Le partite tolte dal foglio si tolgono dal database solo con `--prune`.
- Differenza nota e accettata: nei **record a pari merito** l'ordine dei nomi può cambiare (nel foglio dipende da
  quando una partita è stata ri-salvata, informazione che il database non ha). Valori e persone sono gli stessi.

## Date mostrate (Fase 3)
- La vecchia app, con le date che oggi restituisce lo script Google (istanti in UTC), mostra ogni partita **un giorno prima**
  (es. 27/10 invece di 28/10). La nuova app mostra il giorno italiano corretto (vedi `romeDate` nell'importazione).
