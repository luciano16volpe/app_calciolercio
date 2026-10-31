import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import './styles/app.css';
import './styles/menu.css';
import { App } from './App';

// I dati restano sul telefono: la prossima volta si vede subito l'ultima versione, poi si aggiorna.
const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 1000 * 60 * 60 * 24 * 7, retry: 1 } } });
const persister = createSyncStoragePersister({ storage: window.localStorage, key: 'calciolercio-cache' });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 * 7 }}>
      <App />
    </PersistQueryClientProvider>
  </StrictMode>,
);
