import { LoadingIndicator } from './app/LoadingIndicator';
import { lazy, useMemo, type ComponentProps } from 'react';
import { BottomNav } from './app/BottomNav';
import { useShellNavigation } from './app/useShellNavigation';
import { useShellWindows } from './app/useShellWindows';
import { useAuth, useRole } from './app/auth';
import { useIsSuperAdmin } from './data/leagues';
import { useMyPremium } from './data/premium';
import { DialogProvider, usePrompt } from './app/Dialogs';
import { buildPath, HOME_PAGE, navigate, parsePath, setSelectedLeague } from './app/league';
import { useToast } from './app/Toast';
import { createPlayer } from './data/mutations';
import { useQueryClient } from '@tanstack/react-query';
import { ImageProvider } from './app/ImageViewer';
import { LEAGUE_ROSTER_QUERY_KEY, NoLeagueError, photoUrl, rosterView, useLeagueData, type LeagueData } from './data/queries';
import { LoginPage } from './features/auth/LoginPage';
import type { Panel } from './features/menu/MenuDrawer';
import { useMyPlayerIn } from './app/useMyPlayerIn';
import { DeferredPage, LazyContent } from './app/LazyContent';
import { AppHeader } from './app/AppHeader';
import { InstallHint } from './app/InstallHint';
import { PullToRefresh } from './app/PullToRefresh';
import { PushPrompt } from './app/PushPrompt';
import { PremiumTrialBanner } from './app/PremiumTrialBanner';


const ClassifichePage = lazy(() => import('./features/classifiche/ClassifichePage').then((m) => ({ default: m.ClassifichePage })));
const GiocaPage = lazy(() => import('./features/gioca/GiocaPage').then((m) => ({ default: m.GiocaPage })));
const SettingsPage = lazy(() => import('./features/impostazioni/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const InvitePage = lazy(() => import('./features/menu/InvitePage').then((m) => ({ default: m.InvitePage })));
const LeagueInvitePage = lazy(() => import('./features/menu/LeagueInvitePage').then((m) => ({ default: m.LeagueInvitePage })));
const MenuDrawer = lazy(() => import('./features/menu/MenuDrawer').then((m) => ({ default: m.MenuDrawer })));
const EmptyLeagueGuide = lazy(() => import('./features/menu/OtherPanels').then((m) => ({ default: m.EmptyLeagueGuide })));
const ShellPanels = lazy(() => import('./app/ShellPanels').then((m) => ({ default: m.ShellPanels })));
const MatchCard = lazy(() => import('./features/partite/MatchCard').then((m) => ({ default: m.MatchCard })));
const PartitePage = lazy(() => import('./features/partite/PartitePage').then((m) => ({ default: m.PartitePage })));
const ProfiloPage = lazy(() => import('./features/profilo/ProfiloPage').then((m) => ({ default: m.ProfiloPage })));
const GazArchive = lazy(() => import('./features/partite/parts').then((m) => ({ default: m.GazArchive })));
const GazViewer = lazy(() => import('./features/partite/parts').then((m) => ({ default: m.GazViewer })));
const PagelleTextDialog = lazy(() => import('./features/partite/parts').then((m) => ({ default: m.PagelleTextDialog })));
const PlayerCard = lazy(() => import('./features/player/PlayerCard').then((m) => ({ default: m.PlayerCard })));
const RosaList = lazy(() => import('./features/rosa/RosaList').then((m) => ({ default: m.RosaList })));

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
      await qc.invalidateQueries({ queryKey: LEAGUE_ROSTER_QUERY_KEY });
      toast('Giocatore aggiunto');
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    }
  };
  return (
    <>
      {isAdmin && !roster.dataset.players.length ? <EmptyLeagueGuide onAddNew={() => void add()} /> : null}
      <RosaList data={roster} onOpen={onOpen} onAdd={isAdmin ? () => void add() : undefined} />
    </>
  );
}
function PlayerCardGate({ editable, ...props }: ComponentProps<typeof PlayerCard> & { editable: boolean }) {
  const { isAdmin } = useRole(props.data.league.id);
  return <PlayerCard {...props} canEdit={isAdmin && editable} />;
}
function MatchCardGate(props: ComponentProps<typeof MatchCard>) {
  const { isAdmin, isPremiumAdmin, canEditText } = useRole(props.data.league.id);
  return <MatchCard {...props} canEdit={isAdmin} canGazzetta={!isAdmin || isPremiumAdmin} canEditText={canEditText && !isAdmin} />;
}

