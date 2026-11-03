import { useEffect, useState } from 'react';
import { monitorUpdates } from './monitorUpdates';

/** Avvisa quando e pronta una nuova versione, lasciando scegliere quando ricaricare. */
export function UpdateNotice() {
  const [available, setAvailable] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    return monitorUpdates(navigator.serviceWorker, document, window, () => {
      setHidden(false);
      setAvailable(true);
    });
  }, []);
  useEffect(() => {
    if (!available) return;
    const showAgain = () => { if (document.visibilityState === 'visible') setHidden(false); };
    document.addEventListener('visibilitychange', showAgain);
    return () => document.removeEventListener('visibilitychange', showAgain);
  }, [available]);
  if (!available || hidden) return null;
  return (
    <div role="status" className="update-notice">
      <span>Una nuova versione dell'app è pronta.</span>
      <button type="button" className="btn btn-sm btn-primary" onClick={() => window.location.reload()}>Aggiorna</button>
      <button type="button" className="btn btn-sm btn-secondary" onClick={() => setHidden(true)}>Non ora</button>
    </div>
  );
}
