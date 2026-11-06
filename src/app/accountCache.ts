import { QueryClient } from '@tanstack/react-query';

const OWNER_KEY = 'calciolercio-cache-owner';
const OLD_CACHE_KEY = 'calciolercio-cache';
const PREFIX = 'calciolercio-cache-user:';
let activeUser: string | null | undefined;
let activeClient: QueryClient | undefined;
let generation = 0;

export const cacheKey = (userId: string) => PREFIX + userId;

// Si chiama prima di rendere disponibile la nuova sessione alla UI.
export function changeCacheOwner(userId: string | null): void {
  const previous = activeUser;
  activeUser = userId;
  if (previous !== userId) generation++;
  if (previous !== undefined && previous !== userId) {
    activeClient?.clear();
    activeClient = undefined;
  }
  try {
    const storedOwner = localStorage.getItem(OWNER_KEY);
    localStorage.removeItem(OLD_CACHE_KEY);
    if (storedOwner && storedOwner !== userId) localStorage.removeItem(cacheKey(storedOwner));
    if (previous && previous !== userId) localStorage.removeItem(cacheKey(previous));
    if (userId) localStorage.setItem(OWNER_KEY, userId);
    else localStorage.removeItem(OWNER_KEY);
  } catch {
    // Con memoria non disponibile la cache resta solo in RAM.
  }
}

export function createAccountClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { gcTime: 1000 * 60 * 60 * 24 * 7, retry: 1 } } });
}

export function registerAccountClient(userId: string | null, client: QueryClient): () => void {
  if (activeUser === userId) activeClient = client;
  return () => { if (activeClient === client) activeClient = undefined; };
}

// Impedisce alle scritture ritardate di una vecchia sessione di ricreare la sua cache.
export function accountStorage(userId: string): Storage {
  const currentGeneration = generation;
  return {
    get length() { return 0; },
    clear() {},
    key() { return null; },
    getItem(key) { try { return activeUser === userId && generation === currentGeneration ? localStorage.getItem(key) : null; } catch { return null; } },
    setItem(key, value) { try { if (activeUser === userId && generation === currentGeneration) localStorage.setItem(key, value); } catch { /* memoria non disponibile */ } },
    removeItem(key) { try { if (activeUser === userId && generation === currentGeneration) localStorage.removeItem(key); } catch { /* memoria non disponibile */ } },
  };
}
