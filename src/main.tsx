import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import './styles/app.css';
import './styles/menu.css';
import { App } from './App';
import { repairViewport } from './app/Dialogs';
import { applyTheme, getTheme } from './app/theme';

applyTheme(getTheme());

// Su iPhone, dopo aver scritto in un campo la tastiera si chiude ma il footer fisso può restare a metà schermo: si rimette a posto la pagina
document.addEventListener('focusout', (e) => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement | null)?.tagName ?? '')) window.setTimeout(repairViewport, 150);
});

// I dati restano sul telefono: la prossima volta si vede subito l'ultima versione, poi si aggiorna.
const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 1000 * 60 * 60 * 24 * 7, retry: 1 } } });
const persister = createSyncStoragePersister({ storage: window.localStorage, key: 'calciolercio-cache' });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 * 7 }}
      // F5 / riapertura: si mostra subito ciò che c'è sul telefono e si aggiorna sempre dal database
      onSuccess={() => void queryClient.invalidateQueries()}
    >
      <App />
    </PersistQueryClientProvider>
  </StrictMode>,
);
