// Confronto testa a testa tra due giocatori.
// Fonte: headToHead, scopeMvp, scopeTrophies, compareRows, cmpLead, defaultRival in legacy/index.html.
import { alboSeasons, FEATS, type AlboRow, type SeasonAwards } from './awards';
import { noVS } from './format';
import { mvpPerf, normalizeTeam, playerKey, scopeMatches, seasonStats, type PlayerSeason } from './stats';
import type { Dataset, Player } from './types';

const num = (v: unknown): number | null => {
  const n = parseInt(v as string);
  return isNaN(n) ? null : n;
};

export interface HeadToHead {
  /** Partite giocate uno contro l'altro: vittorie di A, di B, pareggi, partite, differenza reti vista da A. */
  vs: { a: number; b: number; d: number; n: number; gd: number };
  /** Partite giocate nella stessa squadra. */
  tog: { w: number; d: number; l: number; n: number };
}

/** Partite con risultato in cui hanno giocato entrambi: da avversari e da compagni. */
export function headToHead(data: Dataset, pa: Pick<Player, 'id' | 'name'>, pb: Pick<Player, 'id' | 'name'>, scope: string): HeadToHead {
  const { players } = data;
  const ka = playerKey(players, pa.id, pa.name).key;
  const kb = playerKey(players, pb.id, pb.name).key;
  const r: HeadToHead = { vs: { a: 0, b: 0, d: 0, n: 0, gd: 0 }, tog: { w: 0, d: 0, l: 0, n: 0 } };
  scopeMatches(data.matches, scope).forEach((m) => {
    const sa = num(m.scoreA);
    const sb = num(m.scoreB);
    if (sa == null || sb == null) return;
    const A = new Set(normalizeTeam(m.teamA).map((x) => playerKey(players, x.id, x.name).key));
    const B = new Set(normalizeTeam(m.teamB).map((x) => playerKey(players, x.id, x.name).key));
    const sideA = A.has(ka) ? 1 : B.has(ka) ? -1 : 0;
    const sideB = A.has(kb) ? 1 : B.has(kb) ? -1 : 0;
    if (!sideA || !sideB) return;
    const gdA = sideA * (sa - sb);
    if (sideA !== sideB) {
      r.vs.n++;
      r.vs.gd += gdA;
      if (gdA > 0) r.vs.a++;
      else if (gdA < 0) r.vs.b++;
      else r.vs.d++;
    } else {
      r.tog.n++;
      if (gdA > 0) r.tog.w++;
      else if (gdA === 0) r.tog.d++;
      else r.tog.l++;
    }
  });
  return r;
}

/** Titoli di MVP per giocatore (stessa formula e stessa regola dei pareggi delle partite). */
export function scopeMvp(data: Dataset, scope: string): Record<string, number> {
  const ids = new Set(scopeMatches(data.matches, scope).map((m) => m.id));
  const best: Record<string, { pf: number; key: string }> = {};
  const c: Record<string, number> = {};
  data.ratings.forEach((r) => {
    if (!ids.has(r.matchId)) return;
    const pf = mvpPerf(r);
    if (pf == null) return;
    const cur = best[r.matchId];
    if (!cur || pf > cur.pf) best[r.matchId] = { pf, key: playerKey(data.players, r.playerId, r.player).key };
  });
  Object.values(best).forEach((b) => {
    c[b.key] = (c[b.key] || 0) + 1;
  });
  return c;
}

/** Trofei di una stagione o di sempre: premi, premi della vergogna, imprese. */
export function scopeTrophies(
  data: Dataset,
  p: Pick<Player, 'id' | 'name'>,
  scope: string,
  seasons: SeasonAwards[],
): { prize: number; shame: number; feats: number; emojis: string[] } {
  const name = playerKey(data.players, p.id, p.name).name;
  const out = { prize: 0, shame: 0, feats: 0, emojis: [] as string[] };
  seasons
    .filter((S) => scope === 'all' || S.key === scope)
    .forEach((S) => {
      S.awards.forEach((a) => {
        if (a.winners.some((w) => w === name || w.split(' & ').includes(name))) {
          if (a.shame) out.shame++;
          else out.prize++;
          if (!a.shame) out.emojis.push(noVS((a.t.split(' ')[0] as string)));
        }
      });
      FEATS.forEach((f) => {
        out.feats += (S.feats[f.k] || []).find((x) => x.name === name)?.count || 0;
      });
    });
  return out;
}

