import { useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react';
import { BottomNav, type PageName } from './app/BottomNav';
import { AuthProvider, useRole } from './app/auth';
import { DialogProvider, usePrompt } from './app/Dialogs';
import { buildPath, navigate, parsePath, rememberLeague, setSelectedLeague, type PageKey } from './app/league';
import { useToast } from './app/Toast';
import { createPlayer } from './data/mutations';
import { useQueryClient } from '@tanstack/react-query';
import { ImageProvider } from './app/ImageViewer';
import { ToastProvider } from './app/Toast';
import { LEAGUE_QUERY_KEY, useLeagueData, type LeagueData } from './data/queries';
import { ClassifichePage } from './features/classifiche/ClassifichePage';
import { GiocaPage } from './features/gioca/GiocaPage';
import { SettingsPage } from './features/impostazioni/SettingsPage';
import { AdminProposalsPanel, PlatformLeaguesPanel, PlatformUsersPanel } from './features/menu/AdminPanels';
import { InvitePage } from './features/menu/InvitePage';
import { CreateLeagueSheet, JoinLeagueSheet } from './features/menu/LeagueSheets';
import { LeagueSettingsPanel } from './features/menu/LeagueSettingsPanel';
import { ClaimsPanel, InvitesPanel, MergePanel } from './features/menu/LinkPanels';
import { MembersPanel } from './features/menu/MembersPanel';
import { MenuDrawer, type Panel } from './features/menu/MenuDrawer';
import { EmptyLeagueGuide, HelpPanel, PrivacyPanel, ProfilePanel } from './features/menu/OtherPanels';
import { MatchCard } from './features/partite/MatchCard';
import { PartitePage } from './features/partite/PartitePage';
import { GazArchive, GazViewer, PagelleTextDialog, type MatchActions } from './features/partite/parts';
import { PlayerCard } from './features/player/PlayerCard';
import { InstallHint } from './features/rosa/InstallHint';
import { RosaList } from './features/rosa/RosaList';

/** Gioca e scheda partita con i permessi di chi è entrato: la modifica si offre solo a chi può farla (il database la controlla comunque). */
function GiocaGate({ data }: { data: LeagueData }) {
  const { isAdmin } = useRole(data.league.id);
  return <GiocaPage data={data} canCreate={isAdmin} />;
}
/** Rosa: per l'amministratore c'è anche "+ Aggiungi giocatore" (e la guida se la lega è vuota). */
function RosaGate({ data, onOpen }: { data: LeagueData; onOpen: (id: string) => void }) {
  const { isAdmin } = useRole(data.league.id);
  const prompt = usePrompt();
  const toast = useToast();
  const qc = useQueryClient();
  const add = async () => {
    const nome = await prompt({ icon: '➕', title: 'Nuovo giocatore', lines: ['Inserisci il nome (non sarà modificabile in seguito).'], okLabel: 'Aggiungi', input: { placeholder: 'Es. Marco' } });
    if (nome === null) return; // annullato
    if (!nome.trim()) return toast('Nome non valido');
    try {
      await createPlayer(data.league.id, nome.trim());
      await qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY });
      toast('Giocatore aggiunto');
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    }
  };
  return (
    <>
      {isAdmin && !data.dataset.players.length ? <EmptyLeagueGuide data={data} onAddNew={() => void add()} /> : null}
      <RosaList data={data} onOpen={onOpen} onAdd={isAdmin ? () => void add() : undefined} />
    </>
  );
}
function PlayerCardGate({ editable, ...props }: ComponentProps<typeof PlayerCard> & { editable: boolean }) {
  const { isAdmin } = useRole(props.data.league.id);
  return <PlayerCard {...props} canEdit={isAdmin && editable} />;
}
function MatchCardGate(props: ComponentProps<typeof MatchCard>) {
  const { isAdmin } = useRole(props.data.league.id);
  return <MatchCard {...props} canEdit={isAdmin} />;
}

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
type View = { kind: 'player'; id: string; fromRosa?: boolean } | { kind: 'match'; id: string } | { kind: 'gazArchive' } | null;

const pageFromPath = (): PageName => (parsePath(window.location.pathname).page as PageKey | null) ?? 'rosa';

