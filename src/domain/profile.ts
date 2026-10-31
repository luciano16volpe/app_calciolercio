// Profilo personale: riepilogo per lega delle partite del mio giocatore e storico delle modifiche alle statistiche.
import { STATS } from './types';

export interface ProfileRow {
  matchId: string;
  date: string;
  leagueId: string;
  leagueName: string;
  team: 'A' | 'B';
  rating: number | null;
  goals: number;
  assist: number;
  scoreA: number | null;
  scoreB: number | null;
}

export interface LeagueSummary {
  leagueId: string;
  leagueName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assist: number;
  /** media dei voti (solo le partite con voto), null se nessuno */
  avgRating: number | null;
}

/** Esito per il mio giocatore: V/P/S, oppure null se il risultato non c'è. Blu = squadra A, Bianchi = squadra B. */
export function outcome(r: Pick<ProfileRow, 'team' | 'scoreA' | 'scoreB'>): 'V' | 'P' | 'S' | null {
  if (r.scoreA == null || r.scoreB == null) return null;
  const mine = r.team === 'A' ? r.scoreA : r.scoreB;
  const other = r.team === 'A' ? r.scoreB : r.scoreA;
  return mine > other ? 'V' : mine < other ? 'S' : 'P';
}

/** Riepilogo per lega (la lega con più partite per prima). */
export function summarizeByLeague(rows: ProfileRow[]): LeagueSummary[] {
  const by = new Map<string, ProfileRow[]>();
  for (const r of rows) by.set(r.leagueId, [...(by.get(r.leagueId) ?? []), r]);
  return [...by.values()]
    .map((list): LeagueSummary => {
      const rated = list.filter((r) => r.rating != null);
      const res = list.map(outcome);
      return {
        leagueId: (list[0] as ProfileRow).leagueId,
        leagueName: (list[0] as ProfileRow).leagueName,
        played: list.length,
        wins: res.filter((x) => x === 'V').length,
        draws: res.filter((x) => x === 'P').length,
        losses: res.filter((x) => x === 'S').length,
        goals: list.reduce((s, r) => s + r.goals, 0),
        assist: list.reduce((s, r) => s + r.assist, 0),
        avgRating: rated.length ? rated.reduce((s, r) => s + (r.rating as number), 0) / rated.length : null,
      };
    })
    .sort((a, b) => b.played - a.played || a.leagueName.localeCompare(b.leagueName));
}

/** Partite dalla più recente. */
export const recentMatches = (rows: ProfileRow[], n = 10): ProfileRow[] =>
  [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, n);

export interface HistoryEntry {
  at: string;
  oldStats: number[] | null;
  newStats: number[] | null;
  oldRoles: string[] | null;
  newRoles: string[] | null;
}

/** Cosa è cambiato in una modifica: "Tiro 6 → 7", "Ruoli: MED → MED, ATT". */
export function describeChange(h: HistoryEntry): string[] {
  const out: string[] = [];
  if (h.oldStats && h.newStats) {
    h.newStats.forEach((v, i) => {
      const o = h.oldStats?.[i];
      if (o != null && o !== v) out.push(`${STATS[i]} ${o} → ${v}`);
    });
  }
  const o = (h.oldRoles ?? []).join(', '), n = (h.newRoles ?? []).join(', ');
  if (h.oldRoles && h.newRoles && o !== n) out.push(`Ruoli: ${o || '—'} → ${n || '—'}`);
  return out;
}
