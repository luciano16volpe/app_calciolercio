# CalcioLercio — guida per Claude Code

App per gestire il calcetto tra amici: rosa con statistiche e figurine stile FIFA, sorteggio di
squadre equilibrate, partite con pagelle (voti + titolo e descrizione della "Redazione"),
classifiche, albo d'oro per stagione, Gazzette. Lingua dell'interfaccia: **italiano**.

Questo progetto è la **nuova versione multi-lega** dell'app, con database Supabase.
L'app corrente è questa versione React/Supabase. La vecchia app non esiste più nel repository e non è un riferimento per i test.

## Regola d'oro

> I test verificano le regole attuali decise dall'utente con risultati attesi espliciti,
> casi limite e invarianti. Non caricare né eseguire la vecchia app per confrontare formule,
> grafica, markup o immagini. Le istruzioni recenti dell'utente prevalgono sulle decisioni storiche.

Prima di toccare la logica di dominio leggi **`docs/REGOLE.md`** (formule, soglie, regole) e
**`docs/DECISIONI.md`** (cosa è stato scelto e cosa è stato scartato, da non riproporre).
Il piano di lavoro a fasi è in **`docs/PIANO.md`**.

## L'utente
- Luciano, organizzatore del gruppo. Non è uno sviluppatore: spiegagli le cose **in italiano semplice**,
  senza gergo, e mostragli **immagini/anteprime** quando c'è una scelta visiva da fare (le scelte
  grafiche si fanno insieme, proponendo 2–4 alternative).
- Usa l'app soprattutto da **iPhone**; alcuni amici da **Android**. Testa sempre entrambi.

## Stack
| Pezzo | Scelta |
|---|---|
| Build | Vite + TypeScript (strict) |
| UI | React |
| Dati | supabase-js + TanStack Query (cache: mostra subito i dati, poi aggiorna) |
| PWA | vite-plugin-pwa (service worker: risolve i problemi di aggiornamento su iPhone/Android) |
| Stile | CSS della versione corrente, aggiornato secondo le decisioni dell'utente |
| Test | Vitest (logica) + Playwright (schermate, emulazione iPhone e Android) |
| Database | Supabase (Postgres + Auth + Storage), regione EU. Schema in `supabase/migrations/` |
| Hosting | Vercel o Cloudflare Pages (anteprima per ogni ramo = ambiente di prova) |

## Struttura proposta
```
src/
  domain/        logica PURA, senza DOM né Supabase (tutta testata)
                 ovr.ts  form.ts  balancing.ts  seasons.ts  awards.ts  stats.ts
                 pairs.ts  records.ts  h2h.ts  whatsapp.ts  tiers.ts
  canvas/        immagini condivisibili: figurina.ts  riepilogo.ts  formazioni.ts  foglio.ts  confronto.ts
  data/          accesso a Supabase (query, mutazioni, upload)
  features/      schermate: rosa/  gioca/  partite/  classifiche/  leghe/  auth/  impostazioni/
  styles/        app.css
tests/
  fixtures/      dati reali di prova (partite, pagelle, messaggi WhatsApp)
  domain/        regole attuali, esempi espliciti e casi limite
  db/            migrazioni, funzioni e RLS applicative
supabase/        migrations/ (+ functions/ in futuro)
```

## Comandi (da creare nella Fase 0)
- `npm run dev` · `npm run build` · `npm run test` (Vitest) · `npm run e2e` (Playwright)
- `npx supabase gen types typescript --project-id <id> > src/data/types.ts` dopo ogni migrazione

## Convenzioni
- Codice e identificatori in **inglese**; testi dell'interfaccia e messaggi all'utente in **italiano**.
- Squadre: **A = Blu**, **B = Bianchi** (in CSS il prefisso dei Bianchi è `bi`, mai `am`/`amber`).
- Date in formato ISO `YYYY-MM-DD`. Stagioni con chiave `AAAA-PRI|EST|AUT|INV` (vedi REGOLE).
- Le 11 statistiche hanno sempre questo ordine (array di 11 valori 0–10):
  `stamina, forza, dribling, velocità, tiro, passaggio, attacco, difesa, tecnica, porta, intelligenza`.
- Una sola fonte per ogni calcolo (es. `seasonStats(scope)`): niente formule duplicate.
- **Mai** la chiave `service_role`/secret di Supabase nel codice o nel repo. Nel client solo
  `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (file `.env.local`, non committato).
- I permessi li garantisce il database (Row Level Security), non l'interfaccia.

## Immagini su canvas (figurine, riepilogo…) — regole imparate a caro prezzo
- Ogni testo **centrato** va **misurato** con il font reale (`measureText`) e posizionato: niente
  offset fissi (su iPhone il font San Francisco ha larghezze diverse).
- **Niente emoji con U+FE0F** (es. ✒️ 🅰️) dentro testo centrato su canvas: Safari le misura male.
  Usare forme disegnate (frecce, fulmini, nuvole) o togliere il selettore di variante.
- Le figurine si generano a doppia risoluzione (720×1140 → canvas 1440×2280).
- Prima di condividere un'immagine, l'app la **mostra a schermo intero** (Condividi / Salva dopo).

## iPhone / Android — insidie note
- Tastiera iOS: prima di chiudere una finestra togliere il focus dai campi, altrimenti la barra in
  basso resta "sospesa" a metà schermo (`releaseKeyboard()` + `repairViewport()`).
- Campi di testo con `font-size: 16px` (sotto, iOS fa zoom).
- `overflow-x:hidden` solo su `html`, non su `body` (rompe `position:fixed` su iOS).
- Schermi da 320 a 412 px: niente deve uscire in orizzontale (controllare sempre a 360 px).

## Come lavorare
- Passi piccoli, ognuno verificato da test; dopo ogni passo un riepilogo breve per l'utente.
- Verifica le regole di dominio correnti con esempi e risultati attesi indipendenti dal codice storico.
- I dati in `tests/fixtures/` sono **reali** (nomi, voti, descrizioni): il repository deve restare
  **privato**.
