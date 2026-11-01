# Piano del passaggio (Fase 5) — solo preparazione, da non eseguire senza il tuo via

Indirizzo definitivo dell'app: https://calciolercio.vercel.app

1. **Copia di sicurezza**: foglio Google e Gazzette su Drive. Lo script vecchio resta acceso.
2. **Ultima importazione** con i dati aggiornati: `npm run import -- --apply --admin-email=<tua email>` (prima la prova a secco senza `--apply`). Lo script stampa il riepilogo e manda l'intestazione `x-audit-source: import`.
3. **Amministratore supremo** (una volta sola): in Supabase → SQL Editor eseguire
   `insert into platform_admins select id from auth.users where email='luciano16volpe@gmail.com';`
   (prima devi esserti registrato con quell'email).
4. **Supabase → Authentication → URL Configuration**: Site URL = `https://calciolercio.vercel.app` (già impostato: ricontrollare).
5. **Link d'invito agli amici**: per ogni giocatore, ☰ → Inviti giocatori → «Invita» (link valido 7 giorni). Messaggio proposto, da approvare:
   > Ciao! Il calcetto ha una nuova app: https://calciolercio.vercel.app — Su iPhone: Safari → Condividi → «Aggiungi alla schermata Home». Per entrare usa il tuo link personale che ti mando qui sotto: ti registri e il tuo giocatore è già collegato.
6. **Pagina di trasferimento** sul vecchio repository: `docs/passaggio/pagina_trasferimento.html` con `NEW_URL` (due punti nel file) = indirizzo definitivo.
7. **Periodo di prova** (2 settimane): vecchio sistema ancora disponibile in sola lettura; nuovi dati solo sull'app nuova.
8. **Piano per tornare indietro**: ripristinare la vecchia pagina nel vecchio repository (commit precedente alla pagina di trasferimento), rimettere lo script Google in scrittura, avvisare gli amici. I dati inseriti nell'app nuova nel frattempo restano nel database e si possono reimportare a mano.
9. **Spegnimento dello script Google** solo dopo la tua conferma.

Prima di tutto questo, decidere se l'eliminazione di una lega debba restare a ogni amministratore o solo al creatore.
