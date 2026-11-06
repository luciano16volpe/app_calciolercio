// Coppie: compagni e avversari di un giocatore, classifica delle coppie.
import { normalizeTeam, playerKey, scopeMatches } from './stats';
import type { Dataset, Player } from './types';

const num = (v: unknown): number | null => {
  const n = parseInt(v as string);
  return isNaN(n) ? null : n;
};

export interface PairMate {
  name: string;
  w: number;
  d: number;
  l: number;
  n: number;
}

/**
 * 🤝 Compagni e rivali di sempre di un giocatore (minimo 3 partite; ogni riga solo se "più della metà").
 * friend = compagno d'oro, cursed = compagno maledetto, nemesis = bestia nera, victim = vittima preferita.
 */
export function playerPairs(
  data: Dataset,
  p: Pick<Player, 'id' | 'name'>,
): { friend: PairMate | null; cursed: PairMate | null; nemesis: PairMate | null; victim: PairMate | null } {
  const { players } = data;
  const me = playerKey(players, p.id, p.name).key;
  const tog: Record<string, PairMate> = {};
  const vs: Record<string, PairMate> = {};
  const add = (map: Record<string, PairMate>, k: string, name: string, res: number) => {
    const c = (map[k] ??= { name, w: 0, d: 0, l: 0, n: 0 });
    c.n++;
    if (res > 0) c.w++;
    else if (res === 0) c.d++;
    else c.l++;
  };
  data.matches.forEach((m) => {
    const a = num(m.scoreA);
    const b = num(m.scoreB);
    if (a == null || b == null) return;
    const A = normalizeTeam(m.teamA).map((pl) => playerKey(players, pl.id, pl.name));
    const B = normalizeTeam(m.teamB).map((pl) => playerKey(players, pl.id, pl.name));
    const inA = A.some((x) => x.key === me);
    const inB = B.some((x) => x.key === me);
    if (!inA && !inB) return;
    const [mine, theirs, res] = inA ? [A, B, Math.sign(a - b)] : [B, A, Math.sign(b - a)];
    const seen = new Set([me]);
    mine.forEach((x) => {
      if (!seen.has(x.key)) {
        seen.add(x.key);
        add(tog, x.key, x.name, res);
      }
    });
    theirs.forEach((x) => {
      if (!seen.has(x.key)) {
        seen.add(x.key);
        add(vs, x.key, x.name, res);
      }
    });
  });
  const T = Object.values(tog).filter((c) => c.n >= 3);
  const V = Object.values(vs).filter((c) => c.n >= 3);
  const top = (arr: PairMate[], f: (c: PairMate) => number): PairMate | null =>
    arr
      .filter((c) => f(c) > 0.5)
      .sort((x, y) => f(y) - f(x) || y.n - x.n || x.name.localeCompare(y.name))[0] ?? null;
  return {
    friend: top(T, (c) => c.w / c.n),
    cursed: top(T, (c) => c.l / c.n),
    nemesis: top(V, (c) => c.l / c.n),
    victim: top(V, (c) => c.w / c.n),
  };
}

export interface PairRecord {
  a: string;
  b: string;
  w: number;
  d: number;
  l: number;
  gd: number;
  n: number;
}

/** Coppie che hanno giocato insieme almeno 3 partite con risultato, in una stagione o in tutto ('all'). */
export function scopePairs(data: Dataset, scope: string): PairRecord[] {
  const { players } = data;
  const pairs: Record<string, Omit<PairRecord, 'n'>> = {};
  scopeMatches(data.matches, scope).forEach((m) => {
    const a = num(m.scoreA);
    const b = num(m.scoreB);
    if (a == null || b == null) return;
    const sides: Array<[typeof m.teamA, number]> = [
      [m.teamA, a - b],
      [m.teamB, b - a],
    ];
    sides.forEach(([team, gd]) => {
      const ks = [
        ...new Map(
          normalizeTeam(team).map((pl) => {
            const k = playerKey(players, pl.id, pl.name);
            return [k.key, k.name] as const;
          }),
        ).entries(),
      ];
      for (let x = 0; x < ks.length; x++) {
        for (let y = x + 1; y < ks.length; y++) {
          const [p1, p2] = [ks[x], ks[y]].sort((u, v) => ((u as [string, string])[0] < (v as [string, string])[0] ? -1 : 1)) as [
            [string, string],
            [string, string],
          ];
          const id = p1[0] + '|' + p2[0];
          const c = (pairs[id] ??= { a: p1[1], b: p2[1], w: 0, d: 0, l: 0, gd: 0 });
          if (gd > 0) c.w++;
          else if (gd === 0) c.d++;
          else c.l++;
          c.gd += gd;
        }
      }
    });
  });
  return Object.values(pairs)
    .map((c) => ({ ...c, n: c.w + c.d + c.l }))
    .filter((c) => c.n >= 3);
}

/** Classifica delle coppie: le 8 migliori ("Coppie d'oro") e le 5 peggiori ("Coppie maledette"). */
export function pairsRanking(data: Dataset, scope: string): { all: PairRecord[]; gold: PairRecord[]; bad: PairRecord[] } {
  const ps = scopePairs(data, scope);
  const gold = ps
    .filter((c) => c.w > 0)
    .sort((x, y) => y.w - x.w || y.w / y.n - x.w / x.n || y.gd - x.gd)
    .slice(0, 8);
  const bad = ps
    .filter((c) => c.l > 0)
    .sort((x, y) => y.l - x.l || y.l / y.n - x.l / x.n || x.gd - y.gd)
    .slice(0, 5);
  return { all: ps, gold, bad };
}
