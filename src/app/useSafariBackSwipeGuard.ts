import { useEffect } from 'react';

/** Safari su iPhone può avviare la navigazione Indietro prima di emettere popstate. */
export function useSafariBackSwipeGuard() {
  useEffect(() => {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const safari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!ios || !safari || standalone) return;

    const blockEdgeSwipe = (event: TouchEvent) => {
      if (event.touches.length !== 1 || (event.touches[0]?.clientX ?? Infinity) > 24) return;
      const target = event.target instanceof Element ? event.target : null;
      // I controlli sul bordo devono continuare a ricevere il normale tocco.
      if (target?.closest('button, a, input, textarea, select, label, summary')) return;
      event.preventDefault();
    };
    document.addEventListener('touchstart', blockEdgeSwipe, { capture: true, passive: false });
    return () => document.removeEventListener('touchstart', blockEdgeSwipe, true);
  }, []);
}
