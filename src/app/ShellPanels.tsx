import { PanelLayer } from './PanelLayer';
import { LoadingIndicator } from './LoadingIndicator';
import { LeagueAdminHub } from '../features/menu/LeagueAdminHub';
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
import { SuperAdminHub } from '../features/menu/SuperAdminHub';
import { PlayersHub } from '../features/menu/PlayersHub';
import { FeatureBoundary } from '../features/menu/FeatureBoundary';

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
export function ShellPanels({ panel, data, closePanel, leave, setPanel, go, openMatch, openPlayer }: {
  panel: Panel | null;
  data: LeagueData | undefined;
  /** Torna indietro (al menu o al pannello sotto). */
  closePanel: () => void;
  /** Esce del tutto: chiude pannello e menu. */
  leave: () => void;
  setPanel: (panel: Panel) => void;
  go: (page: PageName) => void;
  openMatch: (id: string, text?: boolean) => void;
  openPlayer: (id: string) => void;
}) {
  const { user } = useAuth();
  const superAdmin = useIsSuperAdmin(user?.id ?? null);
  const closeLeagueAdmin = () => setPanel('league-admin-hub');
  const closeSuperPanel = () => setPanel('superadmin-hub');
  const playersLayer = !!panel && ['players-hub', 'compare', 'couples', 'albo', 'records'].includes(panel);
  const leagueLayer = !!panel && ['league-admin-hub', 'members', 'invites', 'claims', 'merge', 'bench', 'admin-proposals'].includes(panel);
  const superLayer = !!panel && (['superadmin-hub', 'audit', 'platform-leagues', 'platform-users', 'premium'].includes(panel) || (superAdmin.data === true && ['game-settings', 'create-league'].includes(panel)));
  return (
    <>
      {data && leagueLayer ? <PanelLayer active={panel === 'league-admin-hub'}><LeagueAdminHub data={data} onClose={closePanel} onOpen={setPanel} /></PanelLayer> : null}
      {superLayer ? <PanelLayer active={panel === 'superadmin-hub'}><SuperAdminHub onClose={closePanel} onOpen={setPanel} hasLeague={!!data} /></PanelLayer> : null}
      {data && playersLayer ? <PanelLayer active={panel === 'players-hub'}><PlayersHub onClose={closePanel} onOpen={setPanel} /></PanelLayer> : null}
      {panel === 'create-league' ? <CreateLeagueSheet onClose={superAdmin.data === true ? closeSuperPanel : closePanel} /> : null}
      {panel === 'join-league' ? <JoinLeagueSheet onClose={closePanel} onJoined={() => { leave(); go('profilo'); }} /> : null}
      {panel === 'privacy' ? <PrivacyPanel onClose={closePanel} onDeleted={() => { setSelectedLeague(null); leave(); }} /> : null}
      {panel === 'help' ? <HelpPanel onClose={closePanel} /> : null}
      <Suspense fallback={<LoadingIndicator />}>
        {data && panel === 'game-settings' ? <GameSettingsGate data={data} onClose={superAdmin.data === true ? closeSuperPanel : closePanel} /> : null}
        {panel === 'audit' ? <AuditPanel onClose={closeSuperPanel} /> : null}
        {panel === 'platform-leagues' ? <PlatformLeaguesPanel onClose={closeSuperPanel} /> : null}
        {panel === 'platform-users' ? <PlatformUsersPanel onClose={closeSuperPanel} /> : null}
        {panel === 'premium' ? <PremiumPanel onClose={closeSuperPanel} /> : null}
      </Suspense>
      {data && panel === 'members' ? <MembersPanel data={data} onClose={closeLeagueAdmin} /> : null}
      {data && panel === 'invites' ? <InvitesPanel data={data} onClose={closeLeagueAdmin} /> : null}
      {data && panel === 'claims' ? <ClaimsPanel data={data} onClose={closeLeagueAdmin} /> : null}
      {data && panel === 'merge' ? <MergePanel data={data} onClose={closeLeagueAdmin} /> : null}

      {data && panel === 'compare' ? <FeatureBoundary feature="compare" onClose={() => setPanel('players-hub')}><ComparePanel data={data} onClose={() => setPanel('players-hub')} /></FeatureBoundary> : null}
      {data && panel === 'couples' ? <FeatureBoundary feature="couples" onClose={() => setPanel('players-hub')}><CouplesPanel data={data} onClose={() => setPanel('players-hub')} onOpenPlayer={(id) => { leave(); openPlayer(id); }} onOpenMatch={(id) => { leave(); openMatch(id); }} /></FeatureBoundary> : null}
      {data && panel === 'albo' ? <FeatureBoundary feature="albo" onClose={() => setPanel('players-hub')}><AlboPanel data={data} onClose={() => setPanel('players-hub')} onOpenPlayer={(id) => { leave(); openPlayer(id); }} onOpenMatch={(id) => { leave(); openMatch(id); }} /></FeatureBoundary> : null}
      {data && panel === 'records' ? <FeatureBoundary feature="records" onClose={() => setPanel('players-hub')}><RecordsPanel data={data} onClose={() => setPanel('players-hub')} onOpenPlayer={(id) => { leave(); openPlayer(id); }} onOpenMatch={(id) => { leave(); openMatch(id); }} /></FeatureBoundary> : null}
      {data && panel === 'bench' ? <BenchPanel data={data} onClose={closeLeagueAdmin} /> : null}
      {data && panel === 'pending' ? <PendingPanel data={data} onClose={closePanel} onOpenMatch={openMatch} /> : null}
      {data && panel === 'league-settings' ? <LeagueSettingsPanel data={data} onClose={closePanel} /> : null}
      <Suspense fallback={<LoadingIndicator />}>
        {data && panel === 'admin-proposals' ? <AdminProposalsPanel data={data} onClose={closeLeagueAdmin} /> : null}
      </Suspense>
    </>
  );
}
