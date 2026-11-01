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

## Scheda partita (Fase 3.4)
- Nella scheda partita un voto **mancante** resta vuoto. Legacy mostrava "0" (il foglio dà 0 a una cella vuota); con la nuova
  base dati un voto assente è `null` e non si inventa uno 0. Con i dati attuali non cambia nulla (tutte le pagelle hanno voto).
- Le immagini delle Gazzette si aprono dal file completo (circa 0,5 MB l'una). Le miniature più leggere si possono generare
  al momento del caricamento (passo 3.7).

## Gioca (Fase 3.5)
- **"Seleziona i primi N"** sceglie i primi N **come appaiono nell'elenco** (i più forti). Legacy prendeva i primi N nell'ordine
  del file della rosa, che non si vede e non ha un significato (nella nuova base dati la rosa non ha quell'ordine).
- Il formato (5 vs 5, 6 vs 6, 7 vs 7, asimmetrico) resta ricordato sul telefono. I convocati no, come prima.
- Il sorteggio gira nel telefono e usa gli stessi calcoli di legacy: stesse proposte, stesso ordine (test su 7 vs 7 con 14 giocatori).


## Immagini da condividere (Fase 3.6)
- Le immagini (figurina, riepilogo, formazioni, foglio A4, confronto) sono disegnate come in legacy: i test registrano ogni istruzione di disegno e la confrontano con quella di legacy (identiche).
- Medaglie della figurina: legacy non le riordina (premi prima, gogna dopo) per un errore di confronto; portato **fedelmente**, senza riordino. Da chiedere all'utente se vuole il riordino.
- Il piè di pagina del riepilogo usa ✒️ (con U+FE0F) in un testo centrato, come legacy; da verificare su iPhone.
- Sbordo a 360 px: i 3 pulsanti sotto le squadre in Gioca (Condividi, Foglio, Crea partita) uscivano dallo schermo anche in legacy; ora il testo va a capo. Il controllo e2e usa la larghezza vera dello schermo.

## Modifica partite (Fase 3.7b)
- Solo l'amministratore vede il ✏️ e "Crea partita". La redazione (che per il database può cambiare solo titolo e descrizione) per ora non ha una schermata sua: da decidere in Fase 4.
- Il salvataggio aggiorna una riga per giocatore (non è un'unica operazione): se la rete cade a metà, si riprova con "Salva".
- Legacy: il pulsante + dei contatori si ferma a 20 anche per Meta (il campo ammette 50 scrivendo a mano). Portato così.
- L'avviso sui "titoli non salvati" di legacy riguardava lo script Google: non serve più.

## Importazione WhatsApp (Fase 3.7c)
- Lettura e abbinamento dei nomi: stessa logica già provata in Fase 1 (test golden). Qui solo la schermata.
- I soprannomi imparati restano sul telefono (stessa chiave di legacy) e vengono salvati anche nella lega (colonna `aliases` di `league_players`).

## Rosa e statistiche (Fase 3.7d)
- La scheda modificabile (foto, ruoli, statistiche) si apre dalla Rosa solo per l'amministratore; dalle Classifiche resta di sola lettura, come in legacy.
- Le statistiche si salvano da sole poco dopo l'ultima modifica. Nel database sono numeri interi: un valore scritto con la virgola (es. 7,5) viene arrotondato al salvataggio.
- Le foto si salvano come file nell'archivio (200 px, come legacy), con un nome nuovo a ogni cambio, così nessuno vede la foto vecchia rimasta in memoria. Il vecchio file viene tolto.
- Un giocatore nuovo parte da centrocampista con tutte le statistiche a 5. Come in legacy il nome non si modifica dopo; non esiste l'eliminazione di un giocatore.

## Gazzetta (Fase 3.7e)
- Carica, sostituisci e rimuovi la Gazzetta si fanno dalla scheda partita in modifica (come legacy), quindi per ora solo l'amministratore. Il ruolo "redazione" è già previsto dal database ma non ha ancora una schermata sua.
- Al caricamento si salvano il file completo (lato max 2000 px) e una miniatura (500 px) per striscia e archivio. Le Gazzette vecchie senza miniatura mostrano il file completo. La Gazzetta sostituita o rimossa viene cancellata dall'archivio.

## Impostazioni (Fase 3.8)
- Restano: versione e "Aggiorna app", formazioni (aggiungi/togli, salvate sul telefono come in legacy e usate dal sorteggio), forma recente (interruttore), account.
- **Tolti** perché non servono più: backup su file (i dati stanno nel database) e indirizzo del foglio Google con la guida.
- **Pesi delle statistiche: in sola lettura.** Nel database sono unici per tutte le leghe e si cambiano solo dal pannello di Supabase. In legacy ognuno li cambiava sul proprio telefono. Se vuoi poterli cambiare dall'app serve deciderlo insieme (chi può, e per tutte le leghe).
- La "versione" è la data e ora di compilazione.

## Leghe (Fase 4.1)
- La lega mostrata si sceglie in Impostazioni → Le mie leghe e si ricorda sul telefono. Se la lega scelta non si vede più (uscito, tolta) si torna alla lega pubblica.
- Chi crea una lega ne diventa amministratore (lo fa il database) e la lega nasce **privata**. Si entra con il codice d'invito, come **membro** (guarda soltanto); il ruolo si cambia poi (passo 4.2).
- Non si esce da una lega se si è l'unico amministratore. La lega pubblica non si può lasciare (si vede comunque).
- La lista dei membri con nomi/email richiede una nuova migrazione (i profili sono privati): è il passo 4.2.
- Nota: il codice d'invito è leggibile da chi vede la lega, quindi anche quello della lega pubblica; chi lo usa diventa solo membro, che nella lega pubblica non cambia nulla.

## Membri e ruoli (Fase 4.2)
- Solo l'amministratore vede la lista dei membri (nome ed email) e può cambiare ruolo o togliere qualcuno. Sono funzioni del database (`league_member_list`, `set_member_role`, `remove_member`) nel file `supabase/migrations/20261101000000_membri.sql`, da incollare nel SQL Editor di Supabase.
- Il database impedisce di lasciare la lega senza amministratori (declassare o togliere l'ultimo).
- Ci si toglie da soli con "Esci" in Le mie leghe, non dalla lista dei membri.
- Finché la migrazione non è applicata, la scheda Membri mostra come farlo, senza rompere nulla.
- I tipi in `src/data/types.ts` per le tre funzioni sono scritti a mano: dopo la migrazione si possono rigenerare.

## Questo sono io (Fase 4.3)
- Il giocatore sceglie il proprio nome nella rosa della lega che sta guardando e manda la richiesta; **la conferma è sempre dell'amministratore** di quella lega (Impostazioni → Membri → Richieste).
- Un account può essere collegato a **un solo** giocatore e un giocatore a **un solo** account. Alla conferma, le altre richieste per lo stesso giocatore o dello stesso account vengono rifiutate.
- Ci si può scollegare in qualsiasi momento (poi serve una nuova richiesta).
- Funzioni del database nel file `supabase/migrations/20261102000000_questo_sono_io.sql`; se manca, le schede mostrano come applicarla.
- Il profilo personale (partite di tutte le leghe, storico statistiche) è il passo 4.4.

## Profilo personale (Fase 4.4)
- Compare in Impostazioni, sotto "Il mio giocatore", quando si è collegati a un giocatore. Per ogni lega che si può vedere: partite, vittorie-pareggi-sconfitte, gol, assist, media voto; poi le ultime 8 partite e lo storico delle modifiche alle statistiche e ai ruoli (ultime 30).
- La **media voto** qui è la media semplice dei voti presenti, non quella delle Classifiche (che segue le regole di legacy). Da chiedere se la vuoi identica.
- Nessuna nuova migrazione: usa dati già leggibili con i permessi esistenti.

## Fase 4 — menu, leghe, collegamento, registro, collaudo
- **Registro attività**: solo amministratore supremo; 4 gruppi (accessi/account, leghe/membri/ruoli, partite/pagelle/Gazzette, giocatori/statistiche), niente letture; IP e dispositivo; conservazione **60 giorni** per righe e per IP/dispositivo (impostazioni separate, pulizia notturna con pg_cron); utenti informati nell'informativa e alla registrazione. Un errore del registro non blocca mai l'app.
- Gli accessi li segnala l'app con `log_event` (il registro interno di Supabase Auth non è agganciabile); l'importazione manda `x-audit-source: import`.
- Account cancellato: nel registro «utente cancellato», senza IP e dispositivo; giocatore e storico restano senza account.
- **Redazione**: scheda partita in «solo testo» (titoli, descrizioni, Gazzetta); l'amministratore, salvando, non riscrive i testi che non ha toccato.
- «Questo sono io» mostra solo i giocatori non ancora collegati. Storico statistiche con nome di chi ha modificato.
- Le prove con utenti finti girano nel database vero dentro transazioni che si annullano; nessun progetto di prova.
- Giocatori: modifica solo per gli admin delle sue leghe; eliminazione solo per chi è admin di **tutte** le sue leghe (decisione del 1/11). Ex amministratori non hanno più diritti sui giocatori che avevano creato.
- **Regole di gioco** (formazioni, forma recente, pesi dell'OVR): uniche per tutte le leghe, salvate nel database (`app_settings`); le vede chi è amministratore di lega (sola lettura), le cambia **solo il superadmin** (funzione `admin_set_setting`, registrata nel registro attività); nascoste ai membri nell'interfaccia (i valori restano leggibili dall'app perché l'OVR e le squadre si calcolano sul telefono). Le formazioni salvate sui singoli telefoni non valgono più (decisione del 1/11).
- **Nessuna lega pubblica**: ogni lega si vede solo su invito (link personale o codice); il database rifiuta leghe pubbliche (vincolo `leagues_solo_invito`) e chi non è in nessuna lega vede una schermata di benvenuto (decisione del 1/11). Chi non è loggato vede solo la pagina d'ingresso.
- Eliminare una lega: **ogni amministratore** può farlo (serve scriverne il nome), non solo il creatore (decisione del 1/11).
