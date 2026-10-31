// Lega scelta su questo telefono (si ricorda tra una visita e l'altra). Senza scelta: la lega pubblica.
import { useSyncExternalStore } from 'react';

const KEY = 'calciolercio-league';
const EVENT = 'calciolercio-league-change';

export function getSelectedLeague(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Sceglie la lega da mostrare (null = torna alla lega pubblica). */
export function setSelectedLeague(id: string | null): void {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* memoria bloccata: vale solo finché l'app resta aperta */
  }
  window.dispatchEvent(new Event(EVENT));
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
};

export function useSelectedLeague(): string | null {
  return useSyncExternalStore(subscribe, getSelectedLeague, () => null);
}
