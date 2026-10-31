// Sorteggio delle squadre equilibrate (Gioca).
// Fonte: makeSlots, MODULES, SLOT_FALLBACK, getModulesForSize, combos, teamSpread, roleFitScore,
// roleCountPenalty, comboMetrics, recomputeCombo, generateTeams, predGoals… in legacy/index.html.
//
// Le squadre sono liste di INDICI nella rosa (come in legacy). `scores[i]` = valore di bilanciamento
// del giocatore i (`effectiveScore`, vedi form.ts): si calcola una volta sola prima di sorteggiare.
import { effectiveScore } from './form';
import { seasonStats } from './stats';
import type { Dataset, Player } from './types';

export interface Slot {
  role: 'ATT' | 'MED' | 'DIF';
  x: number; // 0 = propria porta, 1 = porta avversaria
  y: number;
}

export interface Module {
  notation: string;
  desc: string;
  slots: Slot[];
}

/** Il primo slot è sempre il portiere (DIF, x≈0.07). por è sempre 1; def/mid/att sono i giocatori di movimento. */
export function makeSlots(_por: number, def: number, mid: number, att: number): Slot[] {
  const s: Slot[] = [{ role: 'DIF', x: 0.07, y: 0.5 }];
  const band = (count: number, x: number, role: Slot['role']) => {
    for (let i = 0; i < count; i++) s.push({ role, x, y: (i + 0.5) / count });
  };
  band(def, 0.28, 'DIF');
  band(mid, 0.55, 'MED');
  band(att, 0.82, 'ATT');
  return s;
}

/** Moduli predefiniti per formato (5vs5, 6vs6, 7vs7). */
export const DEFAULT_MODULES: Record<number, Module[]> = {
  5: [
    { notation: '1-1-2-1', desc: 'equilibrato/offensivo', slots: makeSlots(1, 1, 2, 1) },
    { notation: '1-2-1-1', desc: 'più coperto', slots: makeSlots(1, 2, 1, 1) },
    { notation: '1-2-2-0', desc: 'senza punta, palleggio', slots: makeSlots(1, 2, 2, 0) },
  ],
  6: [
    { notation: '1-2-2-1', desc: 'equilibrato', slots: makeSlots(1, 2, 2, 1) },
    { notation: '1-3-1-1', desc: 'difensivo', slots: makeSlots(1, 3, 1, 1) },
    { notation: '1-2-3-0', desc: 'centrocampo folto', slots: makeSlots(1, 2, 3, 0) },
    { notation: '1-1-3-1', desc: 'offensivo/possesso', slots: makeSlots(1, 1, 3, 1) },
  ],
  7: [
    { notation: '1-3-2-1', desc: 'equilibrato/coperto', slots: makeSlots(1, 3, 2, 1) },
    { notation: '1-2-3-1', desc: 'più centrocampo', slots: makeSlots(1, 2, 3, 1) },
    { notation: '1-2-2-2', desc: 'più offensivo', slots: makeSlots(1, 2, 2, 2) },
  ],
};

/** Schieramenti per le dimensioni di squadra senza moduli (squadre asimmetriche). */
export const SLOT_FALLBACK: Record<number, Slot[]> = {
  1: [{ role: 'ATT', x: 0.5, y: 0.5 }],
  2: [
    { role: 'DIF', x: 0.25, y: 0.5 },
    { role: 'ATT', x: 0.75, y: 0.5 },
  ],
  3: makeSlots(1, 1, 0, 1),
  4: makeSlots(1, 1, 1, 1),
  5: (DEFAULT_MODULES[5] as Module[])[0]!.slots,
  6: (DEFAULT_MODULES[6] as Module[])[0]!.slots,
  7: (DEFAULT_MODULES[7] as Module[])[0]!.slots,
  8: makeSlots(1, 2, 2, 2),
};

/** Moduli possibili per una squadra di n giocatori; se non ce ne sono, uno solo "auto". */
export function getModulesForSize(n: number, modules: Record<number, Module[]> = DEFAULT_MODULES): Module[] {
  const m = modules[n];
  return m ? m : [{ slots: SLOT_FALLBACK[n] || (SLOT_FALLBACK[5] as Slot[]), notation: 'auto', desc: '' }];
}

