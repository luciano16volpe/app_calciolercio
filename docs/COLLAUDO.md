# Collaudo finale — Fase 4 (1 novembre 2026)

Ambiente: progetto Supabase vero, solo migrazioni nuove e additive; le prove con utenti finti girano dentro transazioni che si annullano da sole (verificato: nessuna traccia). Nessun progetto di prova.

## Esiti
- ✅ Completezza: menu e leghe, collegamento account, registro attività, profilo e privacy (vedi `docs/PIANO.md`).
- ✅ Permessi per ruolo nel database: `supabase/tests/permessi_per_ruolo.sql`, 51 azioni × 7 ruoli (visitatore, membro, redazione, admin, creatore, admin di un'altra lega, amministratore supremo). Tutte come atteso dopo la correzione dei permessi sui giocatori.
- ✅ Registro attività: `supabase/tests/registro_attivita.sql`, 35 controlli (righe giuste, niente righe per aggiornamenti vuoti, stessa operazione raggruppata, IP e dispositivo, origine import/sistema, nessuna modifica o cancellazione possibile, pulizia a 60 giorni, account cancellato anonimo).
- ✅ Scenario completo sul database: `supabase/tests/scenario_completo.sql`, 30 controlli. Scenario con più telefoni: `e2e/scenario.spec.ts` (database finto condiviso).
- ✅ Test esistenti delle Fasi 1–3 e i golden: verdi (vedi riepilogo finale).
- ✅ Nessun sbordo a 320/360/390 px nel menu e nelle schermate nuove; prove su iPhone, Android e 360 px.
- ⚠️ Non provati qui: installazione e aggiornamento PWA su telefono vero, tema scuro a vista, 412 px.
- ✅ Chiavi segrete: nessuna nel codice (`.env.local` fuori da Git).

## Problemi trovati
| Gravità | Problema | Stato |
|---|---|---|
| Alta | `accept_player_invite`: errore «colonna ambigua», il link d'invito non funzionava | Corretto (migrazione 20261108000100) |
| Alta | Il registro bloccava la creazione di giocatori (`min(uuid)`) | Corretto (20261107000100) prima dell'uso |
| Media | I dialoghi di conferma comparivano dietro i pannelli del menu | Corretto |
| Media | Cambio lega dal menu senza effetto con l'indirizzo `/l/<slug>` | Corretto |
| Media | L'admin, salvando con dati vecchi di meno di un minuto, cancellava i testi appena scritti dalla redazione | Corretto: i testi non toccati non si riscrivono |
| Media | Chi ha creato un giocatore da admin e ora è solo membro può ancora modificarlo/eliminarlo | Corretto il 1/11 con la tua approvazione (migrazioni 20261109000000 e 20261109000100): modifica ed eliminazione solo per gli admin delle leghe del giocatore; eliminare richiede di essere admin di tutte le sue leghe |
| Bassa | Qualsiasi amministratore (non solo il creatore) può eliminare la lega | Deciso il 1/11: resta così (serve scrivere il nome della lega) |
| Bassa | La redazione non salva i soprannomi imparati dall'import (permesso solo agli admin): restano sul telefono | Accettato |
| Bassa | L'intestazione `x-audit-source: import` può essere dichiarata da chiunque: cambia solo l'etichetta, la persona resta registrata | Accettato |

## Cosa resta
Riga SQL dell'amministratore supremo, prova su telefono vero, poi `PIANO_PASSAGGIO.md`.
