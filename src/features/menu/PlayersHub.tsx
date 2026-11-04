import { Sheet } from '../../app/Sheet';
import type { Panel } from './MenuDrawer';

export function PlayersHub({ onClose, onOpen }: { onClose: () => void; onOpen: (panel: Panel) => void }) {
  const items: { panel: Panel; icon: string; title: string; description: string; color: string }[] = [
    { panel: 'compare', icon: '⚔️', title: 'Confronto', description: 'Due giocatori testa a testa', color: 'premium-tile-users' },
    { panel: 'couples', icon: '🤝', title: 'Coppie', description: 'Chi vince e perde insieme', color: 'premium-tile-trial' },
    { panel: 'albo', icon: '🏆', title: "Albo d'oro", description: 'I premi di ogni stagione', color: 'player-tile-awards' },
    { panel: 'records', icon: '🏅', title: 'Record', description: 'Le imprese più grandi', color: 'player-tile-records' },
  ];
  return <Sheet title="Giocatori" onClose={onClose} id="sheet-players-hub">
    <div className="premium-tiles">{items.map((item) => <button type="button" id={`menu-${item.panel}`} key={item.panel} className={`premium-tile ${item.color}`} onClick={() => onOpen(item.panel)}>
      <span>{item.icon}</span><b>{item.title}</b><small>{item.description}</small>
    </button>)}</div>
  </Sheet>;
}
