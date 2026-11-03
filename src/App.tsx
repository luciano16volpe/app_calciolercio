import { useMemo, type ComponentProps } from 'react';
import { BottomNav } from './app/BottomNav';
import { useShellNavigation } from './app/useShellNavigation';
import { useShellWindows } from './app/useShellWindows';
import { useAuth, useRole } from './app/auth';
import { useIsSuperAdmin } from './data/leagues';
import { DialogProvider, usePrompt } from './app/Dialogs';
import { buildPath, HOME_PAGE, navigate, parsePath, setSelectedLeague } from './app/league';
import { useToast } from './app/Toast';
import { createPlayer } from './data/mutations';
import { useQueryClient } from '@tanstack/react-query';
import { ImageProvider } from './app/ImageViewer';
import { LEAGUE_QUERY_KEY, NoLeagueError, photoUrl, rosterView, useLeagueData, type LeagueData } from './data/queries';
import { ClassifichePage } from './features/classifiche/ClassifichePage';
import { GiocaPage } from './features/gioca/GiocaPage';
import { SettingsPage } from './features/impostazioni/SettingsPage';
import { LoginPage } from './features/auth/LoginPage';
import { InvitePage } from './features/menu/InvitePage';
import { MenuDrawer, type Panel } from './features/menu/MenuDrawer';
import { EmptyLeagueGuide } from './features/menu/OtherPanels';
import { ShellPanels } from './app/ShellPanels';
import { MatchCard } from './features/partite/MatchCard';
import { PartitePage } from './features/partite/PartitePage';
import { useMyPlayerIn } from './features/partite/parts';
import { ProfiloPage } from './features/profilo/ProfiloPage';
import { GazArchive, GazViewer, PagelleTextDialog } from './features/partite/parts';
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

function Shell() {
  const { view, setView, menuOpen, setMenuOpen, panel, setPanel, inviteToken, setInviteToken,
    gazViewer, setGazViewer, ptDialog, setPtDialog, bachecaOpen, setBachecaOpen,
    close, openPlayer, openPlayerFromRosa, openMatch, act, closePanel, closeMenu } = useShellWindows();
  const q = useLeagueData();
  const data = q.data;
  // «Gioca» (nuova partita) è solo per gli amministratori della lega: agli altri la scheda non c'è, e l'indirizzo /gioca li porta alla pagina iniziale
  const { isAdmin, ready } = useRole(data?.league.id);
  const me = useMyPlayerIn(data); // la mia faccia (o foto) nel footer
  const { page, go } = useShellNavigation(data, isAdmin, ready, inviteToken);

  return (
    <>
      <AppHeader data={data} onMenu={() => setMenuOpen(true)} />

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

      {menuOpen ? <MenuDrawer data={data} onClose={closeMenu} onOpenPanel={setPanel} onGoSettings={() => go('settings')} onOpenMatch={openMatch} /> : null}
      <ShellPanels panel={panel} data={data} closePanel={closePanel} go={go} openMatch={openMatch} />

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
    <ImageProvider>
      <DialogProvider>
        <Gate />
      </DialogProvider>
    </ImageProvider>
  );
}
