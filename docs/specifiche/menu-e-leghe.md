# Specifica · Menu laterale e gestione delle leghe

**Quando:** Fase 4, **prima** di `/collega-account` e `/registro-attivita` (il menu ospita le loro voci).
**Anteprime approvate dall'utente:** `docs/specifiche/img/` (A supremo+admin, B membro, C redazione,
D crea lega) e `img/menu_anteprima.html` (HTML di riferimento con stile e testi).

## Decisioni prese con l'utente
- **Chiunque sia registrato può creare leghe, senza limiti di numero**, e ne diventa amministratore
  (già garantito dallo schema: regola `leagues_insert` + automatismo `leagues_add_creator`).
- **Ruoli per lega**: lo stesso utente può essere membro in una lega e admin in altre (il ruolo sta in
  `league_members`, una riga per lega).
- **Più amministratori per lega**, con il **creatore** come proprietario: solo lui nomina o toglie gli
  admin; gli altri admin possono **proporre** un nuovo admin, che diventa tale solo con
  l'**approvazione del creatore** (vedi la sezione dedicata).
- Le funzioni di gestione stanno in un **menu laterale** che scorre da sinistra, approvato così come
  nelle anteprime. Le 4 schede in basso (Rosa · Gioca · Partite · Classifiche) restano invariate.

## Apertura e chiusura
- Icona **☰** in alto a sinistra nell'intestazione (prima del nome dell'app). Accanto al nome, una
  pillola con la **lega attiva** (`CalcioLercio ▾`) che apre direttamente l'elenco delle leghe.
- Il menu copre l'**84%** della larghezza (max 330 px); a destra l'app resta visibile, scurita.
- Si chiude con **✕**, toccando la parte scura, trascinandolo verso sinistra, o con Esc.
- **Non** aprirlo trascinando dal bordo sinistro: su iPhone il gesto è di Safari ("indietro").
- Mentre è aperto la pagina sotto non scorre; rispetta le aree sicure (notch, barra in basso);
  accessibile (focus dentro il menu, ruoli ARIA).
- Le **impostazioni dell'app** (versione, aggiornamenti, ecc.), oggi aperte toccando il logo, si
  spostano nella voce "⚙️ Impostazioni app" del menu.

## Contenuto (le sezioni dipendono dal ruolo nella **lega attiva**)
1. **Intestazione**: iniziali o foto, nome, email; pillole del ruolo
   (👑 Amministratore supremo · Admin / Redazione / Membro · <lega>); **👤 Il mio profilo ›**.
   *Senza account* (visitatore di una lega pubblica): al suo posto **Accedi / Registrati**.
2. **Le mie leghe**: elenco con il ruolo in ciascuna, la lega attiva evidenziata (tocco = cambio lega);
   **＋ Crea nuova lega**; **🔑 Entra con un codice** (`join_league`; se non hai un account ti chiede
   prima di accedere).
3. **Redazione · <lega>** (ruolo redazione): 📝 Pagelle da scrivere (contatore delle partite giocate
   senza titoli/descrizioni), 📥 Importa da WhatsApp, 📰 Carica la Gazzetta.
4. **Gestione · <lega>** (ruolo admin): 👥 Membri e ruoli (contatore), 🔗 Inviti giocatori,
   ✋ Richieste «sono io» (pallino rosso con il numero), 🔀 Unisci giocatori, ⚙️ Impostazioni della lega,
   riga con il **codice d'invito** e **Copia**.
5. **Piattaforma** (solo amministratore supremo): 🛡️ Registro attività (avviso azioni delicate di oggi),
   🏟️ Tutte le leghe, 👤 Utenti.
6. **App**: ⚙️ Impostazioni app, 🔒 Privacy, ❓ Aiuto, 🚪 Esci. In fondo la versione.

Le voci di funzioni **non ancora realizzate** (es. Inviti, Registro attività) restano **nascoste**
finché la relativa specifica non è completata.

## Lega attiva
- La lega è **nell'indirizzo**: `/l/<slug>/rosa`, `/l/<slug>/partite`… (i link condivisi aprono la
  lega giusta). Lo `slug` si ricava dal nome (unico; aggiungere la colonna se manca).
- L'ultima lega usata viene ricordata (sul telefono e nel profilo) e riaperta all'avvio.
- Cambiare lega aggiorna tutte le schede (rosa, partite, classifiche…) e le sezioni del menu.

## Crea nuova lega (anteprima D)
- Campi: **nome** (obbligatorio, 3–40 caratteri), **chi può vederla** (🔒 Solo i membri, predefinito ·
  🌐 Chiunque abbia il link → `is_public`), **formato abituale** (5/6/7 vs) e **giorno della partita**
  (facoltativo) → salvati in `leagues.settings`.
