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
- Didascalia senza nome del pagellista. (Novembre 2026: la firma delle pagelle non è più «Redazione Avv. Peppe Rella» fissa, ma «Redazione <nome di chi ha scritto le pagelle>»; senza autore noto, nessuna firma.)
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
- Restano: versione e «Verifica e installa aggiornamenti», formazioni (aggiungi/togli, salvate sul telefono come in legacy e usate dal sorteggio), forma recente (interruttore), account.
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


## Panchina, ora e luogo, leghe, notifiche (novembre 2026)
- **Aggiornamento:** la Panchina è separata per lega; gli amministratori recuperano solo i giocatori rimossi dalla propria lega. I vecchi rimossi sono ricostruiti dalle partite storiche: se non esiste alcuna traccia, non si può stabilire la lega. I trasferimenti e gli inviti tra leghe saranno affrontati separatamente.
- **Niente archiviazione dei giocatori.** Un giocatore si toglie da una **lega**: esce dalla Rosa, ma partite, pagelle e statistiche restano nella storia di quella lega (nelle classifiche e nelle partite vecchie compare ancora). Senza altre leghe finisce in **Panchina**.
- **Panchina:** la vede ogni amministratore di lega e può portare un giocatore nella sua lega; non si «ruba» chi gioca già in un'altra lega. Se il giocatore ha un account collegato, uscendo dalla lega la persona non vede più quella lega (il collegamento giocatore-account resta); rientrando in una lega riottiene l'accesso. Un giocatore collegato a un amministratore della lega non si toglie finché non si toglie il ruolo.
- **Cancellare un giocatore per sempre:** solo l'amministratore supremo, solo dalla Panchina e solo se non ha mai giocato. Chi ha storia resta in Panchina.
- **Giocatore collegato:** cambia la **sua foto** e il **suo nome** (se libero nelle sue leghe: stesso giocatore, cronologia intatta; il vecchio nome resta come «altro nome» per le vecchie pagelle da WhatsApp). Non può scollegarsi: collegare e scollegare lo decide l'amministratore.
- **Leghe:** non esistono leghe pubbliche; per ora le leghe le crea **solo l'amministratore supremo** (regola del database, allargabile più avanti).
- **Gioca:** la scheda c'è solo per gli amministratori della lega. **Pagina iniziale:** Classifiche (Rosa se la lega è vuota).
- **Ora e luogo della partita:** obbligatori per le partite nuove, modificabili dall'amministratore; si propongono quelli dell'ultima partita che li ha.
- **Notifiche:** solo push (web push). Promemoria alle 7 (ora italiana) del giorno della partita, solo ai giocatori in squadra, con ora, luogo e colore della squadra. Poi: risultato inserito, pagelle pronte (quando tutte le pagelle con voto hanno testo), Gazzetta caricata: solo a chi gioca quella partita, una volta sola per persona e partita, mai per le importazioni. NON per «nuova partita creata». Ognuno ha un interruttore per tipo. Su iPhone funzionano solo con l'app installata nella schermata Home.
- **Ricaricare i dati:** tirando la pagina verso il basso (telefono) o con F5 (computer); niente pulsante in alto.

