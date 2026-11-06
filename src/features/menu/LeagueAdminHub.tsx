import { Sheet } from '../../app/Sheet';
import { useAuth, useRole } from '../../app/auth';
import { useAdminRequests } from '../../data/leagues';
import { usePendingClaims } from '../../data/claims';
import type { LeagueData } from '../../data/queries';
import { AdminIcon, type AdminIconName } from './AdminIcon';
import type { Panel } from './MenuDrawer';

export function LeagueAdminHub({ data, onClose, onOpen }: { data: LeagueData; onClose: () => void; onOpen: (panel: Panel) => void }) {
  const { user } = useAuth();
  const { isAdmin } = useRole(data.league.id);
  const owner = !!user && data.league.owner_id === user.id;
  const claims = usePendingClaims(data.league.id, isAdmin);
  const proposals = useAdminRequests(data.league.id, isAdmin && owner);
  if (!isAdmin) return null;
  const items: { panel: Panel; icon: AdminIconName; title: string; description: string; color: string; badge?: number }[] = [
    { panel: 'invites', icon: 'link', title: 'Inviti giocatori', description: 'Link personali per entrare nella lega', color: 'premium-tile-trial' },
    { panel: 'claims', icon: 'hand', title: 'Richieste "sono io"', description: 'Conferma i collegamenti agli account', color: 'player-tile-awards', badge: claims.data?.length },
    { panel: 'bench', icon: 'bench', title: 'Panchina', description: 'Giocatori senza lega', color: 'player-tile-records' },
    ...(owner ? [{ panel: 'admin-proposals' as const, icon: 'shield' as const, title: 'Proposte di amministratore', description: 'Valuta le richieste di amministrazione', color: 'premium-tile-trial', badge: proposals.data?.length }] : []),
    { panel: 'members', icon: 'users', title: 'Membri e ruoli', description: 'Gestisci gli accessi alla lega', color: 'premium-tile-users' },
    { panel: 'merge', icon: 'merge', title: 'Unisci giocatori', description: 'Riunisci le schede duplicate', color: 'player-tile-awards' },
  ];
  return <Sheet title="ADMIN LEGA" onClose={onClose} id="sheet-league-admin-hub">
    <p style={{ color: 'var(--text2)', marginBottom: 12 }}>{data.league.name}</p>
    <div className="premium-tiles">{items.map((item) => <button type="button" id={'menu-' + (item.panel === 'admin-proposals' ? 'proposals' : item.panel)} key={item.panel} className={'premium-tile ' + item.color} onClick={() => onOpen(item.panel)}>
      <span><AdminIcon name={item.icon} /></span><b>{item.title}{item.badge ? ' (' + item.badge + ')' : ''}</b><small>{item.description}</small>
    </button>)}</div>
  </Sheet>;
}
