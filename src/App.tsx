import { useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react';
import { BottomNav, type PageName } from './app/BottomNav';
import { AuthProvider, useAuth, useRole } from './app/auth';
import { useIsSuperAdmin } from './data/leagues';
import { DialogProvider, usePrompt } from './app/Dialogs';
import { buildPath, HOME_PAGE, navigate, parsePath, rememberLeague, setSelectedLeague, type PageKey } from './app/league';
import { useToast } from './app/Toast';
import { createPlayer } from './data/mutations';
import { useQueryClient } from '@tanstack/react-query';
import { ImageProvider } from './app/ImageViewer';
import { ToastProvider } from './app/Toast';
import { LEAGUE_QUERY_KEY, NoLeagueError, photoUrl, rosterView, useLeagueData, type LeagueData } from './data/queries';
import { ClassifichePage } from './features/classifiche/ClassifichePage';
import { GiocaPage } from './features/gioca/GiocaPage';
import { SettingsPage } from './features/impostazioni/SettingsPage';
import { AuditPanel } from './features/menu/AuditPanel';
import { LoginPage } from './features/auth/LoginPage';
import { GameSettingsPanel } from './features/menu/GameSettingsPanel';
import { AdminProposalsPanel, PlatformLeaguesPanel, PlatformUsersPanel } from './features/menu/AdminPanels';
import { InvitePage } from './features/menu/InvitePage';
import { BenchPanel } from './features/menu/BenchPanel';
import { PendingPanel } from './features/menu/PendingPanel';
import { CreateLeagueSheet, JoinLeagueSheet } from './features/menu/LeagueSheets';
import { LeagueSettingsPanel } from './features/menu/LeagueSettingsPanel';
import { ClaimsPanel, InvitesPanel, MergePanel } from './features/menu/LinkPanels';
import { MembersPanel } from './features/menu/MembersPanel';
import { MenuDrawer, type Panel } from './features/menu/MenuDrawer';
import { EmptyLeagueGuide, HelpPanel, PrivacyPanel } from './features/menu/OtherPanels';
import { MatchCard } from './features/partite/MatchCard';
import { PartitePage } from './features/partite/PartitePage';
import { useMyPlayerIn } from './features/partite/parts';
import { ProfiloPage } from './features/profilo/ProfiloPage';
import { GazArchive, GazViewer, PagelleTextDialog, type MatchActions } from './features/partite/parts';
import { PlayerCard } from './features/player/PlayerCard';
import { AppHeader } from './app/AppHeader';
import { InstallHint } from './app/InstallHint';
import { PullToRefresh } from './app/PullToRefresh';
import { PushPrompt } from './app/PushPrompt';
import { RosaList } from './features/rosa/RosaList';

/** Gioca e scheda partita con i permessi di chi è entrato: la modifica si offre solo a chi può farla (il database la controlla comunque). */
function GiocaGate({ data }: { data: LeagueData }) {
  const { isAdmin } = useRole(data.league.id);
  const roster = useMemo(() => rosterView(data), [data]);
  return <GiocaPage data={roster} canCreate={isAdmin} />;
}
/** Rosa: per l'amministratore c'è anche "+ Aggiungi giocatore" (e la guida se la lega è vuota). */
function RosaGate({ data, onOpen }: { data: LeagueData; onOpen: (id: string) => void }) {
  const { isAdmin } = useRole(data.league.id);
  const prompt = usePrompt();
  const toast = useToast();
  const qc = useQueryClient();
  const roster = useMemo(() => rosterView(data), [data]);
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
      {isAdmin && !roster.dataset.players.length ? <EmptyLeagueGuide data={data} onAddNew={() => void add()} /> : null}
      <RosaList data={roster} onOpen={onOpen} onAdd={isAdmin ? () => void add() : undefined} />
    </>
  );
}
function PlayerCardGate({ editable, ...props }: ComponentProps<typeof PlayerCard> & { editable: boolean }) {
  const { isAdmin } = useRole(props.data.league.id);
  return <PlayerCard {...props} canEdit={isAdmin && editable} />;
}
function MatchCardGate(props: ComponentProps<typeof MatchCard>) {
  const { isAdmin, canEditText } = useRole(props.data.league.id);
  return <MatchCard {...props} canEdit={isAdmin} canEditText={canEditText && !isAdmin} />;
}

