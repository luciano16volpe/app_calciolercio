// Pagina Impostazioni dell'app: versione e aggiornamento, account.
// Formazioni, forma recente e peso delle statistiche sono nel menu ☰ → «Regole di gioco» (solo amministratori).
import { useToast } from '../../app/Toast';
import type { LeagueData } from '../../data/queries';
import { useState } from 'react';
import { getTheme, setTheme, type Theme } from '../../app/theme';
import { AccountCard } from './AccountCard';

/** Cerca una nuova versione e la carica (il service worker la scarica, poi si ricarica la pagina). */
async function updateApp(toast: (m: string) => void): Promise<void> {
  toast('⏳ Controllo aggiornamenti…');
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (!reg) return toast(`✓ Hai già l'ultima versione (${__APP_VERSION__})`);
    await reg.update();
    const next = reg.installing ?? reg.waiting;
    if (!next) return toast(`✓ Hai già l'ultima versione (${__APP_VERSION__})`);
    toast('⬇️ Scarico la nuova versione…');
    await new Promise<void>((done) => {
      if (next.state === 'activated') return done();
      next.addEventListener('statechange', () => next.state === 'activated' && done());
      setTimeout(done, 15_000);
    });
    window.location.reload();
  } catch {
    toast('❌ Non riesco a controllare: riprova con la connessione attiva');
  }
}

const THEMES: { id: Theme; label: string }[] = [
  { id: 'auto', label: '📱 Come il telefono' },
  { id: 'light', label: '☀️ Chiaro' },
  { id: 'dark', label: '🌙 Scuro' },
];

/** Scelta dell'aspetto dell'app: chiaro, scuro o come il telefono. */
function ThemeCard() {
  const [theme, setT] = useState<Theme>(getTheme());
  return (
    <div className="card" id="theme-card">
      <div className="section-header">🎨 Aspetto dell'app</div>
      <div role="radiogroup" aria-label="Aspetto dell'app" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {THEMES.map((t) => (
          <button
            key={t.id} type="button" role="radio" aria-checked={theme === t.id} id={`theme-${t.id}`}
            className={`btn btn-sm ${theme === t.id ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: '1 1 auto' }}
            onClick={() => { setTheme(t.id); setT(t.id); }}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsPage({ data }: { data: LeagueData | undefined }) {
  const toast = useToast();
  return (
    <>
      <div className="card" id="settings-inner">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>
            Versione in uso: <strong id="app-version">{__APP_VERSION__}</strong>
          </span>
          <button className="btn btn-secondary btn-sm" id="update-app" onClick={() => void updateApp(toast)}>🔄 Aggiorna app</button>
        </div>
      </div>
      <ThemeCard />
      <AccountCard leagueId={data?.league.id} />
    </>
  );
}
