import { useEffect, useState, type ReactNode } from 'react';
import { defaultShouldDehydrateQuery, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { accountStorage, cacheKey, createAccountClient, registerAccountClient } from './accountCache';
import { useAuth } from './auth';

function AccountCache({ userId, children }: { userId: string | null; children: ReactNode }) {
  const [client] = useState(() => createAccountClient());
  const [persister] = useState(() => userId ? createSyncStoragePersister({ storage: accountStorage(userId), key: cacheKey(userId) }) : null);
  useEffect(() => registerAccountClient(userId, client), [userId, client]);
  if (!persister) return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return <PersistQueryClientProvider client={client} persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 * 7, buster: 'history-access-v1',
    dehydrateOptions: { shouldDehydrateQuery: (query) => defaultShouldDehydrateQuery(query) && query.queryKey[0] !== 'feature-modes' && query.queryKey[0] !== 'premium' && query.queryKey[0] !== 'gazzetta-url' && !(query.queryKey[0] === 'league-data' && query.queryKey[1] === 'history') } }}
    onSuccess={() => void client.invalidateQueries()}>{children}</PersistQueryClientProvider>;
}

export function SessionCache({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  const id = user?.id ?? null;
  return <AccountCache key={id ?? 'anonymous'} userId={id}>{children}</AccountCache>;
}
