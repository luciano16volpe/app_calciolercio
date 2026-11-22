import { LoadingProvider } from './app/LoadingIndicator';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './app/auth';
import { SessionCache } from './app/SessionCache';
import { ToastProvider } from './app/Toast';
import '@fontsource/bebas-neue/latin-400.css';
import './styles/app.css';
import './styles/menu.css';
import { App } from './App';
import { UpdateNotice } from './app/UpdateNotice';
import { repairViewport } from './app/Dialogs';
import { applyTheme, getTheme } from './app/theme';

applyTheme(getTheme());

// Su iPhone, dopo aver scritto in un campo la tastiera si chiude ma il footer fisso può restare a metà schermo: si rimette a posto la pagina
document.addEventListener('focusout', (e) => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement | null)?.tagName ?? '')) window.setTimeout(repairViewport, 150);
});

// iOS può completare il ritorno del viewport dopo focusout: riallinea il footer quando la tastiera sparisce.
if (window.visualViewport) {
  const viewport = window.visualViewport;
  let previousHeight = viewport.height;
  viewport.addEventListener('resize', () => {
    const keyboardClosed = viewport.height - previousHeight > 100;
    previousHeight = viewport.height;
    if (keyboardClosed) window.setTimeout(repairViewport, 150);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LoadingProvider><AuthProvider><ToastProvider><SessionCache><App /></SessionCache><UpdateNotice /></ToastProvider></AuthProvider></LoadingProvider>
  </StrictMode>,
);
