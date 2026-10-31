import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BottomNav, type PageName } from './app/BottomNav';
import { AuthProvider } from './app/auth';
import { ImageProvider } from './app/ImageViewer';
import { ToastProvider } from './app/Toast';
import { LEAGUE_QUERY_KEY, useLeagueData } from './data/queries';
import { ClassifichePage } from './features/classifiche/ClassifichePage';
import { GiocaPage } from './features/gioca/GiocaPage';
import { AccountCard } from './features/impostazioni/AccountCard';
import { MatchCard } from './features/partite/MatchCard';
import { PartitePage } from './features/partite/PartitePage';
import { GazArchive, GazViewer, PagelleTextDialog, type MatchActions } from './features/partite/parts';
import { PlayerCard } from './features/player/PlayerCard';
import { InstallHint } from './features/rosa/InstallHint';
import { RosaList } from './features/rosa/RosaList';

/** Messaggio al posto di una pagina mentre i dati si caricano o se non arrivano. */
function Loading({ q }: { q: { isError: boolean; refetch: () => unknown } }) {
  if (q.isError) {
    return (
      <div className="card">
        <div className="section-header">Non riesco a caricare i dati</div>
        <div style={{ padding: 10, color: 'var(--text3)', fontSize: 13 }}>
          Controlla la connessione e riprova.
          <br />
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => void q.refetch()}>Riprova</button>
        </div>
      </div>
    );
  }
  return <div style={{ textAlign: 'center', padding: 30, color: 'var(--text3)', fontSize: 13 }}>⏳ Caricamento…</div>;
}

/** Cosa c'è nella finestra aperta sopra la pagina (una sola per volta, come in legacy). */
type View = { kind: 'player'; id: string } | { kind: 'match'; id: string } | { kind: 'gazArchive' } | null;

export function App() {
  const [page, setPage] = useState<PageName>('rosa');
  const [view, setView] = useState<View>(null);
  const [gazViewer, setGazViewer] = useState<{ id: string; fromArchive: boolean } | null>(null);
  const [ptDialog, setPtDialog] = useState<string | null>(null);
  // la Bacheca resta aperta (o chiusa) passando da un giocatore all'altro, come in legacy
  const [bachecaOpen, setBachecaOpen] = useState(false);
  const q = useLeagueData();
  const qc = useQueryClient();
  const go = (p: PageName) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const close = useCallback(() => setView(null), []);
  const openPlayer = useCallback((id: string) => setView({ kind: 'player', id }), []);
  const openMatch = useCallback((id: string) => {
    setGazViewer(null);
    setView({ kind: 'match', id });
  }, []);
  const act: MatchActions = useMemo(
    () => ({
      openMatch,
      openGazzetta: (id, fromArchive) => setGazViewer({ id, fromArchive: !!fromArchive }),
      openPagelleText: setPtDialog,
    }),
    [openMatch],
  );
  const data = q.data;

  return (
    <AuthProvider>
    <ToastProvider>
      <ImageProvider>
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
        {data ? <RosaList data={data} onOpen={openPlayer} /> : <Loading q={q} />}
      </div>
      <div id="page-partita" className={`page${page === 'partita' ? ' active' : ''}`}>
        {data ? <GiocaPage data={data} /> : <Loading q={q} />}
      </div>
      <div id="page-partite" className={`page${page === 'partite' ? ' active' : ''}`}>
        {data ? <PartitePage data={data} act={act} onArchive={() => setView({ kind: 'gazArchive' })} /> : <Loading q={q} />}
      </div>
      <div id="page-classifiche" className={`page${page === 'classifiche' ? ' active' : ''}`}>
        {data ? <ClassifichePage data={data} onOpenPlayer={openPlayer} onOpenMatch={openMatch} /> : <Loading q={q} />}
      </div>
      <div id="page-settings" className={`page${page === 'settings' ? ' active' : ''}`}><AccountCard leagueId={data?.league.id} /></div>

      <BottomNav page={page} onGo={go} />

      {data && view?.kind === 'player' ? (
        <PlayerCard
          key={view.id}
          data={data}
          playerId={view.id}
          onClose={close}
          onOpenPlayer={openPlayer}
          onOpenMatch={openMatch}
          bachecaOpen={bachecaOpen}
          onToggleBacheca={() => setBachecaOpen((o) => !o)}
        />
      ) : null}
      {data && view?.kind === 'match' ? <MatchCard key={view.id} data={data} matchId={view.id} onClose={close} act={act} /> : null}
      {data && view?.kind === 'gazArchive' ? <GazArchive data={data} act={act} onClose={close} /> : null}
      {data && gazViewer ? (
        <GazViewer data={data} matchId={gazViewer.id} fromArchive={gazViewer.fromArchive} onClose={() => setGazViewer(null)} onGoToMatch={openMatch} />
      ) : null}
      {data && ptDialog ? <PagelleTextDialog data={data} matchId={ptDialog} onClose={() => setPtDialog(null)} /> : null}
      </ImageProvider>
    </ToastProvider>
    </AuthProvider>
  );
}
