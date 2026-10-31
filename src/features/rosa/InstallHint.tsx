// Suggerimento "Installa CalcioLercio sull'iPhone": solo su iPhone/iPad in Safari, finché non lo si chiude
// o l'app non è già installata. Fonte: renderInstallHint in legacy/index.html.
import { useState } from 'react';

const KEY = 'calcio_install_hint';

const isStandalone = (): boolean =>
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
  (window.matchMedia != null && window.matchMedia('(display-mode: standalone)').matches);

const isIOS = (): boolean =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function InstallHint() {
  const [closed, setClosed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  if (!isIOS() || isStandalone() || closed) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* memoria piena o bloccata: si richiude solo per questa volta */
    }
    setClosed(true);
  };
  return (
    <div className="card install-hint">
      <span style={{ fontSize: 26 }}>📲</span>
      <div className="ih-txt">
        <strong>Installa CalcioLercio sull'iPhone</strong>
        <br />
        Tocca <strong>Condividi</strong> ⬆︎ in Safari e poi <strong>«Aggiungi alla schermata Home»</strong>: si aprirà come un'app, a schermo intero.
      </div>
      <button onClick={close} aria-label="Chiudi">✕</button>
    </div>
  );
}
