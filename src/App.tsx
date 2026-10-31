import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BottomNav, type PageName } from './app/BottomNav';
import { ToastProvider } from './app/Toast';
import { LEAGUE_QUERY_KEY, useLeagueData } from './data/queries';
import { PlayerCard } from './features/player/PlayerCard';
import { InstallHint } from './features/rosa/InstallHint';
import { RosaList } from './features/rosa/RosaList';

/** Schede non ancora portate: stesso aspetto delle altre pagine, con un avviso. */
function Soon({ title }: { title: string }) {
  return (
    <div className="card">
      <div className="section-header">{title}</div>
      <div style={{ textAlign: 'center', padding: 14, color: 'var(--text3)', fontSize: 13 }}>In arrivo nella nuova versione</div>
    </div>
  );
}

export function App() {
  const [page, setPage] = useState<PageName>('rosa');
  const [openPlayer, setOpenPlayer] = useState<string | null>(null);
  // la Bacheca resta aperta (o chiusa) passando da un giocatore all'altro, come in legacy
  const [bachecaOpen, setBachecaOpen] = useState(false);
  const q = useLeagueData();
  const qc = useQueryClient();
  const go = (p: PageName) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const closePlayer = useCallback(() => setOpenPlayer(null), []);

  return (
    <ToastProvider>
      <header>
        <div className="logo" onClick={() => go('settings')} style={{ cursor: 'pointer' }} title="Apri impostazioni">
          <img src="/logo.png" alt="CalcioLercio" style={{ width: 44, height: 44, display: 'block', objectFit: 'contain' }} />
          CalcioLercio
        </div>
        <button
          id="header-refresh"
          onClick={(e) => {
            e.stopPropagation();
            void qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY });
          }}
          title="Aggiorna dati storico"
          style={{
            marginLeft: 'auto', background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff', width: 32, height: 32,
            borderRadius: '50%', cursor: 'pointer', fontSize: 15, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            display: page === 'partite' || page === 'classifiche' ? 'flex' : 'none',
          }}
        >
          🔄
        </button>
      </header>

      <div id="page-rosa" className={`page${page === 'rosa' ? ' active' : ''}`}>
        <InstallHint />
        {q.data ? (
          <RosaList data={q.data} onOpen={setOpenPlayer} />
        ) : q.isError ? (
          <div className="card">
            <div className="section-header">Non riesco a caricare i dati</div>
            <div style={{ padding: 10, color: 'var(--text3)', fontSize: 13 }}>
              Controlla la connessione e riprova.
              <br />
              <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => void q.refetch()}>
                Riprova
              </button>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--text3)', fontSize: 13 }}>⏳ Caricamento…</div>
        )}
      </div>
      <div id="page-partita" className={`page${page === 'partita' ? ' active' : ''}`}><Soon title="Gioca" /></div>
      <div id="page-partite" className={`page${page === 'partite' ? ' active' : ''}`}><Soon title="Partite" /></div>
      <div id="page-classifiche" className={`page${page === 'classifiche' ? ' active' : ''}`}><Soon title="Classifiche" /></div>
      <div id="page-settings" className={`page${page === 'settings' ? ' active' : ''}`}><Soon title="Impostazioni" /></div>

      <BottomNav page={page} onGo={go} />

      {q.data && openPlayer ? (
        <PlayerCard
          key={openPlayer}
          data={q.data}
          playerId={openPlayer}
          onClose={closePlayer}
          onOpenPlayer={setOpenPlayer}
          bachecaOpen={bachecaOpen}
          onToggleBacheca={() => setBachecaOpen((o) => !o)}
        />
      ) : null}
    </ToastProvider>
  );
}