function Shell() {
  const [page, setPage] = useState<PageName>(pageFromPath);
  const [view, setView] = useState<View>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(() => parsePath(window.location.pathname).invite);
  const [gazViewer, setGazViewer] = useState<{ id: string; fromArchive: boolean } | null>(null);
  const [ptDialog, setPtDialog] = useState<string | null>(null);
  // la Bacheca resta aperta (o chiusa) passando da un giocatore all'altro, come in legacy
  const [bachecaOpen, setBachecaOpen] = useState(false);
  const q = useLeagueData();
  const qc = useQueryClient();
  const data = q.data;
  const go = (p: PageName) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  // la lega e la pagina stanno nell'indirizzo (/l/<slug>/<pagina>): i link condivisi aprono la lega giusta
  useEffect(() => {
    if (data && !inviteToken) {
      navigate(buildPath(data.league.slug, page), true);
      rememberLeague(data.league.slug);
    }
  }, [data?.league.slug, page, inviteToken]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = useCallback(() => setView(null), []);
  const openPlayer = useCallback((id: string) => setView({ kind: 'player', id }), []);
  const openPlayerFromRosa = useCallback((id: string) => setView({ kind: 'player', id, fromRosa: true }), []);
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
  const closePanel = useCallback(() => setPanel(null), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <>
      <header>
        <button type="button" className="hb" id="menu-button" aria-label="Apri il menu" onClick={() => setMenuOpen(true)}>☰</button>
        <div className="logo" onClick={() => go('rosa')} style={{ cursor: 'pointer' }}>
          <img src="/logo.png" alt="CalcioLercio" style={{ width: 44, height: 44, display: 'block', objectFit: 'contain' }} />
          CalcioLercio
        </div>
        {data ? <button type="button" className="lg-pill" id="league-pill" onClick={() => setMenuOpen(true)} aria-label={`Lega attiva: ${data.league.name}. Cambia lega`}>{data.league.name} ▾</button> : null}
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
        {data ? <RosaGate data={data} onOpen={openPlayerFromRosa} /> : <Loading q={q} />}
      </div>
      <div id="page-partita" className={`page${page === 'partita' ? ' active' : ''}`}>
        {data ? <GiocaGate data={data} /> : <Loading q={q} />}
      </div>
      <div id="page-partite" className={`page${page === 'partite' ? ' active' : ''}`}>
        {data ? <PartitePage data={data} act={act} onArchive={() => setView({ kind: 'gazArchive' })} /> : <Loading q={q} />}
      </div>
      <div id="page-classifiche" className={`page${page === 'classifiche' ? ' active' : ''}`}>
        {data ? <ClassifichePage data={data} onOpenPlayer={openPlayer} onOpenMatch={openMatch} /> : <Loading q={q} />}
      </div>
      <div id="page-settings" className={`page${page === 'settings' ? ' active' : ''}`}><SettingsPage data={data} /></div>

      <BottomNav page={page} onGo={go} />

      {data && view?.kind === 'player' ? (
        <PlayerCardGate
          editable={!!view.fromRosa}
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
      {data && view?.kind === 'match' ? <MatchCardGate key={view.id} data={data} matchId={view.id} onClose={close} act={act} /> : null}
      {data && view?.kind === 'gazArchive' ? <GazArchive data={data} act={act} onClose={close} /> : null}
      {data && gazViewer ? (
        <GazViewer data={data} matchId={gazViewer.id} fromArchive={gazViewer.fromArchive} onClose={() => setGazViewer(null)} onGoToMatch={openMatch} />
      ) : null}
      {data && ptDialog ? <PagelleTextDialog data={data} matchId={ptDialog} onClose={() => setPtDialog(null)} /> : null}

      {menuOpen ? <MenuDrawer data={data} onClose={closeMenu} onOpenPanel={setPanel} onGoSettings={() => go('settings')} onOpenMatch={openMatch} /> : null}
      {panel === 'create-league' ? <CreateLeagueSheet onClose={closePanel} /> : null}
      {panel === 'join-league' ? <JoinLeagueSheet onClose={closePanel} onJoined={() => setPanel('profile')} /> : null}
      {panel === 'privacy' ? <PrivacyPanel onClose={closePanel} onDeleted={() => { setSelectedLeague(null); closePanel(); }} /> : null}
      {panel === 'help' ? <HelpPanel onClose={closePanel} /> : null}
      {panel === 'platform-leagues' ? <PlatformLeaguesPanel onClose={closePanel} /> : null}
      {panel === 'platform-users' ? <PlatformUsersPanel onClose={closePanel} /> : null}
      {data && panel === 'profile' ? <ProfilePanel data={data} onClose={closePanel} /> : null}
      {data && panel === 'members' ? <MembersPanel data={data} onClose={closePanel} /> : null}
      {data && panel === 'invites' ? <InvitesPanel data={data} onClose={closePanel} /> : null}
      {data && panel === 'claims' ? <ClaimsPanel data={data} onClose={closePanel} /> : null}
      {data && panel === 'merge' ? <MergePanel data={data} onClose={closePanel} /> : null}
      {data && panel === 'league-settings' ? <LeagueSettingsPanel data={data} onClose={closePanel} /> : null}
      {data && panel === 'admin-proposals' ? <AdminProposalsPanel data={data} onClose={closePanel} /> : null}

      {inviteToken ? (
        <InvitePage
          token={inviteToken}
          onDone={(a) => {
            if (a) setSelectedLeague(a.leagueSlug);
            setInviteToken(null);
            navigate(a ? buildPath(a.leagueSlug, 'rosa') : '/', true);
            if (a) setPanel('profile');
          }}
        />
      ) : null}
    </>
  );
}

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ImageProvider>
          <DialogProvider>
            <Shell />
          </DialogProvider>
        </ImageProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
