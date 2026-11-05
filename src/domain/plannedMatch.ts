import { normalizeTeam } from './stats';
import type { Dataset, Match } from './types';

/** Una partita senza risultati né dati di gioco può ancora cambiare convocati. */
export function canPlanMatch(data: Dataset, match: Match): boolean {
  if ([match.scoreA, match.scoreB].some((v) => v !== null && v !== undefined && v !== '')) return false;
  return !data.ratings.some((r) => r.matchId === match.id && (
    (r.rating !== null && r.rating !== undefined && r.rating !== '') ||
    [r.goals, r.assist, r.autogol, r.meta, r.rigoriSbagliati].some((v) => Number(v ?? 0) !== 0) || r.titolo || r.notes
  ));
}

export function plannedSnapshot(match: Match) {
  return {
    date: String(match.date ?? ''), time: String(match.time ?? ''), place: String(match.place ?? ''), notes: String(match.notes ?? ''),
    teamA: normalizeTeam(match.teamA).map((p) => p.id), teamB: normalizeTeam(match.teamB).map((p) => p.id),
  };
}

/** Sostituisce un assente; scegliendo un convocato scambia i due posti. */
export function replacePlannedPlayer(teams: { teamA: string[]; teamB: string[] }, side: 'teamA' | 'teamB', index: number, playerId: string) {
  const next = { teamA: [...teams.teamA], teamB: [...teams.teamB] };
  const previous = next[side][index];
  if (!previous) return teams;
  for (const key of ['teamA', 'teamB'] as const) {
    const other = next[key].indexOf(playerId);
    if (other >= 0) next[key][other] = previous;
  }
  next[side][index] = playerId;
  return next;
}
