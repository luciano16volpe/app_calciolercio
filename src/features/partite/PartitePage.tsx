// Pagina Partite: ultima partita, striscia delle Gazzette, elenco di tutte le partite per stagione.
import type { LeagueData } from '../../data/queries';
import { GazStrip, LastMatch, MatchesList, type MatchActions } from './parts';

export function PartitePage({ data, act, onArchive }: { data: LeagueData; act: MatchActions; onArchive: () => void }) {
  return (
    <div id="partite-content">
      <div id="last-match"><LastMatch data={data} act={act} /></div>
      <div id="gaz-strip"><GazStrip data={data} act={act} onArchive={onArchive} /></div>
      <div className="card">
        <div id="matches-list"><MatchesList data={data} act={act} /></div>
      </div>
    </div>
  );
}
