import { AdminIcon, type AdminIconName } from './AdminIcon';
import { Sheet } from '../../app/Sheet';
import { useAuth } from '../../app/auth';
import { useIsSuperAdmin } from '../../data/leagues';
import type { Panel } from './MenuDrawer';

export function SuperAdminHub({ onClose, onOpen, hasLeague }: { onClose: () => void; onOpen: (panel: Panel) => void; hasLeague: boolean }) {
  const { user } = useAuth();
  const superAdmin = useIsSuperAdmin(user?.id ?? null);
  if (superAdmin.data !== true) return null;
  const items: { panel: Panel; icon: AdminIconName; title: string; description: string; color: string }[] = [
    { panel: 'create-league', icon: 'plus', title: 'Crea nuova lega', description: 'Aggiungi una lega alla piattaforma', color: 'premium-tile-trial' },
    { panel: 'game-settings', icon: 'settings', title: 'Regole di gioco', description: 'Formazioni, forma recente e pesi', color: 'player-tile-records' },
    { panel: 'audit', icon: 'audit', title: 'Registro attività', description: 'Cerca ed esporta le azioni', color: 'player-tile-awards' },
    { panel: 'platform-leagues', icon: 'leagues', title: 'Tutte le leghe', description: 'Gestisci le leghe della piattaforma', color: 'premium-tile-trial' },
    { panel: 'platform-users', icon: 'users', title: 'Utenti', description: 'Gestisci gli account', color: 'premium-tile-users' },
    { panel: 'premium', icon: 'premium', title: 'Premium', description: 'Accessi e funzionalità Premium', color: 'player-tile-awards' },
  ];
  return <Sheet title="SUPERADMIN" onClose={onClose} id="sheet-superadmin-hub">
    <div className="premium-tiles">{items.map((item) => <button type="button" id={item.panel === 'create-league' ? 'menu-create' : 'menu-' + item.panel} key={item.panel} className={'premium-tile ' + item.color} disabled={item.panel === 'game-settings' && !hasLeague} onClick={() => onOpen(item.panel)}>
      <span><AdminIcon name={item.icon} /></span><b>{item.title}</b><small>{item.panel === 'game-settings' && !hasLeague ? 'Seleziona prima una lega' : item.description}</small>
    </button>)}</div>
  </Sheet>;
}
