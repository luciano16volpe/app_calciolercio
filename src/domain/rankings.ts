// Classifiche: i quattro numeri della stagione, marcatori e assist, media voto.
// Fonte: scopeMinPres, renderSeasonDash, renderScorersList, renderMediaList in legacy/index.html.
import { scopeMatches, seasonStats, type PlayerSeason } from './stats';
import type { Dataset } from './types';

/** Soglia di presenze per la media e i premi: almeno 2, o il 40% delle partite della stagione. */
export const scopeMinPres = (data: Dataset, scope: string): number =>
  Math.max(2, Math.ceil(scopeMatches(data.matches, scope).length * 0.4));

export interface SeasonDash {
  matches: number;
  goals: number;
  avgGoals: number;
  /** miglior media voto tra chi ha giocato abbastanza partite; nome già accorciato (8 caratteri al massimo) */
  top: { name: string; avg: number } | null;
}

/** I quattro numeri in cima alle Classifiche. Senza partite → null. */
export function seasonDash(data: Dataset, scope: string): SeasonDash | null {
  const ms = scopeMatches(data.matches, scope);
  if (!ms.length) return null;
  const stat = seasonStats(data, scope);
  const goals = Object.values(stat).reduce((s, p) => s + p.goals, 0); // = somma dei gol in classifica
  const minPres = Math.max(2, Math.ceil(ms.length * 0.4));
  let top = { name: '—', avg: 0 };
  Object.values(stat).forEach((p) => {
    if (p.pres >= minPres && p.votes.length > 0) {
      const avg = p.voteAvg as number;
      if (avg > top.avg) top = { name: p.name, avg };
    }
  });
  const name = top.name.length > 8 ? top.name.slice(0, 7) + '…' : top.name;
  return { matches: ms.length, goals, avgGoals: ms.length ? goals / ms.length : 0, top: top.avg > 0 ? { name, avg: top.avg } : null };
}

/**
 * Marcatori (`goals`) o assistman (`assist`): solo chi ne ha almeno uno;
 * a pari merito conta il rapporto per partita, poi il nome.
 */
export function scorersRanking(data: Dataset, scope: string, field: 'goals' | 'assist'): PlayerSeason[] {
  return Object.values(seasonStats(data, scope))
    .filter((s) => s[field] > 0)
    .sort((a, b) => b[field] - a[field] || b[field] / (b.pres || 1) - a[field] / (a.pres || 1) || a.name.localeCompare(b.name));
}

export interface MediaRanking {
  /** presenze minime per la classifica principale */
  minPres: number;
  /** chi ha giocato abbastanza partite, per media */
  regulars: PlayerSeason[];
  /** Occasionali: da 2 partite fino a sotto la soglia, per media */
  occasionals: PlayerSeason[];
  /** quanti con voti sono sotto la soglia (anche chi ha una sola presenza) */
  below: number;
}

/** Classifica per media voto, con gli Occasionali a parte. */
export function mediaRanking(data: Dataset, scope: string): MediaRanking {
  const minPres = scopeMinPres(data, scope);
  const all = Object.values(seasonStats(data, scope)).filter((p) => p.votes.length);
  const avg = (p: PlayerSeason) => p.voteAvg as number;
  return {
    minPres,
    regulars: all.filter((p) => p.pres >= minPres).sort((a, b) => avg(b) - avg(a) || b.votes.length - a.votes.length || a.name.localeCompare(b.name)),
    occasionals: all.filter((p) => p.pres >= 2 && p.pres < minPres).sort((a, b) => avg(b) - avg(a) || b.pres - a.pres || a.name.localeCompare(b.name)),
    below: all.filter((p) => p.pres < minPres).length,
  };
}

/** Colore della media: ≥ 6,5 verde · < 5,5 rosso · altrimenti giallo. */
export const avgColor = (v: number): string => (v >= 6.5 ? 'var(--green)' : v < 5.5 ? 'var(--red)' : 'var(--amber)');

export type StatsFilter = 'all' | 'regulars' | 'occ';
export type StatsCol = 'name' | 'pres' | 'w' | 'd' | 'l' | 'winpct' | 'goals' | 'voto';

export interface StatsRow extends PlayerSeason {
  ratingSum: number;
  ratingCount: number;
}

/** Ordinamento iniziale della tabella: più gol prima. */
export const STATS_SORT_DEFAULT: { col: StatsCol; dir: 1 | -1 } = { col: 'goals', dir: -1 };

/** Nuovo ordinamento toccando un'intestazione: stessa colonna → inverte; altra colonna → nomi A–Z, numeri dal più alto. */
export function nextStatsSort(cur: { col: StatsCol; dir: 1 | -1 }, col: StatsCol): { col: StatsCol; dir: 1 | -1 } {
  if (cur.col === col) return { col, dir: cur.dir === 1 ? -1 : 1 };
  return { col, dir: col === 'name' ? 1 : -1 };
}

/**
 * Tabella "Statistiche giocatori": Titolari (presenze ≥ soglia), Occasionali (da 2 fino a sotto la soglia) o Tutti,
 * ordinata per la colonna scelta (a pari valore per nome).
 */
export function statsTable(
  data: Dataset,
  scope: string,
  filter: StatsFilter,
  sort: { col: StatsCol; dir: 1 | -1 },
): { rows: StatsRow[]; minPres: number } {
  const total = scopeMatches(data.matches, scope).length;
  const minPres = Math.max(2, Math.ceil(total * 0.4));
  let rows: StatsRow[] = Object.values(seasonStats(data, scope)).map((s) => ({ ...s, ratingSum: s.voteSum, ratingCount: s.votes.length }));
  if (filter === 'regulars') rows = rows.filter((r) => r.pres >= minPres);
  else if (filter === 'occ') rows = rows.filter((r) => r.pres >= 2 && r.pres < minPres);
  const val = (r: StatsRow, col: StatsCol): string | number => {
    if (col === 'name') return r.name.toLowerCase();
    if (col === 'voto') return r.ratingCount ? r.ratingSum / r.ratingCount : -1;
    if (col === 'winpct') {
      const dec = r.w + r.d + r.l;
      return dec ? r.w / dec : -1;
    }
    return r[col];
  };
  const { col, dir } = sort;
  rows.sort((x, y) => {
    const a = val(x, col);
    const b = val(y, col);
    if (a < b) return -1 * dir;
    if (a > b) return 1 * dir;
    return x.name.localeCompare(y.name);
  });
  return { rows, minPres };
}
