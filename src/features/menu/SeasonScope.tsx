// Scelta della stagione per i pannelli del menu (Confronto, Coppie, Albo d'oro, Record): come nelle Classifiche,
// parte dalla stagione più recente; "Sempre" mostra tutto.
import { useMemo, useState } from 'react';
import type { LeagueData } from '../../data/queries';
import { seasonsList } from '../../domain/seasons';
import { SEASON_ICON } from '../classifiche/ClassifichePage';

export function useSeasonScope(data: LeagueData) {
  const seasons = useMemo(() => seasonsList(data.dataset.matches, data.albo).slice().reverse(), [data]);
  const [sel, setScope] = useState<string | null>(null);
  const scope = sel ?? (seasons.length ? (seasons[0] as { key: string }).key : 'all');
  return { seasons, scope, setScope };
}

export function SeasonChips({ seasons, scope, onPick }: { seasons: { key: string; label: string }[]; scope: string; onPick: (key: string) => void }) {
  return (
    <div className="chips-row" id="panel-seasons">
      {seasons.map((s) => (
        <button key={s.key} className={`chip${s.key === scope ? ' active' : ''}`} onClick={() => onPick(s.key)}>
          {SEASON_ICON[s.key.slice(-3)] ?? ''} {s.label}
        </button>
      ))}
      <button className={`chip${scope === 'all' ? ' active' : ''}`} onClick={() => onPick('all')}>♾️ Sempre</button>
    </div>
  );
}
