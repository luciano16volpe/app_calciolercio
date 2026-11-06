import { LoadingIndicator } from '../../app/LoadingIndicator';
import type { ReactNode } from 'react';
import { Sheet } from '../../app/Sheet';
import type { LeagueData } from '../../data/queries';
import { useMatchTexts } from '../../data/matchTexts';

export function MatchTextBoundary({ data, matchId, onClose, children }: { data: LeagueData; matchId: string; onClose: () => void; children: (data: LeagueData) => ReactNode }) {
  const texts = useMatchTexts(data, matchId);
  if (texts.ready) return children(texts.detailed);
  return <Sheet title="Pagelle della partita" id="sheet-match-texts" onClose={onClose}>
    {texts.isError ? <div role="alert">Impossibile caricare le pagelle. <button type="button" className="btn btn-secondary" onClick={() => void texts.refetch()}>Riprova</button></div> : <LoadingIndicator />}
  </Sheet>;
}
