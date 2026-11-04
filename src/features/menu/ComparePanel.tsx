// Menu laterale → Confronto: due giocatori della lega testa a testa, con la scelta della stagione.
import { useState } from 'react';
import { Sheet } from '../../app/Sheet';
import type { LeagueData } from '../../data/queries';
import { Confronto } from '../classifiche/Confronto';
import { SeasonChips, useSeasonScope } from './SeasonScope';

export function ComparePanel({ data, onClose }: { data: LeagueData; onClose: () => void }) {
  const { seasons, scope, setScope, canHistory } = useSeasonScope(data);
  const [cmp, setCmp] = useState<{ a: string | null; b: string | null }>({ a: null, b: null });
  return (
    <Sheet title="⚔️ Confronto" onClose={onClose} id="sheet-compare">
      <SeasonChips seasons={seasons} scope={scope} onPick={setScope} canHistory={canHistory} />
      <div className="card" id="cmp-box">
        <Confronto data={data} scope={scope} a={cmp.a} b={cmp.b} onChange={(a, b) => setCmp({ a, b })} />
      </div>
    </Sheet>
  );
}
