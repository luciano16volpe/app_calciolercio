// Record di una stagione o di sempre. Fonte: renderRecord in legacy/index.html (solo i calcoli).
import { normalizeTeam, playerKey, scopeMatches, validVote } from './stats';
import type { Dataset, Match, Rating } from './types';

const num = (v: unknown): number | null => {
  const n = parseInt(v as string);
  return isNaN(n) ? null : n;
};

/**
 * Una riga di "chi / quando" di un record:
 * - record di partita ('match'): la partita (risultato e data);
 * - record di giocatore ('rating'): il giocatore e la sua partita;
 * - serie ('streak'): solo il giocatore.
 */
export interface RecordEntry {
  name?: string;
  match?: Match;
}

export interface RecordRow {
  kind: 'match' | 'rating' | 'streak';
  icon: string;
  title: string;
  value: string;
  entries: RecordEntry[];
}

const best = <T,>(items: T[], val: (x: T) => number): { v: number; items: T[] } => {
  const v = items.length ? Math.max(...items.map(val)) : 0;
  return { v, items: items.filter((x) => val(x) === v) };
};

/**
 * Record della stagione (`scope` = chiave tipo '2026-AUT') o di sempre ('all'), sulle partite con risultato:
 * partita con più gol, vittoria più larga, più gol / assist in una partita, voto più alto,
 * serie di partite senza sconfitte, di vittorie e di sconfitte (le serie contano da 2 in su).
 * Se non c'è nessuna partita con risultato la lista è vuota.
 */
export function computeRecords(data: Dataset, scope: string): RecordRow[] {
  const { players } = data;
  const ms = scopeMatches(data.matches, scope)
    .filter((m) => num(m.scoreA) != null && num(m.scoreB) != null)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
  const ids = new Set(ms.map((m) => m.id));
  const byId: Record<string, Match> = {};
  ms.forEach((m) => {
    byId[m.id] = m;
  });
  const rs = data.ratings.filter((r) => ids.has(r.matchId));
  const recs: RecordRow[] = [];

  if (ms.length) {
    let b = best(ms, (m) => (num(m.scoreA) as number) + (num(m.scoreB) as number));
    recs.push({ kind: 'match', icon: '🔥', title: 'Partita con più gol', value: `${b.v} gol`, entries: b.items.map((match) => ({ match })) });
    b = best(ms, (m) => Math.abs((num(m.scoreA) as number) - (num(m.scoreB) as number)));
    if (b.v > 0) recs.push({ kind: 'match', icon: '💥', title: 'Vittoria più larga', value: `+${b.v}`, entries: b.items.map((match) => ({ match })) });
  }

  const pr = (fn: (r: Rating) => number | null) =>
    rs
      .map((r) => ({ r, name: playerKey(players, r.playerId, r.player).name, v: fn(r) }))
      .filter((x): x is { r: Rating; name: string; v: number } => x.v != null && x.v > 0);
  const lines: Array<[string, string, (r: Rating) => number | null, (v: number) => string]> = [
    ['🎯', 'Più gol in una partita', (r) => parseInt(r.goals as string) || 0, (v) => `${v} gol`],
    ['🅰️', 'Più assist in una partita', (r) => parseInt(r.assist as string) || 0, (v) => `${v} assist`],
    ['🌟', 'Voto più alto', (r) => validVote(r.rating), (v) => String(v)],
  ];
  lines.forEach(([icon, title, fn, fmt]) => {
    const items = pr(fn);
    if (!items.length) return;
    const b = best(items, (x) => x.v);
    recs.push({
      kind: 'rating', icon, title, value: fmt(b.v),
      entries: b.items.slice(0, 4).map((x) => ({ name: x.name, match: byId[x.r.matchId] })),
    });
  });

  // serie dentro la stagione (per giocatore, in ordine di data)
  const st: Record<string, { name: string; un: number; w: number; l: number; bu: number; bw: number; bl: number }> = {};
  ms.forEach((m) => {
    const a = num(m.scoreA) as number;
    const b = num(m.scoreB) as number;
    const sides: Array<[typeof m.teamA, number]> = [
      [m.teamA, Math.sign(a - b)],
      [m.teamB, Math.sign(b - a)],
    ];
    sides.forEach(([team, res]) => {
      new Map(
        normalizeTeam(team).map((pl) => {
          const k = playerKey(players, pl.id, pl.name);
          return [k.key, k.name] as const;
        }),
      ).forEach((name, k) => {
        const s = (st[k] ??= { name, un: 0, w: 0, l: 0, bu: 0, bw: 0, bl: 0 });
        s.un = res >= 0 ? s.un + 1 : 0;
        s.w = res > 0 ? s.w + 1 : 0;
        s.l = res < 0 ? s.l + 1 : 0;
        s.bu = Math.max(s.bu, s.un);
        s.bw = Math.max(s.bw, s.w);
        s.bl = Math.max(s.bl, s.l);
      });
    });
  });
  const S = Object.values(st);
  const streaks: Array<[string, string, 'bu' | 'bw' | 'bl']> = [
    ['🧱', 'Più partite di fila senza sconfitte', 'bu'],
    ['🔥', 'Più vittorie di fila', 'bw'],
    ['🧊', 'Più sconfitte di fila', 'bl'],
  ];
  streaks.forEach(([icon, title, f]) => {
    const b = best(S, (s) => s[f]);
    if (b.v >= 2) recs.push({ kind: 'streak', icon, title, value: `${b.v} partite`, entries: b.items.slice(0, 4).map((s) => ({ name: s.name })) });
  });
  return recs;
}
