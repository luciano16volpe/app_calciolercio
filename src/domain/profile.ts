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
  /** chi ha cambiato le statistiche (nome); assente se non si sa */
  by?: string | null;
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

// ── le MIE partite nella lega che sto guardando (pagina «Il mio profilo») ───────────────────────────
import { hasScore } from './matches';
import { getPlayerMatchResult, normalizeTeam } from './stats';
import type { Dataset, Match } from './types';

/** Oggi, ora italiana (aaaa-mm-gg). */
export const todayRome = (): string => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

/** In quale squadra gioco in questa partita: 'A' (Blu), 'B' (Bianchi) o null se non ci sono. */
export function myTeam(m: Match, playerId: string, playerName: string): 'A' | 'B' | null {
  const is = (p: { id: string | null; name: string }) => p.id === playerId || p.name === playerName;
  if (normalizeTeam(m.teamA).some(is)) return 'A';
  if (normalizeTeam(m.teamB).some(is)) return 'B';
  return null;
}

/** La mia prossima partita: la più vicina, di oggi o futura, senza risultato, in cui sono in squadra. */
export function myNextMatch(data: Dataset, playerId: string, playerName: string, today = todayRome()): { m: Match; team: 'A' | 'B' } | null {
  const list = data.matches
    .filter((m) => !hasScore(m) && String(m.date ?? '') >= today && myTeam(m, playerId, playerName))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
  const m = list[0];
  return m ? { m, team: myTeam(m, playerId, playerName) as 'A' | 'B' } : null;
}

/** La mia ultima partita giocata: la più recente con risultato in cui sono in squadra, con l'esito (V = vinta, P = pareggio, S = persa). */
export function myLastMatch(data: Dataset, playerId: string, playerName: string): { m: Match; team: 'A' | 'B'; result: 'V' | 'P' | 'S' } | null {
  const list = data.matches
    .filter((m) => hasScore(m) && myTeam(m, playerId, playerName))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)));
  const m = list[0];
  if (!m) return null;
  const r = getPlayerMatchResult(m, playerId, playerName);
  return { m, team: myTeam(m, playerId, playerName) as 'A' | 'B', result: r === 'W' ? 'V' : r === 'L' ? 'S' : 'P' };
}