/** Regole di gioco: le cambia solo l'amministratore supremo, gli amministratori di lega le vedono. */
function GameSettingsGate({ data, onClose }: { data: LeagueData; onClose: () => void }) {
  const { user } = useAuth();
  const sup = useIsSuperAdmin(user?.id ?? null);
  return <GameSettingsPanel data={data} editable={sup.data === true} onClose={onClose} />;
}

/** Messaggio al posto di una pagina mentre i dati si caricano o se non arrivano; senza leghe, come entrare. */
function Loading({ q, onPanel }: { q: { isError: boolean; error?: unknown; refetch: () => unknown }; onPanel: (p: Panel) => void }) {
  const { user } = useAuth();
  const canCreate = useIsSuperAdmin(user?.id ?? null).data === true; // per ora le leghe le crea solo l'amministratore supremo
  if (q.error instanceof NoLeagueError) {
    return (
      <div className="card" id="no-league">
        <div className="section-header">👋 Benvenuto in CalcioLercio</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text2)' }}>
          Non fai ancora parte di nessuna lega. Le leghe si vedono solo su invito: apri il <b>link personale</b> che ti ha mandato un amministratore, oppure entra con il <b>codice d’invito</b>. Puoi anche creare una nuova lega.
        </div>
        <button type="button" className="f-btn" id="no-league-join" onClick={() => onPanel('join-league')}>🔑 Entra con un codice</button>
        {canCreate ? <button type="button" className="btn btn-secondary btn-full" id="no-league-create" style={{ marginTop: 8 }} onClick={() => onPanel('create-league')}>＋ Crea una nuova lega</button> : null}
      </div>
    );
  }
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
type View = { kind: 'player'; id: string; fromRosa?: boolean } | { kind: 'match'; id: string; text?: boolean } | { kind: 'gazArchive' } | null;

/** La pagina scritta nell'indirizzo, se c'è. */
const pageFromPath = (): PageName | null => parsePath(window.location.pathname).page as PageKey | null;

