import { lazy, Suspense } from 'react';
import { useAuth } from './auth';
import { setSelectedLeague } from './league';
import type { PageName } from './BottomNav';
import { useIsSuperAdmin } from '../data/leagues';
import type { LeagueData } from '../data/queries';
import type { Panel } from '../features/menu/MenuDrawer';
import { CreateLeagueSheet, JoinLeagueSheet } from '../features/menu/LeagueSheets';
import { LeagueSettingsPanel } from '../features/menu/LeagueSettingsPanel';
import { ClaimsPanel, InvitesPanel, MergePanel } from '../features/menu/LinkPanels';
import { MembersPanel } from '../features/menu/MembersPanel';
import { ComparePanel } from '../features/menu/ComparePanel';
import { AlboPanel, CouplesPanel, RecordsPanel } from '../features/menu/ExtraPanels';
import { BenchPanel } from '../features/menu/BenchPanel';
import { PendingPanel } from '../features/menu/PendingPanel';
import { HelpPanel, PrivacyPanel } from '../features/menu/OtherPanels';
import { PlayersHub } from '../features/menu/PlayersHub';

// I pannelli amministrativi si caricano quando vengono aperti.
const AuditPanel = lazy(() => import('../features/menu/AuditPanel').then((m) => ({ default: m.AuditPanel })));
const GameSettingsPanel = lazy(() => import('../features/menu/GameSettingsPanel').then((m) => ({ default: m.GameSettingsPanel })));
const AdminProposalsPanel = lazy(() => import('../features/menu/AdminPanels').then((m) => ({ default: m.AdminProposalsPanel })));
const PlatformLeaguesPanel = lazy(() => import('../features/menu/AdminPanels').then((m) => ({ default: m.PlatformLeaguesPanel })));
const PlatformUsersPanel = lazy(() => import('../features/menu/AdminPanels').then((m) => ({ default: m.PlatformUsersPanel })));
const PremiumPanel = lazy(() => import('../features/menu/AdminPanels').then((m) => ({ default: m.PremiumPanel })));

/** Regole di gioco: le cambia solo l'amministratore supremo, gli amministratori di lega le vedono. */
function GameSettingsGate({ data, onClose }: { data: LeagueData; onClose: () => void }) {
  const { user } = useAuth();
  const sup = useIsSuperAdmin(user?.id ?? null);
  return <GameSettingsPanel data={data} editable={sup.data === true} onClose={onClose} />;
}

/** Pannelli del menu: il chiamante mantiene solo la scelta e le azioni condivise. */
export function ShellPanels({ panel, data, closePanel, setPanel, go, openMatch, openPlayer }: {
  panel: Panel | null;
  data: LeagueData | undefined;
  closePanel: () => void;
  setPanel: (panel: Panel) => void;
  go: (page: PageName) => void;
  openMatch: (id: string, text?: boolean) => void;
  openPlayer: (id: string) => void;
}) {
  return (
    <>
      {panel === 'create-league' ? <CreateLeagueSheet onClose={closePanel} /> : null}
      {panel === 'join-league' ? <JoinLeagueSheet onClose={closePanel} onJoined={() => go('profilo')} /> : null}
      {panel === 'privacy' ? <PrivacyPanel onClose={closePanel} onDeleted={() => { setSelectedLeague(null); closePanel(); }} /> : null}
      {panel === 'help' ? <HelpPanel onClose={closePanel} /> : null}
      <Suspense fallback={<div role="status" className="card">Caricamento...</div>}>
        {data && panel === 'game-settings' ? <GameSettingsGate data={data} onClose={closePanel} /> : null}
        {panel === 'audit' ? <AuditPanel onClose={closePanel} /> : null}
        {panel === 'platform-leagues' ? <PlatformLeaguesPanel onClose={closePanel} /> : null}
        {panel === 'platform-users' ? <PlatformUsersPanel onClose={closePanel} /> : null}
        {panel === 'premium' ? <PremiumPanel onClose={closePanel} /> : null}
      </Suspense>
      {data && panel === 'members' ? <MembersPanel data={data} onClose={closePanel} /> : null}
      {data && panel === 'invites' ? <InvitesPanel data={data} onClose={closePanel} /> : null}
      {data && panel === 'claims' ? <ClaimsPanel data={data} onClose={closePanel} /> : null}
      {data && panel === 'merge' ? <MergePanel data={data} onClose={closePanel} /> : null}
      {data && panel === 'players-hub' ? <PlayersHub onClose={closePanel} onOpen={setPanel} /> : null}
      {data && panel === 'compare' ? <ComparePanel data={data} onClose={() => setPanel('players-hub')} /> : null}
      {data && panel === 'couples' ? <CouplesPanel data={data} onClose={() => setPanel('players-hub')} onOpenPlayer={(id) => { closePanel(); openPlayer(id); }} onOpenMatch={(id) => { closePanel(); openMatch(id); }} /> : null}
      {data && panel === 'albo' ? <AlboPanel data={data} onClose={() => setPanel('players-hub')} onOpenPlayer={(id) => { closePanel(); openPlayer(id); }} onOpenMatch={(id) => { closePanel(); openMatch(id); }} /> : null}
      {data && panel === 'records' ? <RecordsPanel data={data} onClose={() => setPanel('players-hub')} onOpenPlayer={(id) => { closePanel(); openPlayer(id); }} onOpenMatch={(id) => { closePanel(); openMatch(id); }} /> : null}
      {data && panel === 'bench' ? <BenchPanel data={data} onClose={closePanel} /> : null}
      {data && panel === 'pending' ? <PendingPanel data={data} onClose={closePanel} onOpenMatch={openMatch} /> : null}
      {data && panel === 'league-settings' ? <LeagueSettingsPanel data={data} onClose={closePanel} /> : null}
      <Suspense fallback={<div role="status" className="card">Caricamento...</div>}>
        {data && panel === 'admin-proposals' ? <AdminProposalsPanel data={data} onClose={closePanel} /> : null}
      </Suspense>
    </>
  );
}