/** Tutti i sottoinsiemi di k elementi. */
export function combos<T>(arr: T[], k: number): T[][] {
  const res: T[][] = [];
  const ch: T[] = [];
  const go = (s: number) => {
    if (ch.length === k) {
      res.push([...ch]);
      return;
    }
    for (let i = s; i < arr.length; i++) {
      ch.push(arr[i] as T);
      go(i + 1);
      ch.pop();
    }
  };
  go(0);
  return res;
}

/** Quanto sono distribuiti i valori di una squadra: media, deviazione, migliore, due migliori, peggiore, due peggiori. */
export function teamSpread(team: number[], scores: number[]) {
  const ovrs = team.map((i) => scores[i] as number);
  const n = ovrs.length || 1;
  const mean = ovrs.reduce((s, v) => s + v, 0) / n;
  const variance = ovrs.reduce((s, v) => s + (v - mean) * (v - mean), 0) / n;
  const std = Math.sqrt(variance);
  const sorted = [...ovrs].sort((a, b) => b - a);
  const top1 = sorted[0] || 0;
  const top2 = top1 + (sorted[1] || 0);
  const bottom1 = sorted[sorted.length - 1] || 0;
  const bottom2 = bottom1 + (sorted[sorted.length - 2] || 0);
  return { mean, std, top1, top2, bottom1, bottom2 };
}

type RolePlayer = { roles?: string[] };

/**
 * Ruoli coperti da una squadra in un modulo (0–1): ogni slot di movimento riceve un solo giocatore.
 * Lo slot del portiere (DIF più arretrato, x<0.15) non conta: il portiere ruota. Si riempiono prima
 * gli slot il cui ruolo è più raro e, tra i compatibili, si sceglie chi ha meno ruoli.
 */
export function roleFitScore(players: RolePlayer[], team: number[], slots: Slot[]): number {
  const outfield = slots.filter((s) => !(s.role === 'DIF' && s.x < 0.15));
  if (!outfield.length) return 1;
  const supply: Record<string, number> = { ATT: 0, MED: 0, DIF: 0 };
  team.forEach((i) =>
    (players[i]?.roles ?? []).forEach((r) => {
      if (supply[r] !== undefined) supply[r]!++;
    }),
  );
  const ordered = [...outfield].sort((a, b) => (supply[a.role] || 0) - (supply[b.role] || 0));
  const used = new Set<number>();
  let filled = 0;
  ordered.forEach((slot) => {
    const candidates = team
      .filter((pi) => !used.has(pi) && (players[pi]?.roles ?? []).includes(slot.role))
      .sort((a, b) => (players[a]?.roles ?? []).length - (players[b]?.roles ?? []).length);
    if (candidates.length) {
      used.add(candidates[0] as number);
      filled++;
    }
  });
  return filled / outfield.length;
}

/** Penalità per reparti sbilanciati (percentuali, un giocatore con più ruoli conta "a pezzi"): ATT×0,60 + MED×0,35 + DIF×0,45. */
export function roleCountPenalty(players: RolePlayer[], tA: number[], tB: number[]): number {
  const count = (team: number[]) => {
    const c: Record<string, number> = { ATT: 0, MED: 0, DIF: 0 };
    team.forEach((i) => {
      const valid = (players[i]?.roles ?? []).filter((r) => c[r] !== undefined);
      const share = valid.length ? 1 / valid.length : 1;
      valid.forEach((r) => {
        c[r]! += share;
      });
    });
    return c;
  };
  const a = count(tA);
  const b = count(tB);
  const diffRole = (r: string) => Math.abs((a[r] as number) / tA.length - (b[r] as number) / tB.length);
  return diffRole('ATT') * 0.6 + diffRole('MED') * 0.35 + diffRole('DIF') * 0.45;
}