/** Messaggio al posto di una pagina mentre i dati si caricano o se non arrivano; senza leghe, come entrare. */
function Loading({ q, onPanel }: { q: { isError: boolean; error?: unknown; refetch: () => unknown }; onPanel: (p: Panel) => void }) {
  const { user } = useAuth();
  const canCreate = useIsSuperAdmin(user?.id ?? null).data === true;
  const canRequest = useMyPremium(user?.id ?? null).data?.active === true;
  if (q.error instanceof NoLeagueError) {
    return (
      <div className="card" id="no-league">
        <div className="section-header">👋 Benvenuto in CalcioLercio</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text2)' }}>
          Non fai ancora parte di nessuna lega. Le leghe si vedono solo su invito: apri il <b>link personale</b> che ti ha mandato un amministratore, oppure entra con il <b>codice d’invito</b>. Puoi anche creare una nuova lega.
        </div>
        <button type="button" className="f-btn" id="no-league-join" onClick={() => onPanel('join-league')}>🔑 Entra con un codice</button>
        {canCreate || canRequest ? <button type="button" className="btn btn-secondary btn-full" id="no-league-create" style={{ marginTop: 8 }} onClick={() => onPanel('create-league')}>{canCreate ? '＋ Crea una nuova lega' : '＋ Richiedi una nuova lega'}</button> : null}
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
  return <LoadingIndicator />;
}

function Shell() {
  const { view, setView, menuOpen, setMenuOpen, panel, setPanel, inviteToken, setInviteToken, inviteKind,
    gazViewer, setGazViewer, ptDialog, setPtDialog, bachecaOpen, setBachecaOpen,
    close, openPlayer, openPlayerFromRosa, openMatch, act, closePanel, closeMenu } = useShellWindows();
  const q = useLeagueData();
  const data = q.data;
  // «Gioca» (nuova partita) è solo per gli amministratori della lega: agli altri la scheda non c'è, e l'indirizzo /gioca li porta alla pagina iniziale
  const { isAdmin, ready } = useRole(data?.league.id);
  const me = useMyPlayerIn(data); // la mia faccia (o foto) nel footer
  const { page, go } = useShellNavigation(data, isAdmin, ready, inviteToken);
  const visualsActive = !view && !gazViewer && !ptDialog && !menuOpen && !panel && !inviteToken;

  return (
    <>
      <AppHeader data={data} onMenu={() => setMenuOpen(true)} />

      <PremiumTrialBanner />

      <PullToRefresh />
      <InstallHint />
      <PushPrompt />
      <div id="page-profilo" data-visual-active={visualsActive} className={`page${page === 'profilo' ? ' active' : ''}`}><DeferredPage active={page === 'profilo'}>
        {data ? <ProfiloPage data={data} active={page === 'profilo' && visualsActive} act={act} /> : <Loading q={q} onPanel={setPanel} />}
      </DeferredPage></div>
      <div id="page-rosa" data-visual-active={visualsActive} className={`page${page === 'rosa' ? ' active' : ''}`}><DeferredPage active={page === 'rosa'}>
        {data ? <RosaGate data={data} onOpen={openPlayerFromRosa} /> : <Loading q={q} onPanel={setPanel} />}
      </DeferredPage></div>
      {isAdmin ? (
        <div id="page-partita" data-visual-active={visualsActive} className={`page${page === 'partita' ? ' active' : ''}`}><DeferredPage active={page === 'partita'}>
          {data ? <GiocaGate data={data} /> : <Loading q={q} onPanel={setPanel} />}
        </DeferredPage></div>
      ) : null}
      <div id="page-partite" data-visual-active={visualsActive} className={`page${page === 'partite' ? ' active' : ''}`}><DeferredPage active={page === 'partite'}>
        {data ? <PartitePage data={data} act={act} active={page === 'partite' && visualsActive} onArchive={() => setView({ kind: 'gazArchive' })} /> : <Loading q={q} onPanel={setPanel} />}
      </DeferredPage></div>
      <div id="page-classifiche" data-visual-active={visualsActive} className={`page${page === 'classifiche' ? ' active' : ''}`}><DeferredPage active={page === 'classifiche'}>
        {data ? <ClassifichePage data={data} onOpenPlayer={openPlayer} active={page === 'classifiche'} /> : <Loading q={q} onPanel={setPanel} />}
      </DeferredPage></div>
      <div id="page-settings" data-visual-active={visualsActive} className={`page${page === 'settings' ? ' active' : ''}`}><DeferredPage active={page === 'settings'}><SettingsPage data={data} /></DeferredPage></div>

      <BottomNav page={page} onGo={go} canPlay={isAdmin} me={me ? { photo: photoUrl(data?.photos[me.id]), initial: me.name.slice(0, 1).toUpperCase() } : null} />

      <LazyContent>
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

      {menuOpen ? <MenuDrawer data={data} onClose={closeMenu} covered={!!panel} onOpenPanel={setPanel} onGoSettings={() => go('settings')} onOpenMatch={openMatch} /> : null}
      {panel ? (
        <ShellPanels
          panel={panel} data={data} closePanel={closePanel} setPanel={setPanel}
          leave={() => { closeMenu(); closePanel(); }}
          go={(p) => { closeMenu(); go(p); }}
          openMatch={(id, text) => { closeMenu(); openMatch(id, text); }}
          openPlayer={(id) => { closeMenu(); openPlayer(id); }}
        />
      ) : null}

      {inviteToken && inviteKind === 'league' ? (
        <LeagueInvitePage
          token={inviteToken}
          onDone={(a) => {
            if (a) setSelectedLeague(a.leagueSlug);
            setInviteToken(null);
            navigate(a ? buildPath(a.leagueSlug, HOME_PAGE) : '/', true);
            if (a) go('profilo');
          }}
        />
      ) : inviteToken ? (
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
      </LazyContent>
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
    <ImageProvider>
      <DialogProvider>
        <Gate />
      </DialogProvider>
    </ImageProvider>
  );
}
