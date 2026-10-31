import { useState } from 'react';
import { BottomNav, type PageName } from './app/BottomNav';
import { LEAGUE_QUERY_KEY, useLeagueData } from './data/queries';
import { InstallHint } from './features/rosa/InstallHint';
import { RosaList } from './features/rosa/RosaList';
import { useQueryClient } from '@tanstack/react-query';

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
  const q = useLeagueData();
  const qc = useQueryClient();
  const go = (p: PageName) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
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
          <RosaList data={q.data} />
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
    </>
  );
}
