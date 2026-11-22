# Prossimi sviluppi di CalcioLercio

Questo documento è la checklist dei prossimi rilasci. Si affronta **un passo alla volta**: si completa, si verifica e si rilascia il passo corrente prima di iniziare il successivo. I numeri seguono l'ordine scelto per il prodotto.

## Stato di partenza

- Il voto dei partecipanti esiste già: l'admin lo apre per una partita, chi ha giocato può votare gli altri, la finestra dura 24 ore e le medie compaiono alla chiusura.
- La creazione delle squadre e i relativi valori di equilibrio esistono già nell'app, ma la scelta delle formazioni non è ancora un sondaggio della lega.
- Le notifiche push e lo stato Premium esistono già. Le nuove regole dovranno usare gli stessi canali e verificare i permessi anche nel database.

## Checklist dei rilasci

### 1. Voto ai giocatori riservato ai Premium

- [ ] Rendere il pulsante **⭐ VOTA** visibile anche agli utenti non Premium, con indicazione chiara che il voto richiede Premium.
- [ ] Permettere l'invio e la modifica dei voti solo a un partecipante della partita con Premium attivo. L'admin può votare alle stesse condizioni se ha giocato.
- [ ] Applicare il controllo nel database, oltre che nell'interfaccia, così una chiamata diretta non aggira il limite.
- [ ] Conservare i voti già inviati e il risultato delle votazioni concluse quando la regola entra in vigore.
- [ ] Verificare i casi Premium attivo, scaduto, non partecipante, autovoto e salvataggio parziale dei voti.

**Concluso quando:** un partecipante Premium può votare gli altri, un partecipante non Premium vede la funzione ma non può inviare voti, e i controlli sul database confermano lo stesso comportamento.

### 2. Notifica quando il voto della partita viene pubblicato

- [ ] Inviare una push quando la votazione si chiude **e** le medie sono state pubblicate, non semplicemente allo scadere dell'orario.
- [ ] Recapitare l'avviso agli utenti interessati secondo le preferenze delle notifiche già presenti.
- [ ] Garantire una sola notifica per utente e partita, anche se il job di finalizzazione viene eseguito più volte.
- [ ] Verificare chiusura naturale, notifiche disattivate, utente senza dispositivo iscritto e ripetizione del job.

**Concluso quando:** dopo la pubblicazione delle medie arriva un solo avviso per destinatario abilitato e toccarlo porta alla partita corretta.

### 3. Generare al massimo 10 formazioni alternative

- [ ] Modificare l'algoritmo affinché produca **al massimo 10 formazioni distinte**, rispettando formato, giocatori selezionati, vincoli e calcolo dell'equilibrio attuali.
- [ ] Limitare anche il lavoro di ricerca: non generare tutte le combinazioni per poi mostrare soltanto le prime 10.
- [ ] Ordinare le proposte in modo ripetibile e offrire alternative realmente diverse, mantenendo la proposta migliore.
- [ ] Confrontare qualità delle squadre e tempi di risposta con i casi di prova già usati dall'app.

**Concluso quando:** l'admin vede fino a 10 proposte valide, l'interfaccia resta reattiva con rose numerose e nessuna regola di equilibrio viene persa.

### 4. Sondaggio Premium per scegliere le squadre

- [ ] Quando l'admin pubblica le squadre, salvare la formazione iniziale e fino a 10 alternative con tutte le **numeriche di equilibrio già mostrate nella creazione della partita**. Le opzioni devono restare uguali per tutta la votazione.
- [ ] Aprire una finestra di 24 ore dalla pubblicazione delle squadre.
- [ ] Consentire a **tutti i membri Premium della lega**, anche a chi non gioca quella partita, di scegliere una formazione. Una scelta per account e partita, modificabile fino alla chiusura.
- [ ] Creare una modale dedicata con formazioni, giocatori e numeriche leggibili, raggiungibile sia da **Partite** sia da **Mio profilo**.
- [ ] Mostrare la funzione anche ai non Premium con l'indicazione del requisito; controllare nel database chi può votare.
- [ ] Alla chiusura, salvare la formazione vincente e aggiornare la partita una sola volta.
- [ ] Definire prima dell'implementazione come risolvere un pareggio e cosa fare se nessuno vota. Proposta iniziale: in entrambi i casi mantenere la formazione pubblicata dall'admin.

**Concluso quando:** un Premium può scegliere o cambiare proposta da entrambe le schermate, un non Premium non può votare, e la formazione finale è determinata in modo verificabile.

### 5. Notifica ai convocati dopo la scelta delle squadre

- [ ] Inviare ai soli giocatori convocati una push quando il sondaggio delle formazioni termina e la scelta finale è salvata.
- [ ] Inserire nel messaggio partita, orario e invito ad aprire le squadre definitive.
- [ ] Evitare duplicati e coordinare l'avviso con le notifiche di convocazione e di modifica della partita già esistenti.
- [ ] Verificare destinatari convocati e non convocati, preferenze push e chiusura senza voti.

**Concluso quando:** ciascun convocato abilitato riceve un solo avviso relativo alle squadre definitive e gli altri membri non lo ricevono.

### 6. Chiusura anticipata dei due sondaggi da parte dell'admin

- [ ] Aggiungere **Chiudi votazione** nella modale dei voti ai giocatori e nella modale delle formazioni. L'admin deve poter raggiungere il comando anche se non può votare personalmente.
- [ ] Permettere la chiusura automatica dopo 24 ore oppure quella anticipata da parte dell'admin, registrando chi e quando ha chiuso.
- [ ] Eseguire la finalizzazione in modo atomico: dopo la chiusura nessuno può più cambiare voto e il risultato viene pubblicato una sola volta.
- [ ] Attivare le notifiche dei passi 2 e 5 anche in caso di chiusura anticipata, senza duplicati.
- [ ] Verificare chiusure simultanee, doppio tocco, voti inviati mentre si chiude e assenza di voti.

**Concluso quando:** entrambi i sondaggi danno lo stesso risultato sia alla scadenza sia con la chiusura anticipata, e solo l'admin può chiuderli prima.

### 7. Aspetto dorato e accesso coerente per tutte le funzioni Premium

- [ ] Definire un colore dorato accessibile per pulsanti, etichette e richiami Premium, coerente nei temi chiaro e scuro.
- [ ] Fare l'elenco delle funzionalità Premium già presenti e di quelle introdotte nei passi 1–6; applicare lo stesso stile e la stessa spiegazione del requisito in tutte le schermate.
- [ ] Lasciare le funzioni visibili a tutti. Per i non Premium, il tocco deve spiegare come attivarle senza eseguire l'azione riservata.
- [ ] Verificare i permessi sul server o nel database per ogni funzione: il solo colore o blocco del pulsante non basta.
- [ ] Controllare leggibilità, contrasto, navigazione da tastiera e aspetto su iPhone.

**Concluso quando:** ogni funzione Premium è riconoscibile in dorato, è scopribile da tutti e può essere usata soltanto con Premium attivo.

## Regola comune per ogni passo

Prima del rilascio: aggiornare le regole dell'app, verificare i permessi e i casi limite, eseguire lint, build e test pertinenti. Se il passo cambia il database o le notifiche, applicare anche la migrazione o la funzione necessaria e controllarne l'esito in produzione. Solo dopo segnare il passo come completato e iniziare il seguente.