/** Una riga del confronto: etichetta, valore di A e di B, come scriverlo, e se "meno è meglio". */
export interface CompareRow {
  label: string;
  a: number | null;
  b: number | null;
  text: (v: number | null) => string;
  lowerIsBetter?: boolean;
}

/** Tutte le righe del confronto tra due giocatori. `albo` = albo salvato (per i premi vinti). */
export function compareRows(
  data: Dataset,
  pa: Player,
  pb: Player,
  scope: string,
  albo: AlboRow[] = [],
  today?: string,
): CompareRow[] {
  const S = seasonStats(data, scope);
  const mv = scopeMvp(data, scope);
  const empty = { pres: 0, w: 0, d: 0, l: 0, goals: 0, assist: 0, autogol: 0, rigori: 0, meta: 0, voteAvg: null } as unknown as PlayerSeason;
  const g = (p: Player): PlayerSeason => S[playerKey(data.players, p.id, p.name).key] ?? empty;
  const A = g(pa);
  const B = g(pb);
  const seasons = alboSeasons(data, albo, today);
  const ta = scopeTrophies(data, pa, scope, seasons);
  const tb = scopeTrophies(data, pb, scope, seasons);
  const wp = (x: PlayerSeason) => (x.w + x.d + x.l ? x.w / (x.w + x.d + x.l) : null);
  const gp = (x: PlayerSeason) => (x.pres ? x.goals / x.pres : null);
  const kA = playerKey(data.players, pa.id, pa.name).key;
  const kB = playerKey(data.players, pb.id, pb.name).key;
  const int = (v: number | null) => String(v);
  const dash = (f: (v: number) => string) => (v: number | null) => (v == null ? '—' : f(v));
  return [
    { label: 'Presenze', a: A.pres, b: B.pres, text: int },
    { label: '% Vittorie', a: wp(A), b: wp(B), text: dash((v) => Math.round(v * 100) + '%') },
    { label: '⚽ Gol', a: A.goals, b: B.goals, text: int },
    { label: '⚽ Gol a partita', a: gp(A), b: gp(B), text: dash((v) => v.toFixed(2)) },
    { label: '🅰️ Assist', a: A.assist, b: B.assist, text: int },
    { label: '⭐ Media voto', a: A.voteAvg, b: B.voteAvg, text: dash((v) => v.toFixed(2)) },
    { label: '👑 Volte MVP', a: mv[kA] || 0, b: mv[kB] || 0, text: int },
    { label: '🚀 Mete', a: A.meta, b: B.meta, text: int },
    { label: '🏆 Premi vinti', a: ta.prize, b: tb.prize, text: int },
    { label: '🎩 Imprese', a: ta.feats, b: tb.feats, text: int },
    { label: '🙃 Autogol', a: A.autogol, b: B.autogol, text: int, lowerIsBetter: true },
    { label: '❌ Rigori sbagliati', a: A.rigori, b: B.rigori, text: int, lowerIsBetter: true },
  ];
}

/** Chi è avanti in una riga: 1 = A, −1 = B, 0 = pari o dato mancante. */
export const cmpLead = (a: number | null, b: number | null, low?: boolean): 1 | -1 | 0 =>
  a == null || b == null || Math.abs(a - b) < 1e-9 ? 0 : (low ? a < b : a > b) ? 1 : -1;

/**
 * L'avversario proposto quando si parte dalla scheda di un giocatore: quello incontrato più spesso
 * da avversario. `candidates` = gli altri giocatori nell'ordine della rosa. Nessuno → null.
 */
export function defaultRival(data: Dataset, p: Player, candidates: Player[]): Player | null {
  let best: Player | null = null;
  let bn = -1;
  candidates
    .filter((c) => c !== p)
    .forEach((c) => {
      const n = headToHead(data, p, c, 'all').vs.n;
      if (n > bn) {
        bn = n;
        best = c;
      }
    });
  return best;
}
