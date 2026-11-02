# Specifica · Collegamento giocatori ↔ account ("questo sono io")

**Quando:** dopo le Fasi 0–3 e dopo `menu-e-leghe.md` (fa parte della Fase 4); le sue voci vanno nel menu laterale (sezione Gestione). **Prerequisiti:** schema base applicato,
dati importati (giocatori senza account), accesso con email funzionante, schede giocatore pronte.

## Obiettivo
I giocatori importati dalla vecchia app esistono già (con storico, statistiche, figurina) ma non hanno
un account. Quando un amico si registra, il suo account va **collegato al suo giocatore esistente**
(mai crearne uno nuovo). Il giocatore è **unico in tutte le leghe**: collegarlo una volta vale ovunque.

Regole fisse:
- un giocatore ↔ al massimo un account, e viceversa (già garantito: `players.user_id unique`);
- il collegamento avviene **solo** tramite funzioni sicure del database, mai scrivendo `user_id` dal client;
- le **statistiche non le modifica il giocatore**: restano agli amministratori (con storico).

## Decisione presa con l'utente
- **Strada principale — link d'invito personale** (scelta dall'utente).
- **Riserva — richiesta "Questo sono io" con conferma dell'amministratore**, per chi entra con il
  codice della lega senza aver ricevuto il link.
- Scartato: collegamento automatico per email (servirebbe raccogliere le email prima).
- Serve anche **"Unisci giocatori"** per i doppioni creati per errore in leghe diverse.

## Flussi

### A. Invito personale (principale)
1. L'admin apre la scheda di un giocatore **non collegato** → pulsante **"🔗 Invita <nome>"**.
2. L'app crea un invito (valido **7 giorni**) e apre il menu di condivisione del telefono con un
   messaggio pronto: *"Ciao <nome>! Ecco il tuo link per entrare in CalcioLercio: <link>"*
   (in alternativa "📋 Copia link"). Link: `<origine app>/invito/<token>`.
3. L'amico apre il link → se non ha un account: registrazione (email + password, o link via email);
   se ce l'ha: accesso.
4. Subito dopo l'accesso l'invito viene **accettato automaticamente**: l'account viene collegato al
   giocatore e l'amico entra nella lega come **member**.
5. Messaggio: *"Benvenuto <nome>! Ora fai parte di <lega>."* → apre **Il mio profilo**.