// ── Squilibrio espresso in gol ──
/** Misurato sulle vostre partite: 1 punto di differenza di forza media ≈ 9 gol di scarto. */
export const GOALS_PER_POINT = 9;
/** pred = media Blu − media Bianchi (> 0 → Blu favoriti). */
export const predGoals = (pred: number): number => pred * GOALS_PER_POINT;
export function goalsLabel(pred: number): string {
  const g = predGoals(pred);
  const a = Math.abs(g);
  if (a < 0.5) return '≈ pari';
  return `≈ +${a.toFixed(1)} gol per ${g > 0 ? 'i Blu' : 'i Bianchi'}`;
}
/** verde < 1 gol · giallo < 2,5 gol · rosso oltre. */
export const goalsLevel = (pred: number): 'ok' | 'warn' | 'bad' => {
  const a = Math.abs(predGoals(pred));
  return a < 1 ? 'ok' : a < 2.5 ? 'warn' : 'bad';
};
/** Etichetta di quanto sono distribuiti forti e deboli. */
export const distribLabel = (d: number): string =>
  d <= 0.5 ? 'forti distribuiti ✓' : d <= 1.2 ? 'distribuzione ok' : 'forti sbilanciati ⚠';

/** Cosa serve per valutare una divisione: i ruoli dei giocatori e il loro valore di bilanciamento. */
export interface BalanceContext {
  players: RolePlayer[];
  scores: number[];
}

export interface ComboMetrics {
  sA: number;
  sB: number;
  diff: number;
  distrib: number;
  weakDistrib: number;
  top1Diff: number;
  top2Diff: number;
  bottom1Diff: number;
  bottom2Diff: number;
  stdDiff: number;
  roleFit: number;
  rolePenalty: number;
  repartiPenalty: number;
  extremePenalty: number;
  score: number;
}

/**
 * Tutte le misure e il punteggio finale di una divisione (più basso = meglio):
 * score = diff×1,00 + distrib×0,28 + rolePenalty×1,30 + repartiPenalty×1,10 + extremePenalty.
 * Unica fonte per generateTeams e per i ricalcoli dopo una modifica a mano.
 */
export function comboMetrics(ctx: BalanceContext, tA: number[], tB: number[], modA?: Module | null, modB?: Module | null): ComboMetrics {
  const { players, scores } = ctx;
  const sA = tA.reduce((s, i) => s + (scores[i] as number), 0) / tA.length;
  const sB = tB.reduce((s, i) => s + (scores[i] as number), 0) / tB.length;
  const diff = Math.abs(sA - sB);

  const spA = teamSpread(tA, scores);
  const spB = teamSpread(tB, scores);
  const top1Diff = Math.abs(spA.top1 - spB.top1);
  const top2Diff = Math.abs(spA.top2 - spB.top2);
  const bottom1Diff = Math.abs(spA.bottom1 - spB.bottom1);
  const bottom2Diff = Math.abs(spA.bottom2 - spB.bottom2);
  const stdDiff = Math.abs(spA.std - spB.std);
  // forti e deboli distribuiti: il migliore pesa di più, poi la coppia migliore, poi i deboli, infine la dispersione
  const distrib = top1Diff * 0.3 + top2Diff * 0.25 + bottom1Diff * 0.2 + bottom2Diff * 0.15 + stdDiff * 0.1;
  const weakDistrib = bottom1Diff * 0.25 + bottom2Diff * 0.15;

  const fitA = modA ? roleFitScore(players, tA, modA.slots) : 0;
  const fitB = modB ? roleFitScore(players, tB, modB.slots) : 0;
  const roleFit = (fitA + fitB) / 2;
  const rolePenalty = (1 - roleFit) * 0.15;
  const repartiPenalty = roleCountPenalty(players, tA, tB);

  // una squadra che accumula sia i migliori sia i peggiori viene penalizzata
  const extremeA = spA.top1 - spA.bottom1;
  const extremeB = spB.top1 - spB.bottom1;
  const extremePenalty = Math.abs(extremeA - extremeB) * 0.05;

  const score = diff * 1.0 + distrib * 0.28 + rolePenalty * 1.3 + repartiPenalty * 1.1 + extremePenalty;
  return {
    sA, sB, diff, distrib, weakDistrib, top1Diff, top2Diff, bottom1Diff, bottom2Diff, stdDiff,
    roleFit, rolePenalty, repartiPenalty, extremePenalty, score,
  };
}

export interface Combo extends ComboMetrics {
  tA: number[];
  tB: number[];
  modA?: Module | null;
  modB?: Module | null;
  /** true se modificata a mano (scambio di giocatori). */
  custom?: boolean;
}

