# Specifica · Registro attività (audit) per l'amministratore supremo

**Quando:** Fase 4, dopo il collegamento degli account (`/collega-account`).
**Per chi:** solo l'**amministratore supremo** della piattaforma (Luciano).

## Obiettivo
Registrare **chi ha fatto cosa, quando, in quale lega, e da dove**, per sicurezza e per risolvere
le discussioni ("chi ha cambiato il mio voto?"). Una schermata, visibile solo all'amministratore
supremo, permette di consultare e filtrare il registro.

## Decisioni prese con l'utente
- Si registrano **4 gruppi**: Accessi e account · Leghe, membri e ruoli · Partite, pagelle e Gazzette ·
  Giocatori e statistiche. **Non** si registrano le letture (chi guarda cosa).
- Si registrano anche **indirizzo IP e dispositivo** (user agent).
- **Conservazione: 2 mesi** (pulizia automatica). Due impostazioni distinte, entrambe a 60 giorni:
  `audit_retention_days` (tutto il registro) e `audit_ip_retention_days` (solo IP e dispositivo).
  ⚠️ Da riconfermare con l'utente se intendeva 2 mesi solo per IP/dispositivo.
- Gli utenti vengono **informati** (informativa privacy + avviso alla registrazione).

## Regole fisse
- Il registro lo scrive **il database** (trigger), non l'app: nessuna azione sfugge e nessuno può
  falsificarlo.
- **Nessuno può modificare o cancellare** righe del registro (neanche gli admin delle leghe; solo la
  pulizia automatica elimina le righe scadute).
- Lo legge **solo** l'amministratore supremo.
- Le modifiche fatte nella **stessa operazione** (es. salvataggio di 10 pagelle) restano **raggruppate**.
- Gli aggiornamenti che **non cambiano niente** non vengono registrati.

## Amministratore supremo
- Tabella `platform_admins(user_id uuid primary key references auth.users on delete cascade)` e
  funzione `is_super_admin()` (`security definer`).
- **Non si assegna dall'app**: una riga inserita una volta dallo SQL Editor di Supabase (spiegare
  all'utente come trovare il proprio `user_id` in Authentication → Users).
- Non diventa automaticamente admin delle leghe: vede il registro di tutte.

## Tabella del registro (bozza da completare e verificare)
```sql
create table public.audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,                       -- auth.uid(); null = sistema / SQL Editor / pulizia
  actor_name  text,                       -- nome al momento dell'azione (profiles.display_name)
  action      text not null,              -- es. 'match_players.update', 'auth.login', 'league_members.role'
  entity      text not null,              -- tabella o oggetto
  entity_id   text,                       -- id (o chiave composta, es. "<match>/<player>")
  league_id   uuid,                       -- per filtrare per lega (null per oggetti globali)
  tx          bigint not null default txid_current(),   -- raggruppa la stessa operazione
  changes     jsonb,                      -- update: {campo: [prima, dopo]} solo campi cambiati; insert/delete: riga
  source      text not null default 'app',-- app · import · sistema
  ip          inet,
  user_agent  text
);
-- indici: (at desc), (league_id, at desc), (actor_id, at desc), (tx)
```
- RLS attiva: `select` solo se `is_super_admin()`; **nessuna** regola di insert/update/delete;
  `revoke update, delete on audit_log from anon, authenticated`.
- IP e dispositivo: dalle intestazioni della richiesta (`current_setting('request.headers', true)`:
  primo valore di `x-forwarded-for`, e `user-agent`).
- `source = 'import'` se la richiesta ha l'intestazione `x-audit-source: import` (lo script di
  importazione la imposta nel client Supabase); `'sistema'` se `auth.uid()` è nullo.
- Non salvare dati pesanti (es. immagini): solo i percorsi dei file.

## Cosa registrare

### Gruppo 1 — Accessi e account
- registrazione, accesso, uscita, cambio/recupero password.
  Fonte da verificare: trigger sulle voci del registro di Supabase Auth (`auth.audit_log_entries`,
  filtrando le azioni utili ed **escludendo i rinnovi automatici del token**, che sono continui);
  se non è permesso, una funzione `log_event('auth.login')` chiamata dall'app dopo l'accesso.
- dalla specifica collegamento-account: invito creato / rigenerato / usato, richiesta "sono io",
  confermata / rifiutata, giocatore scollegato, giocatori uniti.
- account cancellato.