Stato nella scheda (solo per l'admin):
- non collegato, nessun invito → **"🔗 Invita <nome>"**;
- invito attivo → *"Invito inviato il 12/11 · valido fino al 19/11"* + **"Rigenera link"**
  (il vecchio link smette di funzionare);
- collegato → *"✅ Collegato a <nome account>"* + **"Scollega"** (con conferma).

### B. "Questo sono io" con conferma (riserva)
1. L'amico entra nella lega con il **codice** (già previsto: `join_league`) e non è collegato a nessun
   giocatore → l'app gli mostra i giocatori **non collegati** di quella lega con **"Questo sono io"**.
2. Toccandolo nasce una richiesta **in attesa**; lui vede *"In attesa di conferma dell'amministratore"*.
3. L'admin vede un contatore **"Richieste (n)"** (in Impostazioni / gestione lega) → **Conferma** o
   **Rifiuta**. Confermando, il collegamento avviene e le altre richieste per lo stesso giocatore
   vengono rifiutate.

### C. Scollegare
- Un admin di una lega del giocatore (o l'utente stesso) può scollegare: `user_id` torna vuoto,
  il giocatore e il suo storico restano intatti.

### D. Unisci giocatori (doppioni)
- Caso: in un'altra lega qualcuno ha creato un nuovo "Peppe" invece di aggiungere quello esistente.
- L'admin sceglie **quale tenere** e **quale assorbire**. Tutto passa al giocatore tenuto: leghe
  (`league_players`), partite e pagelle (`match_players`), storico statistiche, Gazzette restano legate
  alle partite. Poi il doppione viene eliminato.
- Permesso: l'utente deve essere **admin di tutte le leghe** in cui gioca il doppione.
- Blocco: se i due giocatori risultano **nella stessa partita**, l'unione non è possibile (errore chiaro).
- Le statistiche del giocatore tenuto **non cambiano** (si sceglie chi tenere anche per questo).

## Database — nuova migrazione (bozza da completare e verificare)
```sql
-- inviti personali
create table public.player_invites (
  token       text primary key default replace(gen_random_uuid()::text, '-', ''),
  player_id   uuid not null references public.players(id) on delete cascade,
  league_id   uuid not null references public.leagues(id) on delete cascade,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  revoked     boolean not null default false,
  used_at     timestamptz,
  used_by     uuid references auth.users(id) on delete set null
);
-- richieste "questo sono io"
create table public.player_claims (
  id          bigserial primary key,
  player_id   uuid not null references public.players(id) on delete cascade,
  league_id   uuid not null references public.leagues(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at  timestamptz not null default now(),
  decided_by  uuid references auth.users(id) on delete set null,
  decided_at  timestamptz,
  unique (player_id, user_id)
);
```
Funzioni (tutte `security definer`, `set search_path = public`, controlli dentro la funzione):
| Funzione | Chi | Cosa fa |
|---|---|---|
| `create_player_invite(player uuid, league uuid) → text` | admin della lega | verifica che il giocatore sia nella lega e **non collegato**; revoca gli inviti attivi precedenti per quel giocatore/lega; crea e restituisce il token |
| `accept_player_invite(token text) → uuid` | utente autenticato | invito valido (non usato, non revocato, non scaduto; con `for update`); giocatore non collegato; l'utente non è già collegato a un **altro** giocatore → collega, aggiunge l'utente a `league_members` come `member` (se non c'è già), segna l'invito come usato; restituisce l'id del giocatore |
| `request_player_claim(player uuid, league uuid) → bigint` | membro della lega | giocatore nella lega e non collegato; utente non collegato → crea la richiesta `pending` |
| `decide_player_claim(claim bigint, approve boolean)` | admin della lega della richiesta | se approva: ricontrolla che giocatore e utente siano ancora liberi → collega, rifiuta le altre richieste pendenti per quel giocatore; se rifiuta: `rejected` |
| `unlink_player(player uuid)` | `can_edit_player(player)` oppure l'utente collegato | `user_id = null` |
| `merge_players(keep uuid, drop uuid)` | admin di **tutte** le leghe di `drop` | vedi flusso D, in **una transazione**; errore se condividono una partita |

**Blocco su `players.user_id`:** oggi la regola `players_update` permette agli admin di modificare
qualsiasi colonna, quindi anche `user_id`. Aggiungere un trigger `before update` su `players` che
rifiuta il cambio di `user_id` quando `auth.uid()` non è nullo e la variabile di sessione
`app.linking` non vale `'on'`; le funzioni qui sopra la impostano con
`set_config('app.linking','on',true)` subito prima dell'aggiornamento (dura solo per la transazione).
Stesso trigger: un giocatore non può cambiare `user_id` da un account a un altro senza passare da
`unlink_player`.

Permessi (RLS) delle nuove tabelle: inviti visibili/creabili solo dagli admin della lega (nessun
`update`/`delete` diretto: passano dalle funzioni); richieste visibili a chi le ha fatte e agli admin
della lega. `revoke execute ... from anon` sulle funzioni, `grant ... to authenticated`.

Messaggi d'errore **in italiano**, chiari: *"Questo link è scaduto: chiedi un nuovo invito"*,
*"Questo link è già stato usato"*, *"Il tuo account è già collegato a <nome>"*,
*"Questo giocatore è già collegato a un altro account"*.

## Interfaccia
- Scheda giocatore (admin): stato del collegamento + pulsanti (vedi A, C).
- Pagina `/invito/:token` (funziona anche aperta da WhatsApp e dall'app installata).
- Dopo l'ingresso con codice: elenco "Questo sono io" (B) se l'utente non è collegato.
- Gestione lega (admin): **Richieste (n)**, elenco membri con ruolo, **Unisci giocatori**.
- **Il mio profilo**: figurina, statistiche e partite di **tutte** le sue leghe (divise per lega),
  bacheca complessiva. Il nome mostrato resta quello del giocatore (la lega può avere un soprannome).

## Casi particolari da gestire
- Link scaduto / già usato / revocato; giocatore già collegato; account già collegato a un altro
  giocatore; lo stesso amico che apre il proprio link due volte (ok, nessun errore).
- Account cancellato → il giocatore torna "non collegato" (già garantito: `on delete set null`).
- Un utente entrato con il codice e poi invitato con il link: l'invito lo collega normalmente.

## Controlli di accettazione (test)
- [ ] Admin crea l'invito per un giocatore non collegato; un non-admin **non** può crearlo.
- [ ] Accettando il link, l'utente risulta collegato al giocatore e membro della lega.
- [ ] Link scaduto, usato o rigenerato → rifiutato con il messaggio giusto.
- [ ] Un account non può collegarsi a due giocatori; un giocatore non può avere due account.
- [ ] Nessun utente può impostare `user_id` scrivendo direttamente nella tabella `players`.
- [ ] Richiesta "sono io": in attesa → confermata dall'admin → collegata; le altre rifiutate.
- [ ] Scollega: il giocatore torna libero, storico e statistiche intatti.
- [ ] Unisci giocatori: partite, pagelle e leghe passano al giocatore tenuto; blocco se stessa partita;
      negato a chi non è admin di tutte le leghe del doppione.
- [ ] Prova su iPhone e Android (emulati): link aperto da WhatsApp, registrazione, profilo.

## Fuori da questo lavoro
Notifiche push, modifica della propria foto/nome da parte del giocatore, statistiche corrette dalle
pagelle di più leghe (decisioni future, da discutere con l'utente).
