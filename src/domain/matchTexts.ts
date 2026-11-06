import type { Dataset } from './types';

export interface MatchText { match_id: string; player_id: string; titolo: string | null; descrizione: string | null }
export function withMatchTexts(dataset: Dataset, texts: MatchText[]): Dataset {
  const byPlayer = new Map(texts.map((t) => [t.match_id + ':' + t.player_id, t]));
  return { ...dataset, ratings: dataset.ratings.map((r) => {
    const text = byPlayer.get(r.matchId + ':' + r.playerId);
    return text ? { ...r, titolo: text.titolo ?? '', notes: text.descrizione ?? '', hasText: !!(text.titolo?.trim() || text.descrizione?.trim()) } : r;
  }) };
}