/** Ricalcola una proposta dopo uno scambio a mano. Restituisce una nuova proposta marcata `custom`. */
export function recomputeCombo(ctx: BalanceContext, c: Combo): Combo {
  return { ...c, ...comboMetrics(ctx, c.tA, c.tB, c.modA, c.modB), custom: true };
}

export interface GenerateInput extends BalanceContext {
  /** Indici dei giocatori convocati, nell'ordine in cui sono stati scelti. */
  selected: number[];
  sizeA: number;
  sizeB: number;
  modules?: Record<number, Module[]>;
}

/**
 * Genera le proposte: tutte le divisioni, ciascuna col suo miglior modulo; prima quelle la cui differenza
 * di media è vicina alla migliore (margine 0,20 fino a 10 convocati, 0,15 oltre), poi le altre, ognuna
 * ordinata per punteggio; si tengono le prime 50. `genBest` = Blu − Bianchi della prima proposta.
 * Se i convocati non sono esattamente sizeA + sizeB restituisce null.
 */
export function generateTeams(input: GenerateInput): { combos: Combo[]; genBest: number | null } | null {
  const { selected, sizeA, sizeB } = input;
  if (selected.length !== sizeA + sizeB) return null;
  const idx = [...selected];

  const subsetsA = combos(idx, sizeA);
  const allScored: Combo[] = [];
  const seen = new Set<string>();

  subsetsA.forEach((tA) => {
    const tB = idx.filter((i) => !tA.includes(i));
    const modsA = getModulesForSize(tA.length, input.modules);
    const modsB = getModulesForSize(tB.length, input.modules);
    modsA.forEach((modA) => {
      modsB.forEach((modB) => {
        // chiave canonica: con squadre uguali "A contro B" e "B contro A" sono la stessa partita
        const kA = [...tA].sort((a, b) => a - b).join(',');
        const kB = [...tB].sort((a, b) => a - b).join(',');
        let splitKey: string;
        let notKey: string;
        if (sizeA === sizeB) {
          if (kA <= kB) {
            splitKey = kA + '/' + kB;
            notKey = modA.notation + '|' + modB.notation;
          } else {
            splitKey = kB + '/' + kA;
            notKey = modB.notation + '|' + modA.notation;
          }
        } else {
          splitKey = kA + '/' + kB;
          notKey = modA.notation + '|' + modB.notation;
        }
        const key = splitKey + '::' + notKey;
        if (seen.has(key)) return;
        seen.add(key);
        allScored.push({ tA, tB, modA, modB, ...comboMetrics(input, tA, tB, modA, modB) });
      });
    });
  });

  allScored.sort((a, b) => a.score - b.score);

  // solo divisioni DIVERSE di giocatori: la prima volta che si vede una divisione è già il suo miglior modulo
  const seenSplit = new Set<string>();
  const distinct: Combo[] = [];
  for (const c of allScored) {
    const kA = [...c.tA].sort((a, b) => a - b).join(',');
    const kB = [...c.tB].sort((a, b) => a - b).join(',');
    const splitId = sizeA === sizeB && kB < kA ? kB + '/' + kA : kA + '/' + kB;
    if (seenSplit.has(splitId)) continue;
    seenSplit.add(splitId);
    distinct.push(c);
  }

  // priorità alla media: prima le divisioni con differenza vicina alla migliore, poi le altre
  let result: Combo[] = [];
  if (distinct.length) {
    const bestDiff = Math.min(...distinct.map((c) => c.diff));
    const MARGIN = idx.length <= 10 ? 0.2 : 0.15;
    const near = distinct.filter((c) => c.diff <= bestDiff + MARGIN).sort((a, b) => a.score - b.score);
    const rest = distinct.filter((c) => c.diff > bestDiff + MARGIN).sort((a, b) => a.score - b.score);
    result = [...near, ...rest].slice(0, 50);
  }
  const first = result[0];
  return { combos: result, genBest: first ? first.sA - first.sB : null };
}

/** Valore di bilanciamento di tutti i giocatori della rosa, nell'ordine della rosa (calcolato una volta sola). */
export function balanceScores(data: Dataset, weights: number[], useForm = true): number[] {
  const all = seasonStats(data);
  return data.players.map((p: Player) => effectiveScore(data, weights, p, useForm, all));
}