- **Crea la lega** → diventi admin → schermata di conferma con il **codice d'invito**, pulsante
  **Condividi** (messaggio WhatsApp pronto: *"Entra nella lega <nome> su CalcioLercio: <link> ·
  codice <codice>"*) → la nuova lega diventa quella attiva.
- Lega nuova e vuota: guida iniziale *"Aggiungi i giocatori"* con due strade:
  - **dalle tue altre leghe** (solo leghe di cui sei admin): stessi giocatori, **niente doppioni**;
  - **nuovo giocatore** (scheda nuova).

## Niente doppioni quando si entra in una lega
- Se un utente **già collegato al suo giocatore** entra in una lega (codice o invito), il suo giocatore
  viene **aggiunto automaticamente** a `league_players` di quella lega (se non c'è già). Farlo nel
  database (nuova versione di `join_league` o automatismo su `league_members`), non nell'app.
- L'admin può poi archiviarlo, se serve.

## Impostazioni della lega (admin)
- Nome, visibilità, formato, giorno, soglie e regole (se diverse da quelle predefinite).
- **Codice d'invito**: copia, **rigenera** (il vecchio smette di funzionare).
- **Elimina la lega**: conferma scrivendo il nome della lega; spiegare cosa si perde (partite, pagelle,
  albo, Gazzette di quella lega; i giocatori restano, con le altre leghe).

## Membri e ruoli (admin)
- Elenco dei membri con ruolo; il creatore ha la pillola **👑 Creatore**.
- Regola: una lega deve avere **sempre almeno un admin** (impedire di togliere l'ultimo).

## Più amministratori e creatore della lega
Chi può fare cosa:
| Azione | Creatore | Altri admin |
|---|---|---|
| Aggiungere / rimuovere membri e redazione; membro ↔ redazione | ✅ | ✅ |
| **Nominare un admin** | ✅ diretto | **solo proporre** (in attesa del creatore) |
| Approvare / rifiutare le proposte di admin | ✅ | ❌ |
| Togliere il ruolo di admin o rimuovere un admin | ✅ | ❌ |
| Rimuovere o cambiare il ruolo del creatore | — | ❌ |
| **Cedere la proprietà** (a un altro admin della lega) | ✅ | ❌ |

- Il creatore non può uscire dalla lega senza aver prima ceduto la proprietà (se ci sono altri admin)
  o eliminato la lega.
- **Creatore che cancella l'account**: la proprietà passa in automatico all'admin con l'ingresso più
  vecchio nella lega; se non ci sono altri admin, la lega resta senza proprietario e compare con ⚠️
  all'amministratore supremo (Piattaforma → Tutte le leghe), che la assegna.
- Interfaccia:
  - creatore: su ogni membro *Rendi redazione · Rendi admin · Torna membro · Rimuovi*; in
    Impostazioni della lega **Cedi la proprietà**;
  - altri admin: *Rendi redazione · Torna membro · Rimuovi* (solo su non-admin) e **Proponi come admin**
    → il membro mostra *"⏳ Proposto come admin · in attesa del creatore"* (la proposta si può annullare);
  - nel menu, sezione Gestione, solo per il creatore: **🛡️ Proposte di amministratore** con il pallino
    rosso del numero in attesa; la pillola del ruolo diventa *"Admin (creatore) · <lega>"*.

Database (nuova migrazione, bozza da completare e verificare):
- `leagues.owner_id uuid references auth.users(id) on delete set null`, valorizzato con il creatore
  (per le leghe esistenti: `created_by`); l'automatismo di creazione lo imposta.
- Tabella `league_admin_requests (id, league_id, user_id, requested_by default auth.uid(), status
  'pending'|'approved'|'rejected'|'cancelled', created_at, decided_by, decided_at)`; una sola
  proposta in attesa per persona e lega.
- Funzioni `security definer`: `propose_admin(league, user)` (admin), `decide_admin_request(id, approve)`
  (solo creatore), `cancel_admin_request(id)` (chi l'ha proposta o il creatore),
  `transfer_league_ownership(league, new_owner)` (solo creatore; il nuovo deve essere admin).
- **Automatismo di controllo su `league_members`** (insert/update/delete), che rifiuta:
  dare il ruolo `admin` se chi agisce non è il creatore (eccetto: creazione della lega, funzione di
  approvazione, SQL Editor/sistema con `auth.uid()` nullo); modificare o rimuovere un admin se chi
  agisce non è il creatore; modificare o rimuovere il creatore; togliere l'ultimo admin.
  (Stesso schema delle altre specifiche: variabile di sessione impostata dalle funzioni autorizzate.)
- Automatismo su cancellazione dell'account del creatore → passaggio di proprietà come sopra.

## Piattaforma (amministratore supremo)
- **Tutte le leghe**: nome, amministratori, numero membri e partite, data di creazione, ultima attività.
- **Utenti**: nome, email, leghe e ruoli, ultimo accesso.
- In sola lettura; dati tramite funzioni `security definer` che controllano `is_super_admin()`
  (es. `admin_list_leagues()`, `admin_list_users()`), non aprendo le tabelle a tutti.

## Controlli di accettazione (test)
- [ ] Il menu si apre con ☰ e si chiude con ✕, tocco sulla parte scura, trascinamento; niente apertura dal bordo.
- [ ] Le sezioni corrispondono al ruolo nella lega attiva (membro / redazione / admin / supremo) e
      cambiano cambiando lega; un visitatore senza account vede "Accedi / Registrati".
- [ ] Un utente registrato crea più leghe e ne è admin; codice d'invito mostrato e condivisibile.
- [ ] Entrare con un codice: l'utente diventa membro; se è collegato a un giocatore, il giocatore entra
      nella lega senza doppioni.
- [ ] Indirizzi con la lega (`/l/<slug>/…`) aprono la lega giusta; l'ultima lega viene riaperta.
- [ ] Non si può togliere l'ultimo admin; eliminare una lega richiede di scriverne il nome.
- [ ] Lo stesso utente è membro in una lega e admin in un'altra: menu e permessi cambiano con la lega.
- [ ] Un admin non creatore **non** può nominare admin (né dall'app né scrivendo nel database): può
      solo proporre; la proposta diventa effettiva solo con l'approvazione del creatore.
- [ ] Solo il creatore toglie il ruolo agli admin; nessuno può modificare o rimuovere il creatore.
- [ ] Cessione della proprietà a un altro admin; cancellazione dell'account del creatore → proprietà
      all'admin più anziano, oppure lega segnalata all'amministratore supremo.
- [ ] Le funzioni "Piattaforma" funzionano solo per l'amministratore supremo.
- [ ] Prova a 320, 360, 390 px su iPhone e Android emulati; aspetto come nelle anteprime.
