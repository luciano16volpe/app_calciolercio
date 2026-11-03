import { beforeEach, expect, test, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});

test('al primo avvio elimina la vecchia cache condivisa e conserva quella dello stesso account', async () => {
  const cache = await import('../src/app/accountCache');
  localStorage.setItem('calciolercio-cache', 'vecchi dati');
  localStorage.setItem('calciolercio-cache-owner', 'alice');
  localStorage.setItem(cache.cacheKey('alice'), 'dati alice');
  cache.changeCacheOwner('alice');
  expect(localStorage.getItem('calciolercio-cache')).toBeNull();
  expect(cache.accountStorage('alice').getItem(cache.cacheKey('alice'))).toBe('dati alice');
});

test('al cambio account elimina la cache precedente anche dopo il riavvio', async () => {
  const cache = await import('../src/app/accountCache');
  localStorage.setItem('calciolercio-cache-owner', 'alice');
  localStorage.setItem(cache.cacheKey('alice'), 'dati alice');
  cache.changeCacheOwner('bob');
  expect(localStorage.getItem(cache.cacheKey('alice'))).toBeNull();
  expect(localStorage.getItem('calciolercio-cache-owner')).toBe('bob');
  expect(cache.accountStorage('bob').getItem(cache.cacheKey('alice'))).toBeNull();
});

test('logout cancella memoria e cache salvata; le scritture in ritardo non la ricreano', async () => {
  const cache = await import('../src/app/accountCache');
  cache.changeCacheOwner('alice');
  const client = cache.createAccountClient();
  cache.registerAccountClient('alice', client);
  client.setQueryData(['league-data', 'alice'], 'dati alice');
  const oldStorage = cache.accountStorage('alice');
  oldStorage.setItem(cache.cacheKey('alice'), 'dati alice');
  cache.changeCacheOwner(null);
  expect(client.getQueryData(['league-data', 'alice'])).toBeUndefined();
  expect(localStorage.getItem(cache.cacheKey('alice'))).toBeNull();
  oldStorage.setItem(cache.cacheKey('alice'), 'scrittura in ritardo');
  expect(localStorage.getItem(cache.cacheKey('alice'))).toBeNull();
  cache.changeCacheOwner('alice');
  oldStorage.setItem(cache.cacheKey('alice'), 'scrittura di una vecchia sessione');
  expect(localStorage.getItem(cache.cacheKey('alice'))).toBeNull();
});

test('il rinnovo della sessione dello stesso utente conserva la cache', async () => {
  const cache = await import('../src/app/accountCache');
  cache.changeCacheOwner('alice');
  const client = cache.createAccountClient();
  cache.registerAccountClient('alice', client);
  const storage = cache.accountStorage('alice');
  client.setQueryData(['test'], 123);
  storage.setItem(cache.cacheKey('alice'), 'dati');
  cache.changeCacheOwner('alice');
  expect(client.getQueryData(['test'])).toBe(123);
  expect(storage.getItem(cache.cacheKey('alice'))).toBe('dati');
});

test('con memoria del browser non disponibile il cambio sessione non blocca l app', async () => {
  vi.stubGlobal('localStorage', { getItem() { throw Error('bloccata'); }, removeItem() { throw Error('bloccata'); } });
  const cache = await import('../src/app/accountCache');
  expect(() => cache.changeCacheOwner('alice')).not.toThrow();
  expect(cache.accountStorage('alice').getItem('x')).toBeNull();
  expect(() => cache.changeCacheOwner(null)).not.toThrow();
});
