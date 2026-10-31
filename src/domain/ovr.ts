// OVR e fasce delle figurine. Fonte: calcOvr, futRating, futTier in legacy/index.html.

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

/** Fascia della carta: ≥74 Top player · 68–73 Oro · 60–67 Argento · 55–59 Bronzo · 40–54 Cacca · <40 Marcia. */
export function futTierOfRating(r: number): FutTier {
  return r >= 74 ? 'top' : r >= 68 ? 'gold' : r >= 60 ? 'silver' : r >= 55 ? 'bronze' : r >= 40 ? 'cacca' : 'marcia';
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
