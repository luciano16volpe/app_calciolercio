// Pagina Partite: ultima partita, striscia delle Gazzette, elenco di tutte le partite per stagione.
import type { LeagueData } from '../../data/queries';
import { useState } from 'react';
import { AdBanner } from '../../app/AdBanner';
import { GazStrip, LastMatch, MatchesList, useMyPlayerIn, type MatchActions } from './parts';

export function PartitePage({ data, act, onArchive, active = true }: { data: LeagueData; act: MatchActions; onArchive: () => void; active?: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const mine = useMyPlayerIn(data); // per i coriandoli / la pioggia sull'ultima partita, se ci ho giocato
  return (
    <div id="partite-content">
      <div id="last-match"><LastMatch data={data} act={act} mine={mine} active={active} /></div>
      <div id="gaz-strip"><GazStrip data={data} act={act} onArchive={onArchive} /></div>
      <AdBanner placement="partite-feed" />
      <div className="card">
        <button type="button" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, color: 'var(--text)', font: 'inherit', fontWeight: 800, padding: 0, cursor: 'pointer' }}>
          📋 {showAll ? 'Nascondi tutte le partite' : 'Vedi tutte le partite'} ›
        </button>
        {showAll ? <div id="matches-list" style={{ marginTop: 14 }}><MatchesList data={data} act={act} /></div> : null}
      </div>
    </div>
  );
}