### Gruppo 2 — Leghe, membri e ruoli
- lega creata / modificata (nome, pubblica, impostazioni) / eliminata; codice d'invito rigenerato.
- membro entrato (con codice o invito), uscito, rimosso; **cambio di ruolo**.
- proposte di amministratore (fatta, approvata, rifiutata, annullata); **cessione della proprietà** della lega.

### Gruppo 3 — Partite, pagelle e Gazzette
- partita creata / modificata (data, note, risultato, squadre) / eliminata.
- pagelle: voto, gol, assist, autogol, meta, rigori sbagliati, titolo, descrizione (prima → dopo).
- importazione da WhatsApp: le modifiche di titolo/descrizione restano raggruppate in un'operazione.
- Gazzetta caricata / sostituita / rimossa.
- albo d'oro: **solo** il cambio di stato della stagione (es. chiusa e congelata), non i ricalcoli.

### Gruppo 4 — Giocatori e statistiche
- giocatore creato / modificato (nome, ruoli, statistiche, foto) / archiviato / eliminato;
  ingresso o uscita da una lega (`league_players`).

Tabelle con trigger: `leagues`, `league_members`, `league_players`, `players`, `matches`,
`match_players`, `gazzette`, `albo` (solo stato), `player_invites`, `player_claims`,
`league_admin_requests`, `leagues.owner_id` (cessione), + accessi.
Ignorare nei confronti i campi tecnici (`updated_at`, ecc.).

## Conservazione e privacy
- Impostazioni in `app_settings`: `audit_retention_days = 60`, `audit_ip_retention_days = 60`.
- Pulizia automatica ogni notte (estensione **pg_cron** di Supabase, da attivare in
  Database → Extensions): cancella le righe più vecchie di `audit_retention_days` e svuota `ip` e
  `user_agent` più vecchi di `audit_ip_retention_days`.
- Account cancellato: le sue righe restano, ma `actor_name = 'utente cancellato'`, `ip` e
  `user_agent` svuotati.
- Testo per l'informativa (da mostrare anche alla registrazione e in Impostazioni → Privacy):
  *"Per sicurezza registriamo le azioni fatte nell'app (cosa, quando, chi) e, per 2 mesi, l'indirizzo
  IP e il tipo di dispositivo. Il registro è visibile solo all'amministratore della piattaforma e
  viene cancellato automaticamente dopo 2 mesi."*

## Schermata "🛡️ Registro attività"
- In **Impostazioni**, visibile **solo** se `is_super_admin()`.
- **Filtri**: periodo (oggi · 7 giorni · 30 giorni · personalizzato), lega, persona, gruppo
  (i 4 gruppi), **"solo azioni delicate"**.
- **Azioni delicate**, evidenziate con ⚠️: cambio di ruolo, nuovo admin approvato, cessione della proprietà, partita eliminata, lega eliminata,
  giocatori uniti, giocatore scollegato, account cancellato.
- **Elenco** dal più recente, raggruppato per operazione:
  *"Marco · 28/10 14:32 · Lega del Mercoledì · Salvataggio partita del 28/10 (10 modifiche)"* →
  si apre con le frasi leggibili:
  *"ha cambiato il voto di Peppe da 6 a 6,5"*, *"ha aggiunto il titolo «LEADER» a Steppata"*.
  Nomi di giocatori, partite e leghe risolti (non id).
- **Dettaglio** di una riga: prima → dopo campo per campo, IP e dispositivo (se ancora conservati).
- **Esporta CSV** dei risultati filtrati. Caricamento a pagine (50 alla volta).
- Usabile da telefono (360 px) e computer.

## Controlli di accettazione (test)
- [ ] Ogni azione dei 4 gruppi crea righe con persona, lega, prima → dopo corretti.
- [ ] Un aggiornamento senza cambiamenti non crea righe; `updated_at` da solo non conta.
- [ ] Le 10 pagelle salvate insieme hanno lo stesso `tx` e appaiono come un'operazione.
- [ ] Un admin di lega e un utente normale **non** vedono il registro; nessuno può modificarlo o
      cancellarlo (test con utenti diversi).
- [ ] IP e dispositivo salvati; svuotati dopo 60 giorni; righe cancellate dopo 60 giorni
      (test simulando le date).
- [ ] Account cancellato → "utente cancellato" nelle sue righe.
- [ ] Le azioni dello script di importazione risultano con origine "import".
- [ ] Schermata: filtri, gruppi, azioni delicate, dettaglio, esportazione; prova a 360 px.

## Fuori da questo lavoro
Avvisi in tempo reale all'amministratore supremo (es. notifica quando qualcuno diventa admin):
possibile in futuro, da discutere.
