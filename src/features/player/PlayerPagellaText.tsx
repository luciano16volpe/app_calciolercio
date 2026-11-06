import { LoadingIndicator } from '../../app/LoadingIndicator';
import type { LeagueData } from '../../data/queries';
import { useMatchTexts } from '../../data/matchTexts';
import { waHTML } from '../../domain/whatsapp';

/** Mounted only when a player opens an individual report. */
export function PlayerPagellaText({ data, matchId, playerId }: { data: LeagueData; matchId: string; playerId: string }) {
  const texts = useMatchTexts(data, matchId, playerId);
  if (!texts.ready) return texts.isError
    ? <div role="alert">Impossibile caricare la pagella. <button type="button" className="mini-btn" onClick={(e) => { e.stopPropagation(); void texts.refetch(); }}>Riprova</button></div>
    : <LoadingIndicator />;
  const r = texts.detailed.dataset.ratings.find((r) => r.matchId === matchId && r.playerId === playerId);
  return <>
    {r?.titolo ? <div className="pl-tit">{String(r.titolo)}</div> : null}
    {r?.notes ? <div className="pl-desc" dangerouslySetInnerHTML={{ __html: waHTML(String(r.notes)) }} /> : null}
  </>;
}
