import { Sheet } from '../../app/Sheet';
import type { Panel } from './MenuDrawer';
import { useAuth } from '../../app/auth';
import { useFeatures } from '../../data/features';

export function PlayersHub({ onClose, onOpen }: { onClose: () => void; onOpen: (panel: Panel) => void }) {
  const { user } = useAuth();
  const features = useFeatures(user?.id ?? null);
  const items: { panel: Panel; icon: string; title: string; description: string; color: string }[] = [
    { panel: 'compare', icon: '⚔️', title: 'Confronto', description: 'Due giocatori testa a testa', color: 'premium-tile-users' },
    { panel: 'couples', icon: '🤝', title: 'Coppie', description: 'Chi vince e perde insieme', color: 'premium-tile-trial' },
    { panel: 'albo', icon: '🏆', title: "Albo d'oro", description: 'I premi di ogni stagione', color: 'player-tile-awards' },
    { panel: 'records', icon: '🏅', title: 'Record', description: 'Le imprese più grandi', color: 'player-tile-records' },
  ];
  return <Sheet title="Giocatori" onClose={onClose} id="sheet-players-hub">
    {features.isError ? <p role="alert">Impossibile caricare le funzionalità.</p> : null}
    <div className="premium-tiles">{items.filter((item) => features.data?.some((f) => f.feature === item.panel)).map((item) => {
      const mode = features.data?.find((f) => f.feature === item.panel)?.mode;
      return <button type="button" id={`menu-${item.panel}`} key={item.panel} className={`premium-tile ${item.color}${mode === 'premium' ? ' premium-tile-gold' : ''}`} onClick={() => onOpen(item.panel)}>
        {mode === 'premium' ? <i className="tile-premium-tag" aria-label="Premium">Premium</i> : null}<span>{item.icon}</span><b>{item.title}</b><small>{item.description}{mode === 'beta' ? ' · Beta' : ''}</small>
      </button>;
    })}</div>
  </Sheet>;
}
