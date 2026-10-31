// Statistiche di stagione: UNA sola fonte per scheda giocatore, classifiche, figurina.
// Fonte: playerKey, normalizeTeam, getPlayerMatchResult, validVote, clampRating, mvpPerf, seasonStats.
import { seasonOf } from './seasons';
import type { Dataset, Match, Player, Rating, TeamEntry } from './types';

/** Voto valido: 1–10 (qualsiasi valore intermedio), altrimenti null. */
export function validVote(v: unknown): number | null {
  const n = parseFloat(v as string);
  return !isNaN(n) && n >= 1 && n <= 10 ? n : null;
}

/** Voto da inserire: null se vuoto/non valido, altrimenti agganciato al mezzo punto più vicino (1–10). */
export function clampRating(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const n = parseFloat(value as string);
  if (isNaN(n)) return null;
  if (n < 1 || n > 10) return null;
  return Math.round(n * 2) / 2;
}

/** Squadra salvata → [{id, name}] (gestisce il vecchio formato con soli nomi). */
export function normalizeTeam(team: TeamEntry[] | undefined | null): Array<{ id: string | null; name: string }> {
  return (team || []).map((x) =>
    typeof x === 'string' ? { id: null, name: x } : { id: x.id || null, name: x.name || '' },
  );
}

/**
 * Chiave unica di un giocatore + nome da mostrare: prima l'id in rosa, poi il nome.
 * Se non è in rosa, si raggruppa per nome (così i record orfani della stessa persona si uniscono).
 */
export function playerKey(
  players: Player[],
  pid: string | null | undefined,
  pname: string | null | undefined,
): { key: string; name: string } {
  let rp = pid ? players.find((p) => p.id === pid) : undefined;
  if (!rp && pname) rp = players.find((p) => p.name === pname);
  if (rp) return { key: rp.id, name: rp.name };
  return { key: 'name:' + (pname || pid || '?'), name: pname || '?' };
}

/** Risultato di una partita per un giocatore: 'W' | 'D' | 'L', o null se non ha giocato / senza risultato. */
export function getPlayerMatchResult(
  match: Pick<Match, 'teamA' | 'teamB' | 'scoreA' | 'scoreB'>,
  playerId: string | null | undefined,
  playerName: string | null | undefined,
): 'W' | 'D' | 'L' | null {
  const teamA = normalizeTeam(match.teamA);
  const teamB = normalizeTeam(match.teamB);
  const matchP = (p: { id: string | null; name: string }) => (playerId && p.id === playerId) || p.name === playerName;
  const inA = teamA.some(matchP);
  const inB = teamB.some(matchP);
  if (!inA && !inB) return null;
  const a = parseInt(match.scoreA as string);
  const b = parseInt(match.scoreB as string);
  if (isNaN(a) || isNaN(b)) return null;
  if (a === b) return 'D';
  const wonA = a > b;
  if (inA) return wonA ? 'W' : 'L';
  return wonA ? 'L' : 'W';
}

/** Prestazione in una partita (per MVP / Peggiore): voto + 0,5·gol + 0,3·assist − 0,3·autogol − 0,3·rigori sbagliati. */
export function mvpPerf(r: Pick<Rating, 'rating' | 'goals' | 'assist' | 'autogol' | 'rigoriSbagliati'>): number | null {
  const rt = parseFloat(r.rating as string);
  if (isNaN(rt) || rt < 1) return null;
  return (
    rt +
    (parseInt(r.goals as string) || 0) * 0.5 +
    (parseInt(r.assist as string) || 0) * 0.3 -
    (parseInt(r.autogol as string) || 0) * 0.3 -
    (parseInt(r.rigoriSbagliati as string) || 0) * 0.3
  );
}

export interface PlayerSeason {
  key: string;
  name: string;
  pres: number;
  w: number;
  d: number;
  l: number;
  results: Array<{ date: string; res: 'W' | 'D' | 'L' }>;
  rows: number;
  goals: number;
  assist: number;
  autogol: number;
  rigori: number;
  meta: number;
  votes: Array<{ v: number; date: string; matchId: string }>;
  voteSum: number;
  voteAvg: number | null;
}

/**
 * Statistiche per giocatore in una stagione (`scope` = chiave tipo '2026-AUT') o su tutto ('all' / vuoto).
 * Presenze e V/N/P dalle squadre salvate (una volta per partita); voti, gol, ecc. dalle pagelle
 * di partite esistenti. Risultato: { chiaveGiocatore → record }.
 */
export function seasonStats(data: Dataset, scope?: string): Record<string, PlayerSeason> {
  const { players, matches, ratings } = data;
  const key = scope && scope !== 'all' ? scope : 'all';
  const ms = key === 'all' ? matches : matches.filter((m) => seasonOf(m.date)?.key === key);
  const byMatch: Record<string, Match> = {};
  ms.forEach((m) => {
    byMatch[m.id] = m;
  });
  const by: Record<string, PlayerSeason> = {};
  const ensure = (k: string, name: string): PlayerSeason =>
    (by[k] ??= {
      key: k, name, pres: 0, w: 0, d: 0, l: 0, results: [],
      rows: 0, goals: 0, assist: 0, autogol: 0, rigori: 0, meta: 0, votes: [], voteSum: 0, voteAvg: null,
    });
  const seen = new Set<string>();
  ms.forEach((m) => {
    [...normalizeTeam(m.teamA), ...normalizeTeam(m.teamB)].forEach((pl) => {
      const { key: k, name } = playerKey(players, pl.id, pl.name);
      const tag = m.id + '|' + k;
      if (seen.has(tag)) return;
      seen.add(tag);
      const a = ensure(k, name);
      a.pres++;
      const res = getPlayerMatchResult(m, pl.id, pl.name);
      if (res === 'W') a.w++;
      else if (res === 'D') a.d++;
      else if (res === 'L') a.l++;
      if (res) a.results.push({ date: m.date || '', res });
    });
  });
  ratings.forEach((r) => {
    const m = byMatch[r.matchId];
    if (!m) return; // pagelle di partite cancellate: ignorate
    const { key: k, name } = playerKey(players, r.playerId, r.player);
    const a = ensure(k, name);
    a.rows++;
    a.goals += parseInt(r.goals as string) || 0;
    a.assist += parseInt(r.assist as string) || 0;
    a.autogol += parseInt(r.autogol as string) || 0;
    a.rigori += parseInt(r.rigoriSbagliati as string) || 0;
    a.meta += parseInt(r.meta as string) || 0;
    const v = validVote(r.rating);
    if (v != null) {
      a.votes.push({ v, date: m.date || '', matchId: r.matchId });
      a.voteSum += v;
    }
  });
  Object.values(by).forEach((a) => {
    a.results.sort((x, y) => (x.date || '').localeCompare(y.date || '')); // cronologico
    a.votes.sort((x, y) => (x.date || '').localeCompare(y.date || ''));
    a.voteAvg = a.votes.length ? a.voteSum / a.votes.length : null;
  });
  return by;
}

/** Statistiche di un giocatore su tutte le partite (scheda giocatore, figurina). */
export function playerSeason(data: Dataset, p: Pick<Player, 'id' | 'name'>, all = seasonStats(data)): PlayerSeason | null {
  return all[playerKey(data.players, p.id, p.name).key] ?? null;
}
/** Partite di una stagione (`scope` = chiave tipo '2026-AUT') o tutte ('all'). */
export const scopeMatches = (matches: Match[], scope: string): Match[] =>
  scope === 'all' ? matches : matches.filter((m) => seasonOf(m.date)?.key === scope);