- **Intestazione (novembre 2026):** a sinistra la faccia del proprio giocatore con OVR e stato di forma (toccandola si apre il menu, con un piccolo ☰ sul bordo); al centro CALCIO LERCIO in Bebas Neue (incluso nell'app); a destra il logo con la lega sotto. Senza giocatore collegato resta il pulsante ☰. Anteprime in `docs/specifiche/img/header_alternative_*.png` (scelto il disegno 2).

- **Pagelle da scrivere (novembre 2026):** una partita con risultato è «senza pagelle» se **meno della metà** dei giocatori ha titolo o descrizione (non basta che ne manchino un paio). Si può «saltare» (una per una o a gruppi: più vecchie di 7/30 giorni, tutte) e rimettere. Lo fanno amministratore e redazione. Le notifiche «pagelle pronte» restano a «tutte le pagelle con voto hanno testo».
- **Firma delle pagelle:** «Redazione <nome>» è di chi ha scritto per primo titolo o descrizione della partita (nome del profilo, o parte prima della @). Le partite vecchie senza autore noto non hanno firma; niente impostazione a mano.
- **Colori e limiti (novembre 2026):** fasce della figurina Top ≥74 · Oro 68–73 · Argento 60–67 · Bronzo 51–59 · Cacca 41–50 · MARCIO VOMITO ≤40. Il rosso dei riquadri del voto nella scheda partita è sotto 5,5 (uguale al badge PAG: verde ≥6,5, giallo 5,5–6,4, rosso <5,5). Lo stato di forma (🔥/🌧️) confronta le **ultime 2 pagelle** (non più 3) con la media di sempre, margine ±0,2, almeno 4 pagelle e una nelle ultime 5 partite.
- **Stagioni e footer (novembre 2026):** la stagione si scrive sempre «Estate 26», «Autunno 25», «Primavera 25», «Inverno 25» (anno a due cifre; l'inverno con l'anno di inizio), ovunque e senza sigle (non più «Est 26»). (Il footer con le scritte in Bebas Neue è stato sostituito, lo stesso mese, da quello a sole icone: vedi sotto.)
- **Il mio profilo = pagina iniziale (novembre 2026):** una schermata vera (non più un pannello), aperta all'avvio, quando si sceglie una lega, toccando il titolo o il logo e dopo un invito. Una lega ancora vuota si apre sulla Rosa. Dall'alto: le mie leghe (quella in uso evidenziata, tocco per cambiare) · scheda del mio giocatore · prossima partita in cui gioco (se c'è) · la mia ultima partita (stesso riquadro di Partite) · il mio profilo (riepilogo) · il mio giocatore (collegamento, foto e nome) · uscire da una lega.
- **Ultima partita con effetti:** se nell'ultima partita (della lega, in Partite; mia, nel profilo) ho giocato io: vinta = coriandoli che esplodono sopra; persa = pioggia sullo sfondo; pareggio o non c'ero = niente. Gli effetti partono quando si apre la pagina, non bloccano i tocchi e si fermano con «meno animazioni».
- **Footer a sole icone:** da sinistra Il mio profilo (la mia foto o l'iniziale in un cerchio; senza giocatore collegato, una sagoma) · Classifiche · Partite · Gioca (solo amministratori) · Rosa. Il nome di ogni scheda resta come etichetta per i lettori di schermo e per il tocco lungo.
- **Intestazione (novembre 2026):** a sinistra il pulsante ☰ e il logo con il nome della lega sotto; poi CALCIO LERCIO. Niente più faccia/OVR/forma in alto (la faccia sta nel footer). Toccando logo o titolo si torna al profilo. «Il mio profilo» non c'è più nel menu ☰ (era un doppione del footer).
- **Intestazione, versione finale (novembre 2026):** a sinistra il logo e, accanto, il pulsante ☰; al centro CALCIO LERCIO; a destra il nome della lega (tocco = menu per cambiare lega). Sostituisce la versione con la lega sotto il logo.
- **Coriandoli sullo sfondo:** nell'ultima partita vinta i coriandoli cadono in continuazione sullo sfondo del riquadro (dietro al contenuto, dentro il riquadro), come la pioggia della sconfitta. Prima esplodevano una volta sola a tutto schermo.
- **Intestazione su una riga (novembre 2026):** ☰, CALCIO LERCIO (esattamente al centro) e nome della lega stanno sulla stessa riga.
- **Classifiche senza il riquadro dei totali** (Partite, Gol totali, Gol/partita, Miglior media): tolto dalla schermata; il calcolo resta testato.
- **ON FIRE / IN CRISI scadono dopo un mese:** se l'ultima pagella del giocatore ha più di un mese, nessuno stato di forma (si somma alla regola delle 5 partite recenti).
- **Figurina senza logo** sotto il ruolo del giocatore.

## Salvataggi atomici
- Partita e squadre, nuovo giocatore e appartenenza alla lega, pagelle e intestazione, testi della redazione: ogni comando usa una sola transazione PostgreSQL tramite RPC SECURITY INVOKER, mantenendo RLS e trigger.
- Sostituisce la precedente scelta di aggiornare separatamente ogni giocatore e salvare il risultato in un secondo momento: un errore annulla il comando intero.
- I testi non toccati dall'amministratore e l'intestazione non modificata vengono conservati. Gli upload Storage restano separati.
- Test locali con tutte le migrazioni in PostgreSQL in memoria (PGlite), compresi errori intermedi, audit e permessi. Dettagli e ordine di pubblicazione in `docs/SALVATAGGI_ATOMICI.md`.

## Profilo per lega e periodo
- Nel profilo personale, pagelle, media, forma e vittorie si riferiscono alla stagione attuale della lega selezionata, oppure alle ultime 5 partite con risultato del giocatore se nella stagione ne ha meno di 5. Anche il dettaglio pagelle aperto dal profilo usa lo stesso periodo.
- Le ultime partite nel profilo sono al massimo 10 della lega corrente. Rimosso il riquadro complessivo per tutte le leghe. Le statistiche base e l'OVR del giocatore restano comuni; il peso dei voti resta calcolato sulla lega selezionata.

## Funzioni extra nel menu laterale (novembre 2026)
- Confronto, Coppie, Albo d'oro e Record non sono classifiche: stanno nel menu laterale (sezione Giocatori), non più nelle Classifiche. Il contenuto e i calcoli sono identici; ogni pannello ha la sua scelta della stagione (parte dalla più recente).
- Toccando un giocatore o una partita dentro un pannello, il pannello si chiude e si apre la scheda.

## Invito libero alla lega (novembre 2026)
- In «Inviti giocatori», in alto, **➕ Invita una persona**: l'amministratore scrive un'email e ottiene un **link personale** (`/unisciti/<codice>`) da girare su WhatsApp o sui social. L'elenco dei giocatori resta com'era sotto.
- Il link vale per **una persona sola** e **7 giorni**; un nuovo link per la stessa email annulla il vecchio. L'email è solo un'etichetta: **non viene inviata nessuna email** (TODO: invio automatico in futuro).
- Chi lo apre (con o senza app) si registra o accede, **entra nella lega come membro** e, se non ha ancora un giocatore, sceglie: **🙋 Sono già in Rosa** (parte la richiesta «Questo sono io», conferma l'amministratore) oppure **🆕 Sono nuovo** (si crea il giocatore: nome, ruoli e statistiche scelte da lui; va **subito in Rosa**, l'amministratore le aggiusta dopo). Chi ha già un giocatore entra con quello, senza crearne un altro.
- Nome già usato nella lega (o come «altro nome») = rifiutato. Le funzioni sono nel database (`supabase/migrations/20261124000000_invito_per_email.sql`), provate in `tests/db/invito-per-email.test.ts`.

## Rosa, scheda e figurina: periodo breve (novembre 2026)
- Su richiesta di Luciano, **Rosa, scheda giocatore e figurina usano lo stesso periodo del profilo**: stagione in corso se il giocatore ha almeno 5 presenze con risultato, altrimenti le sue ultime 5 partite giocate. Vale per la media pagelle (e il suo colore) e per i numeri della figurina; è una differenza voluta rispetto a `legacy`, che usava tutto lo storico.
- Da non cambiare senza chiedere. Il calcolo è in `profileSeasonData` (`src/domain/profile.ts`) e viene messo in cache per dati/giocatore/giorno, così Rosa, scheda e figurina non lo rifanno a ogni schermata.

## Admin senza Premium (novembre 2026)
- Un amministratore con Premium scaduto **resta amministratore** e gestisce la lega al minimo. Concordato con Luciano:
  - **Può (senza Premium):** partite e pagelle, sorteggio squadre (Gioca), gestione della Rosa (aggiungere/modificare giocatori), inviti, richieste «sono io» e membri/ruoli.
  - **Solo con Premium:** impostazioni della lega (nome, visibilità, regole) e sua eliminazione, eliminazione dei giocatori, pubblicazione delle Gazzette (la redazione le pubblica sempre), creare nuove leghe, storico e funzioni Premium. Il super amministratore non ha limiti.
- Nel database: `has_league_role`/`is_any_admin` non guardano più il Premium; `is_premium_league_admin` e `can_write_gazzetta` proteggono le parti riservate (migrazione `20261202000000_admin_senza_premium.sql`, test in `tests/db/account-premium.test.ts`). In app: `useRole` → `isAdmin` (base) e `isPremiumAdmin` (avanzate).
- Le immagini delle Gazzette in Storage richiedono Premium anche in lettura (`20261201000000_gazzette_storage_premium.sql`).
