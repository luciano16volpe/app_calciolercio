// OVR e fasce delle figurine.

/** OVR = media pesata delle 11 statistiche. Non include le pagelle. */
export function calcOvr(stats: number[], weights: number[]): number {
  const tot = weights.reduce((a, b) => a + b, 0) || 1;
  return stats.reduce((s, v, i) => s + v * (weights[i] as number), 0) / tot;
}

/** Valutazione della figurina = OVR × 10, arrotondato. */
export function futRating(stats: number[], weights: number[]): number {
  return Math.round(calcOvr(stats, weights) * 10);
}

export type FutTier = 'top' | 'gold' | 'silver' | 'bronze' | 'cacca' | 'marcia';

/** Fascia della carta: ≥74 Top player · 68–73 Oro · 60–67 Argento · 51–59 Bronzo · 41–50 Cacca · ≤40 Marcio Vomito (chiave `marcia`). */
export function futTierOfRating(r: number): FutTier {
  return r >= 74 ? 'top' : r >= 68 ? 'gold' : r >= 60 ? 'silver' : r >= 51 ? 'bronze' : r >= 41 ? 'cacca' : 'marcia';
}

export function futTier(stats: number[], weights: number[]): FutTier {
  return futTierOfRating(futRating(stats, weights));
}
/** Ordine di visualizzazione della rosa: OVR più alto prima, a pari OVR per nome. Restituisce gli indici. */
export function rosaOrder(players: Array<{ name: string; stats: number[] }>, weights: number[]): number[] {
  return players
    .map((_, i) => i)
    .sort(
      (a, b) =>
        calcOvr((players[b] as { stats: number[] }).stats, weights) - calcOvr((players[a] as { stats: number[] }).stats, weights) ||
        (players[a] as { name: string }).name.localeCompare((players[b] as { name: string }).name),
    );
}

/** Le 6 statistiche "alla FIFA" ricavate dalle 11: etichetta e indici delle statistiche usate (media). */
export const FUT_STATS: Array<[string, number[]]> = [['VEL', [3]], ['TIR', [4]], ['PAS', [5]], ['DRI', [2]], ['DIF', [7]], ['FIS', [0, 1]]];

/** Valore (0–100) di una delle 6 statistiche della figurina: media delle statistiche indicate × 10, arrotondata. */
export const futStat = (stats: number[], idx: number[]): number =>
  Math.round((idx.reduce((s, j) => s + (stats[j] as number), 0) / idx.length) * 10);
