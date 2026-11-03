// Menu laterale → Confronto: due giocatori della lega testa a testa, con la scelta della stagione.
import { useMemo, useState } from 'react';
import { Sheet } from '../../app/Sheet';
import type { LeagueData } from '../../data/queries';
import { seasonsList } from '../../domain/seasons';
import { SEASON_ICON } from '../classifiche/ClassifichePage';
import { Confronto } from '../classifiche/Confronto';

export function ComparePanel({ data, onClose }: { data: LeagueData; onClose: () => void }) {
  const seasons = useMemo(() => seasonsList(data.dataset.matches, data.albo).slice().reverse(), [data]);
  const [scopeSel, setScopeSel] = useState<string | null>(null);
  const [cmp, setCmp] = useState<{ a: string | null; b: string | null }>({ a: null, b: null });
  const scope = scopeSel ?? (seasons.length ? (seasons[0] as { key: string }).key : 'all');
  return (
    <Sheet title="⚔️ Confronto" onClose={onClose} id="sheet-compare">
      <div className="chips-row" id="cmp-seasons">
        {seasons.map((s) => (
          <button key={s.key} className={`chip${s.key === scope ? ' active' : ''}`} onClick={() => setScopeSel(s.key)}>
            {SEASON_ICON[s.key.slice(-3)] ?? ''} {s.label}
          </button>
        ))}
        <button className={`chip${scope === 'all' ? ' active' : ''}`} onClick={() => setScopeSel('all')}>♾️ Sempre</button>
      </div>
      <div className="card" id="cmp-box">
        <Confronto data={data} scope={scope} a={cmp.a} b={cmp.b} onChange={(a, b) => setCmp({ a, b })} />
      </div>
    </Sheet>
  );
}
