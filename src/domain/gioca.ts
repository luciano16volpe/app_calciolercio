// Gioca: giocatori delle squadre, scambi a mano, riepilogo di una proposta, precisione del bilanciamento.
// Fonte: renderResult, swapPlayers, balancePrecisionHTML in legacy/index.html.
import {
  distribLabel, goalsLabel, goalsLevel, predGoals, recomputeCombo, type BalanceContext, type Combo,
} from './balancing';
import type { PitchPlayer } from './pitch';
import type { Match, Player } from './types';

const ROLE_ORDER: Record<string, number> = { ATT: 0, MED: 1, DIF: 2 };

/** Ruolo mostrato di un giocatore: il primo, altrimenti centrocampista. */
export const primaryRole = (p: { roles?: string[] }): string => (p.roles && p.roles[0]) || 'MED';

export interface TeamPlayer extends PitchPlayer {
  /** posizione nella rosa */
  idx: number;
  /** valore di bilanciamento */
  score: number;
}

/** I giocatori di una squadra (indici nella rosa) con valore e ruolo mostrato, in ordine attacco → centrocampo → difesa. */
export function teamPlayers(
  players: Array<Pick<Player, 'name' | 'roles'> & { photo?: string | null }>,
  scores: number[],
  team: number[],
): TeamPlayer[] {
  return team
    .map((i) => {
      const p = players[i] as (typeof players)[number];
      return { name: p.name, photo: p.photo ?? null, roles: p.roles ?? [], idx: i, score: scores[i] as number, dispRole: primaryRole(p) };
    })
    .sort((a, b) => (ROLE_ORDER[a.dispRole] as number) - (ROLE_ORDER[b.dispRole] as number));
}

/**
 * Scambio a mano di due giocatori tra le squadre (trascinando): rimette a posto le squadre e ricalcola la proposta.
 * Restituisce una nuova proposta marcata `custom`, oppure null se i due non sono uno per squadra.
 */
export function swapPlayers(ctx: BalanceContext, c: Combo, pidxA: number, pidxB: number): Combo | null {
  const tA = [...c.tA];
  const tB = [...c.tB];
  const inA = tA.indexOf(pidxA);
  const inB = tB.indexOf(pidxB);
  const inA2 = tA.indexOf(pidxB);
  const inB2 = tB.indexOf(pidxA);
  if (inA !== -1 && inB !== -1) {
    tA[inA] = pidxB;
    tB[inB] = pidxA;
  } else if (inA2 !== -1 && inB2 !== -1) {
    tA[inA2] = pidxA;
    tB[inB2] = pidxB;
  } else return null; // non è una coppia di squadre diverse
  return recomputeCombo(ctx, { ...c, tA, tB });
}

export interface ComboSummary {
  avgA: string;
  avgB: string;
  modLabelA: string;
  modLabelB: string;
  /** squilibrio in gol espresso a parole, con livello e differenza */
  balance: { level: 'ok' | 'warn' | 'bad'; label: string; diff: string; cost: string | null };
  idxText: string;
  quality: { text: string; level: 'ok' | 'warn' | 'bad' };
}

/** Tutto ciò che si legge sotto le squadre per la proposta mostrata. `genBest` = Blu − Bianchi della 1ª proposta. */
export function comboSummary(c: Combo, genBest: number | null, currentIdx: number, total: number): ComboSummary {
  const pred = c.sA - c.sB;
  const level = goalsLevel(pred);
  let cost: string | null = null;
  if (genBest != null && (c.custom || currentIdx > 0)) {
    const extra = Math.abs(predGoals(pred)) - Math.abs(predGoals(genBest));
    if (extra >= 0.3) cost = `rispetto alla 1ª proposta: +${extra.toFixed(1)} gol di squilibrio`;
  }
  const rfPct = Math.round((c.roleFit || 0) * 100);
  const distrib = c.distrib !== undefined ? c.distrib : 0;
  return {
    avgA: 'Media ' + c.sA.toFixed(1),
    avgB: 'Media ' + c.sB.toFixed(1),
    modLabelA: c.modA ? `${c.modA.notation}  ·  ${c.modA.desc || ''}` : '',
    modLabelB: c.modB ? `${c.modB.notation}  ·  ${c.modB.desc || ''}` : '',
    balance: { level, label: goalsLabel(pred), diff: c.diff.toFixed(2), cost },
    idxText: c.custom ? '✏️ Personalizzata' : `${currentIdx + 1} / ${total}`,
    quality: { text: `diff ${c.diff.toFixed(2)}  ·  ${distribLabel(distrib)}  ·  ruoli ${rfPct}%`, level },
  };
}

// ── 🎯 precisione del bilanciamento ────────────────────────────────────────
const num = (v: unknown): number | null => {
  const n = parseInt(v as string);
  return isNaN(n) ? null : n;
};

export interface BalancePrecision {
  /** scarto medio in gol sulle ultime 10 partite con risultato */
  avgMargin: number;
  marginColor: string;
  /** % di partite entro 2 gol */
  within2: number;
  /** partite valutate */
  n: number;
  /** previsione salvata: null se nessuna partita ha la previsione */
  pred: null | {
    withPred: number;
    favorite: string;
    error: string;
    firstPlayed: string;
  };
}

/** Quanto è affidabile il bilanciamento, sulle ultime 10 partite con risultato. Nessuna partita giocata → null. */
export function balancePrecision(ms: Array<Pick<Match, 'id' | 'date' | 'scoreA' | 'scoreB'> & { pred?: unknown; predRank?: unknown }>): BalancePrecision | null {
  const scored = ms
    .filter((m) => num(m.scoreA) != null && num(m.scoreB) != null)
    .sort((x, y) => String(x.date).localeCompare(String(y.date)) || String(x.id).localeCompare(String(y.id)));
  if (!scored.length) return null;
  const last = scored.slice(-10);
  const gdOf = (m: (typeof ms)[number]) => (num(m.scoreA) as number) - (num(m.scoreB) as number);
  const avgMargin = last.reduce((s, m) => s + Math.abs(gdOf(m)), 0) / last.length;
  const within2 = Math.round((last.filter((m) => Math.abs(gdOf(m)) <= 2).length / last.length) * 100);
  const marginColor = avgMargin <= 2 ? 'var(--green)' : avgMargin <= 4 ? 'var(--amber)' : 'var(--red)';

  const withPred = scored.filter((m) => m.pred != null && m.pred !== '' && !isNaN(Number(m.pred)));
  let pred: BalancePrecision['pred'] = null;
  if (withPred.length) {
    const dec = withPred.filter((m) => gdOf(m) !== 0 && Math.abs(predGoals(Number(m.pred))) >= 0.5);
    const favWins = dec.filter((m) => Math.sign(Number(m.pred)) === Math.sign(gdOf(m))).length;
    const err = withPred.reduce((s, m) => s + Math.abs(gdOf(m) - predGoals(Number(m.pred))), 0) / withPred.length;
    const ranked = withPred.filter((m) => m.predRank != null && m.predRank !== '');
    const firstPlayed = ranked.filter((m) => Number(m.predRank) === 1).length;
    pred = {
      withPred: withPred.length,
      favorite: dec.length ? favWins + '/' + dec.length : '—',
      error: err.toFixed(1),
      firstPlayed: ranked.length ? firstPlayed + '/' + ranked.length : '—',
    };
  }
  return { avgMargin, marginColor, within2, n: last.length, pred };
}
