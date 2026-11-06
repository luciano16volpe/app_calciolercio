# Ottimizzazioni delle schermate e degli elementi visivi

Le modifiche riguardano il rendering e il codice scaricato. Non cambiano formule, periodi statistici o caricamento dello storico numerico.

## Schermate e codice su richiesta

`DeferredPage` monta una schermata al primo accesso e la mantiene poi montata, per conservare filtri, formato e convocati. Le schermate principali, i menu e la scheda partita usano import dinamici. Le funzioni di `canvas/lazy.ts` caricano il disegno delle immagini solo su un'azione dell'utente.

La PWA precarica gli script della base dell'app e le relative dipendenze statiche. I file JavaScript delle altre funzioni vengono conservati nella cache del service worker dopo essere stati richiesti, invece di essere scaricati tutti durante l'installazione.

## Immagini

- Foto dei giocatori: richiesta quando l'avatar entra entro 160 px dallo schermo; le iniziali restano disponibili durante il caricamento e in caso di errore. La foto caricata rimane nel componente anche scorrendo altrove.
- Gazzette: anteprima con dimensioni riservate, per evitare salti di impaginazione. Anche la richiesta dell'URL firmato viene rimandata alla prossimita' dello schermo e non viene aggiornata mentre l'anteprima e' fuori vista o la pagina e' in background.
- Resta disponibile il ripiego sul file originale quando una vecchia Gazzetta non ha miniatura.
- Il visualizzatore a schermo intero richiede l'immagine originale quando aperto; la decodifica delle immagini usa la modalita' asincrona.

## Effetti decorativi

`animateWhenVisible` mantiene un solo ciclo requestAnimationFrame per canvas e lo cancella fuori dallo schermo o in background. Riattiva il ciclo quando il riquadro torna visibile e risponde anche ai cambiamenti della preferenza di movimento ridotto, mostrando in quel caso uno sfondo statico.

Le figurine sospendono le animazioni CSS fuori dallo schermo. Le pagine inattive o coperte da menu e finestre non animano lo sfondo; palloni, pioggia e coriandoli vengono rimossi finche' la pagina e' coperta.

Verifiche specifiche: `tests/visible-animation.test.ts`, `e2e/visual-performance.spec.ts`, `e2e/lazy-pages.spec.ts`; regressioni su foto, Gazzette, Profilo e immagini condivisibili.
