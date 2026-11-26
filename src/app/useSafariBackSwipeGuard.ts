import { useEffect } from 'react';

/** Safari su iPhone può avviare Indietro o Avanti prima di emettere popstate. */
export function useSafariBackSwipeGuard() {
  useEffect(() => {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const safari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
    if (!ios || !safari) return;

    let origin: { x: number; y: number } | null = null;
    const start = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (event.touches.length !== 1 || !touch || (touch.clientX > 32 && touch.clientX < window.innerWidth - 32)) {
        origin = null;
        return;
      }
      origin = { x: touch.clientX, y: touch.clientY };
      const target = event.target instanceof Element ? event.target : null;
      // I controlli sul bordo devono continuare a ricevere il normale tocco.
      if (target?.closest('button, a, input, textarea, select, label, summary')) return;
      event.preventDefault();
    };
    const move = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!origin || event.touches.length !== 1 || !touch) return;
      const dx = Math.abs(touch.clientX - origin.x);
      const dy = Math.abs(touch.clientY - origin.y);
      if (dx > 10 && dx > dy * 1.2) event.preventDefault();
      else if (dy > 10 && dy > dx) origin = null;
    };
    const end = () => { origin = null; };
    document.addEventListener('touchstart', start, { capture: true, passive: false });
    document.addEventListener('touchmove', move, { capture: true, passive: false });
    document.addEventListener('touchend', end, true);
    document.addEventListener('touchcancel', end, true);
    return () => {
      document.removeEventListener('touchstart', start, true);
      document.removeEventListener('touchmove', move, true);
      document.removeEventListener('touchend', end, true);
      document.removeEventListener('touchcancel', end, true);
    };
  }, []);
}
