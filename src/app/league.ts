// Lega scelta: nell'indirizzo (/l/<slug>/…) e ricordata sul telefono (si riapre all'avvio). Senza scelta: la lega pubblica.
import { useSyncExternalStore } from 'react';

const KEY = 'calciolercio-league';
const EVENT = 'calciolercio-league-change';

/** Pagine dell'app e loro nome nell'indirizzo. */
export const PAGE_PATHS = { rosa: 'rosa', partita: 'gioca', partite: 'partite', classifiche: 'classifiche', settings: 'impostazioni' } as const;
export type PageKey = keyof typeof PAGE_PATHS;

export interface Route {
  slug: string | null;
  page: PageKey | null;
  /** token di un invito personale (/invito/<token>) */
  invite: string | null;
}

/** Legge l'indirizzo: /l/<slug>/<pagina> oppure /invito/<token>. */
export function parsePath(path: string): Route {
  const inv = path.match(/^\/invito\/([A-Za-z0-9_-]+)\/?$/);
  if (inv) return { slug: null, page: null, invite: inv[1] as string };
  const m = path.match(/^\/l\/([a-z0-9-]+)(?:\/([a-z]+))?\/?$/);
  if (!m) return { slug: null, page: null, invite: null };
  const page = (Object.keys(PAGE_PATHS) as PageKey[]).find((k) => PAGE_PATHS[k] === m[2]) ?? null;
  return { slug: m[1] as string, page, invite: null };
}

export const buildPath = (slug: string, page: PageKey): string => `/l/${slug}/${PAGE_PATHS[page]}`;

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Lega da mostrare: quella dell'indirizzo, altrimenti l'ultima usata. */
export function getSelectedLeague(): string | null {
  return parsePath(window.location.pathname).slug ?? read();
}

/** Sceglie la lega da mostrare (null = torna alla lega pubblica) e la ricorda. */
export function setSelectedLeague(slug: string | null): void {
  try {
    if (slug) localStorage.setItem(KEY, slug);
    else localStorage.removeItem(KEY);
  } catch {
    /* memoria bloccata: vale solo finché l'app resta aperta */
  }
  window.dispatchEvent(new Event(EVENT));
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  window.addEventListener('popstate', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
    window.removeEventListener('popstate', cb);
  };
};

export function useSelectedLeague(): string | null {
  return useSyncExternalStore(subscribe, getSelectedLeague, () => null);
}

/** Cambia l'indirizzo senza ricaricare. */
export function navigate(path: string, replace = false): void {
  if (window.location.pathname === path) return;
  if (replace) window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);
  window.dispatchEvent(new Event(EVENT));
}