function Shell() {
  const [chosen, setChosen] = useState<PageName | null>(pageFromPath); // null = nessuna scelta: si parte dalla pagina iniziale
  const [view, setView] = useState<View>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(() => parsePath(window.location.pathname).invite);
  const [gazViewer, setGazViewer] = useState<{ id: string; fromArchive: boolean } | null>(null);
  const [ptDialog, setPtDialog] = useState<string | null>(null);
  // la Bacheca resta aperta (o chiusa) passando da un giocatore all'altro, come in legacy
  const [bachecaOpen, setBachecaOpen] = useState(false);
  const q = useLeagueData();
  const data = q.data;
  // «Gioca» (nuova partita) è solo per gli amministratori della lega: agli altri la scheda non c'è, e l'indirizzo /gioca li porta alla pagina iniziale
  const { isAdmin, ready } = useRole(data?.league.id);
  const me = useMyPlayerIn(data); // la mia faccia (o foto) nel footer
  // pagina iniziale: Classifiche; una lega ancora vuota si apre sulla Rosa (lì c'è la guida «Aggiungi i giocatori»)
  const [autoPage, setAutoPage] = useState<PageName | null>(null); // scelta automatica fatta una volta sola, all'apertura
  if (data && !chosen && autoPage === null) setAutoPage(!rosterView(data).dataset.players.length ? 'rosa' : HOME_PAGE);
  const wanted: PageName = chosen ?? autoPage ?? HOME_PAGE;
  const page: PageName = wanted === 'partita' && ready && !isAdmin ? HOME_PAGE : wanted;
  const go = (p: PageName) => {
    setChosen(p);
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
  const openMatch = useCallback((id: string, text?: boolean) => {
    setGazViewer(null);
    setView({ kind: 'match', id, text });
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
      <AppHeader data={data} onMenu={() => setMenuOpen(true)} onHome={() => go(HOME_PAGE)} />

      <PullToRefresh />
      <InstallHint />
      <PushPrompt />
      <div id="page-profilo" className={`page${page === 'profilo' ? ' active' : ''}`}>
        {data ? <ProfiloPage data={data} active={page === 'profilo'} act={act} /> : <Loading q={q} onPanel={setPanel} />}
      </div>
      <div id="page-rosa" className={`page${page === 'rosa' ? ' active' : ''}`}>
        {data ? <RosaGate data={data} onOpen={openPlayerFromRosa} /> : <Loading q={q} onPanel={setPanel} />}
      </div>
      {isAdmin ? (
        <div id="page-partita" className={`page${page === 'partita' ? ' active' : ''}`}>
          {data ? <GiocaGate data={data} /> : <Loading q={q} onPanel={setPanel} />}
        </div>
      ) : null}
      <div id="page-partite" className={`page${page === 'partite' ? ' active' : ''}`}>
        {data ? <PartitePage data={data} act={act} active={page === 'partite'} onArchive={() => setView({ kind: 'gazArchive' })} /> : <Loading q={q} onPanel={setPanel} />}
      </div>
      <div id="page-classifiche" className={`page${page === 'classifiche' ? ' active' : ''}`}>
        {data ? <ClassifichePage data={data} onOpenPlayer={openPlayer} onOpenMatch={openMatch} /> : <Loading q={q} onPanel={setPanel} />}
      </div>
      <div id="page-settings" className={`page${page === 'settings' ? ' active' : ''}`}><SettingsPage data={data} /></div>

      <BottomNav page={page} onGo={go} canPlay={isAdmin} me={me ? { photo: photoUrl(data?.photos[me.id]), initial: me.name.slice(0, 1).toUpperCase() } : null} />

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
      {data && view?.kind === 'match' ? <MatchCardGate key={view.id} data={data} matchId={view.id} startText={view.text} onClose={close} act={act} /> : null}
      {data && view?.kind === 'gazArchive' ? <GazArchive data={data} act={act} onClose={close} /> : null}
      {data && gazViewer ? (
        <GazViewer data={data} matchId={gazViewer.id} fromArchive={gazViewer.fromArchive} onClose={() => setGazViewer(null)} onGoToMatch={openMatch} />
      ) : null}
      {data && ptDialog ? <PagelleTextDialog data={data} matchId={ptDialog} onClose={() => setPtDialog(null)} /> : null}

      {menuOpen ? <MenuDrawer data={data} onClose={closeMenu} onOpenPanel={(p) => (p === 'profile' ? go('profilo') : setPanel(p))} onGoSettings={() => go('settings')} onOpenMatch={openMatch} /> : null}
      {panel === 'create-league' ? <CreateLeagueSheet onClose={closePanel} /> : null}
      {panel === 'join-league' ? <JoinLeagueSheet onClose={closePanel} onJoined={() => go('profilo')} /> : null}
      {panel === 'privacy' ? <PrivacyPanel onClose={closePanel} onDeleted={() => { setSelectedLeague(null); closePanel(); }} /> : null}
      {panel === 'help' ? <HelpPanel onClose={closePanel} /> : null}
      {data && panel === 'game-settings' ? <GameSettingsGate data={data} onClose={closePanel} /> : null}
      {panel === 'audit' ? <AuditPanel onClose={closePanel} /> : null}
      {panel === 'platform-leagues' ? <PlatformLeaguesPanel onClose={closePanel} /> : null}
      {panel === 'platform-users' ? <PlatformUsersPanel onClose={closePanel} /> : null}
      {data && panel === 'members' ? <MembersPanel data={data} onClose={closePanel} /> : null}
      {data && panel === 'invites' ? <InvitesPanel data={data} onClose={closePanel} /> : null}
      {data && panel === 'claims' ? <ClaimsPanel data={data} onClose={closePanel} /> : null}
      {data && panel === 'merge' ? <MergePanel data={data} onClose={closePanel} /> : null}
      {data && panel === 'bench' ? <BenchPanel data={data} onClose={closePanel} /> : null}
      {data && panel === 'pending' ? <PendingPanel data={data} onClose={closePanel} onOpenMatch={openMatch} /> : null}
      {data && panel === 'league-settings' ? <LeagueSettingsPanel data={data} onClose={closePanel} /> : null}
      {data && panel === 'admin-proposals' ? <AdminProposalsPanel data={data} onClose={closePanel} /> : null}

      {inviteToken ? (
        <InvitePage
          token={inviteToken}
          onDone={(a) => {
            if (a) setSelectedLeague(a.leagueSlug);
            setInviteToken(null);
            navigate(a ? buildPath(a.leagueSlug, HOME_PAGE) : '/', true);
            if (a) go('profilo');
          }}
        />
      ) : null}
    </>
  );
}

/** Chi non è loggato vede solo la pagina d'accesso (tranne dal link d'invito, che ha il suo modulo). Con «imposta la password» si resta qui finché non è salvata. */
function Gate() {
  const { user, loading, recovery } = useAuth();
  const invite = parsePath(window.location.pathname).invite;
  if (loading) return <LoginPage waiting />;
  if (recovery || (!user && !invite)) return <LoginPage />;
  return <Shell />;
}

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ImageProvider>
          <DialogProvider>
            <Gate />
          </DialogProvider>
        </ImageProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
