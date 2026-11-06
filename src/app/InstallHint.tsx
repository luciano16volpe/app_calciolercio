// Suggerimento «Metti CalcioLercio nella schermata Home»: su iPhone/iPad (Safari) e su Android (Chrome), finché non lo si chiude
// o l'app non è già installata. Compare in tutte le pagine e nella pagina d'accesso.
import { useState } from 'react';

const KEY = 'calcio_install_hint';

const isStandalone = (): boolean =>
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
  (window.matchMedia != null && window.matchMedia('(display-mode: standalone)').matches);

const isIOS = (): boolean =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isAndroid = (): boolean => /Android/.test(navigator.userAgent);

/** `inPage`: dentro un'altra pagina (accesso); altrimenti in cima all'app, con lo stesso margine delle pagine. */
export function InstallHint({ inPage = false }: { inPage?: boolean }) {
  const [closed, setClosed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  const ios = isIOS();
  if (!(ios || isAndroid()) || isStandalone() || closed) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* memoria piena o bloccata: si richiude solo per questa volta */
    }
    setClosed(true);
  };
  const card = (
    <div className="card install-hint" id="install-hint" style={inPage ? { marginTop: 14, marginBottom: 0 } : { marginBottom: 0 }}>
      <span style={{ fontSize: 26 }}>📲</span>
      <div className="ih-txt">
        <strong>{ios ? "Installa CalcioLercio sull'iPhone" : 'Installa CalcioLercio sul telefono'}</strong>
        <br />
        {ios ? (
          <>Tocca <strong>Condividi</strong> ⬆︎ in Safari e poi <strong>«Aggiungi alla schermata Home»</strong>: si aprirà come un'app, a schermo intero.</>
        ) : (
          <>Tocca <strong>⋮</strong> in Chrome e poi <strong>«Installa app»</strong> (o «Aggiungi a schermata Home»): si aprirà come un'app, a schermo intero.</>
        )}
      </div>
      <button onClick={close} aria-label="Chiudi">✕</button>
    </div>
  );
  return inPage ? card : <div style={{ maxWidth: 800, margin: '0 auto', padding: '10px 8px 0' }}>{card}</div>;
}
