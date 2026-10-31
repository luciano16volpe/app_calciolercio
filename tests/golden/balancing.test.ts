// Test golden: sorteggio delle squadre — stessi giocatori, stesse proposte (stesso ordine, stessi punteggi) di legacy.
// Si esegue il vero generateTeams di legacy in una pagina finta e si confronta la lista delle proposte.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODULES, GOALS_PER_POINT, SLOT_FALLBACK, balanceScores, combos, comboMetrics, distribLabel, generateTeams,
  getModulesForSize, goalsLabel, goalsLevel, makeSlots, predGoals, recomputeCombo, roleCountPenalty, roleFitScore,
  teamSpread, type Combo, type Module,
} from '../../src/domain/balancing';
import type { Dataset, Player } from '../../src/domain/types';
import { real } from './data';
import { loadLegacy, type LegacyData } from './legacy';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...a: any[]) => any;
interface L extends Record<string, unknown> {
  __useForm: (b: boolean) => void;
  __gen: (sa: number, sb: number, sel: number[]) => { combos: Combo[]; genBest: number | null };
  makeSlots: Fn; roleFitScore: Fn; getModulesForSize: Fn; roleCountPenalty: Fn; comboMetrics: Fn; recomputeCombo: Fn;
  combos: Fn; teamSpread: Fn; goalsLabel: Fn; predGoals: Fn; goalsLevel: Fn; distribLabel: Fn; wScore: Fn;
  MODULES: Record<number, Module[]>; SLOT_FALLBACK: Record<number, unknown>; GOALS_PER_POINT: number;
}

const FUNCS = [
  'makeSlots', 'roleFitScore', 'getModulesForSize', 'roleCountPenalty', 'comboMetrics', 'recomputeCombo', 'generateTeams',
  'combos', 'teamSpread', 'goalsLabel', 'neededTotal', 'wScore', 'effectiveScore', 'playerRatingAvg', 'playerSeason',
  'seasonStats', 'playerKey', 'normalizeTeam', 'getPlayerMatchResult', 'validVote', 'seasonOf', 'calcOvr', 'formWeight',
];
const CONSTS = ['MODULES', 'SLOT_FALLBACK', 'GOALS_PER_POINT', 'predGoals', 'goalsLevel', 'distribLabel',
  'FORM_MAX_WEIGHT', 'FORM_MIN_RATINGS', 'FORM_FULL_RATINGS'];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const shuffle = <T,>(a: T[], r: () => number) => a.map((x) => [r(), x] as const).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

/** Rosa vera, oppure una rosa con ruoli e statistiche cambiati (anche giocatori senza ruolo o con tutti e tre). */
function roster(variant: number): LegacyData {
  if (variant === 0) return real as unknown as LegacyData;
  const r = rng(variant * 977);
  const roleSets = [['ATT'], ['MED'], ['DIF'], ['ATT', 'MED'], ['MED', 'DIF'], ['ATT', 'DIF'], ['ATT', 'MED', 'DIF'], []];
  const players = real.players.map((p) => ({
    ...p,
    roles: roleSets[Math.floor(r() * roleSets.length)] as string[],
    stats: p.stats.map(() => 2 + Math.floor(r() * 8)),
  }));
  return { ...(real as unknown as LegacyData), players };
}

const TODAY = '2026-10-31';
const legacyOf = (d: LegacyData) => loadLegacy<L>(FUNCS, CONSTS, d, TODAY);
const asDataset = (d: LegacyData): Dataset => d as unknown as Dataset;

describe('moduli e schieramenti', () => {
  const legacy = legacyOf(real as unknown as LegacyData);
  it('makeSlots, moduli predefiniti e schieramenti di riserva uguali a legacy', () => {
    for (const [d, m, a] of [[1, 2, 1], [1, 1, 2], [2, 2, 2], [3, 1, 1], [0, 0, 0], [2, 2, 0]] as const) {
      expect(makeSlots(1, d, m, a)).toEqual(legacy.makeSlots(1, d, m, a));
    }
    expect(DEFAULT_MODULES).toEqual(legacy.MODULES);
    expect(SLOT_FALLBACK).toEqual(legacy.SLOT_FALLBACK);
    for (let n = 0; n <= 9; n++) expect(getModulesForSize(n)).toEqual(legacy.getModulesForSize(n));
  });
  it('combos: stessi sottoinsiemi nello stesso ordine', () => {
    for (const [n, k] of [[5, 2], [6, 3], [8, 4], [4, 0], [4, 4]] as const) {
      const arr = Array.from({ length: n }, (_, i) => i * 3);
      expect(combos(arr, k)).toEqual(legacy.combos(arr, k));
    }
  });
});

describe('gol attesi', () => {
  const legacy = legacyOf(real as unknown as LegacyData);
  it('predGoals, etichetta, livello e distribuzione come legacy', () => {
    expect(GOALS_PER_POINT).toBe(legacy.GOALS_PER_POINT);
    for (const v of [0, 0.01, 0.05, 0.0555, -0.0555, 0.0556, 0.1, -0.1, 0.11, 0.2777, 0.2778, 0.5, -0.5, 1, -2.4]) {
      expect(predGoals(v)).toBe(legacy.predGoals(v));
      expect(goalsLabel(v)).toBe(legacy.goalsLabel(v));
      expect(goalsLevel(v)).toBe(legacy.goalsLevel(v));
    }
    for (const d of [0, 0.5, 0.51, 1.2, 1.21, 3]) expect(distribLabel(d)).toBe(legacy.distribLabel(d));
  });
  it('soglie: < 0,5 gol "pari"; < 1 verde; < 2,5 giallo', () => {
    expect(goalsLabel(0.05)).toBe('≈ pari');
    expect(goalsLabel(-0.2)).toBe('≈ +1.8 gol per i Bianchi');
    expect(goalsLabel(0.2)).toBe('≈ +1.8 gol per i Blu');
    expect(goalsLevel(0.1)).toBe('ok');
    expect(goalsLevel(0.2)).toBe('warn');
    expect(goalsLevel(0.3)).toBe('bad');
  });
});

describe.each([0, 1, 2, 3])('rosa %i (0 = vera, altre = ruoli e statistiche cambiati)', (variant) => {
  const raw = roster(variant);
  const data = asDataset(raw);
  const legacy = legacyOf(raw);
  const n = data.players.length;
  const players = data.players;

  const scoresOf = (useForm: boolean) => balanceScores(data, real.weights, useForm);

  it('valori di bilanciamento di tutti i giocatori uguali a legacy', () => {
    for (const useForm of [true, false]) {
      legacy.__useForm(useForm);
      const s = scoresOf(useForm);
      players.forEach((p, i) => expect(s[i]).toBeCloseTo(legacy.wScore(p), 12));
    }
    legacy.__useForm(true);
  });

  it('roleFitScore, roleCountPenalty, teamSpread e comboMetrics identici su 200 divisioni casuali', () => {
    const r = rng(100 + variant);
    const scores = scoresOf(true);
    const ctx = { players, scores };
    for (let t = 0; t < 200; t++) {
      const sizeA = 3 + Math.floor(r() * 5);
      const sizeB = 3 + Math.floor(r() * 5);
      const pick = shuffle(Array.from({ length: n }, (_, i) => i), r).slice(0, sizeA + sizeB);
      const tA = pick.slice(0, sizeA);
      const tB = pick.slice(sizeA);
      const mA = getModulesForSize(sizeA);
      const mB = getModulesForSize(sizeB);
      const modA = mA[Math.floor(r() * mA.length)] as Module;
      const modB = mB[Math.floor(r() * mB.length)] as Module;
      expect(roleFitScore(players, tA, modA.slots)).toBe(legacy.roleFitScore(tA, modA.slots));
      expect(roleCountPenalty(players, tA, tB)).toBe(legacy.roleCountPenalty(tA, tB));
      expect(teamSpread(tA, scores)).toEqual(legacy.teamSpread(tA));
      expect(comboMetrics(ctx, tA, tB, modA, modB)).toEqual(legacy.comboMetrics(tA, tB, modA, modB));
      expect(comboMetrics(ctx, tA, tB, null, null)).toEqual(legacy.comboMetrics(tA, tB, null, null));
    }
  });

  const formats: Array<[string, number, number]> = [['5 vs 5', 5, 5], ['6 vs 6', 6, 6], ['5 vs 6', 5, 6], ['4 vs 6', 4, 6], ['3 vs 5', 3, 5], ['2 vs 3', 2, 3]];
  it.each(formats)('generateTeams %s: stesse proposte, stesso ordine, stessi punteggi, con e senza "usa la forma"', (_l, sa, sb) => {
    for (const useForm of [true, false]) {
      legacy.__useForm(useForm);
      const scores = scoresOf(useForm);
      for (let seed = 1; seed <= 2; seed++) {
        const selected = shuffle(Array.from({ length: n }, (_, i) => i), rng(seed * 31 + sa)).slice(0, sa + sb);
        const mine = generateTeams({ players, scores, selected, sizeA: sa, sizeB: sb }) as NonNullable<ReturnType<typeof generateTeams>>;
        const theirs = legacy.__gen(sa, sb, selected);
        expect(mine.combos.length).toBeGreaterThan(0);
        expect(mine.combos.length).toBeLessThanOrEqual(50);
        expect(mine.combos).toEqual(theirs.combos);
        expect(mine.genBest).toBe(theirs.genBest);
      }
    }
    legacy.__useForm(true);
  });

  it('generateTeams 7 vs 7 (14 giocatori) identico', () => {
    if (variant > 1) return; // il caso più pesante: basta su due rose
    const scores = scoresOf(true);
    const selected = shuffle(Array.from({ length: n }, (_, i) => i), rng(7)).slice(0, 14);
    const mine = generateTeams({ players, scores, selected, sizeA: 7, sizeB: 7 }) as NonNullable<ReturnType<typeof generateTeams>>;
    const theirs = legacy.__gen(7, 7, selected);
    expect(mine.combos).toEqual(theirs.combos);
    expect(mine.genBest).toBe(theirs.genBest);
  });

  it('numero sbagliato di convocati: nessuna proposta', () => {
    const scores = scoresOf(true);
    expect(generateTeams({ players, scores, selected: [0, 1, 2], sizeA: 5, sizeB: 5 })).toBeNull();
  });

  it('moduli personalizzati: identico a legacy', () => {
    const scores = scoresOf(true);
    const custom: Record<number, Module[]> = {
      5: [{ notation: '1-0-2-2', desc: 'prova', slots: makeSlots(1, 0, 2, 2) }],
      6: DEFAULT_MODULES[6] as Module[],
    };
    legacy.MODULES[5] = custom[5] as Module[];
    const selected = shuffle(Array.from({ length: n }, (_, i) => i), rng(5)).slice(0, 10);
    const mine = generateTeams({ players, scores, selected, sizeA: 5, sizeB: 5, modules: { ...DEFAULT_MODULES, ...custom } });
    const theirs = legacy.__gen(5, 5, selected);
    expect(mine?.combos).toEqual(theirs.combos);
    expect(mine?.combos.every((c) => c.modA?.notation === '1-0-2-2')).toBe(true);
  });

  it('recomputeCombo dopo uno scambio a mano identico a legacy', () => {
    const scores = scoresOf(true);
    const selected = shuffle(Array.from({ length: n }, (_, i) => i), rng(3)).slice(0, 10);
    const theirs = legacy.__gen(5, 5, selected);
    const c = theirs.combos[0] as Combo;
    // scambio il primo di A con il primo di B
    const swapped: Combo = { ...c, tA: [c.tB[0] as number, ...c.tA.slice(1)], tB: [c.tA[0] as number, ...c.tB.slice(1)] };
    const legacyCopy = { ...swapped };
    legacy.recomputeCombo(legacyCopy);
    expect(recomputeCombo({ players, scores }, swapped)).toEqual(legacyCopy);
    expect(legacyCopy.custom).toBe(true);
  });
});

describe('copertura', () => {
  it('le proposte hanno differenze di media diverse e più moduli (il confronto non è banale)', () => {
    const data = asDataset(real as unknown as LegacyData);
    const scores = balanceScores(data, real.weights, true);
    const selected = Array.from({ length: 10 }, (_, i) => i);
    const out = generateTeams({ players: data.players as Player[], scores, selected, sizeA: 5, sizeB: 5 }) as NonNullable<ReturnType<typeof generateTeams>>;
    expect(new Set(out.combos.map((c) => c.diff.toFixed(6))).size).toBeGreaterThan(10);
    expect(out.combos).toHaveLength(50);
    // con rose diverse (ruoli diversi) vincono moduli diversi: il confronto con legacy li esercita davvero
    const notations = new Set<string>();
    for (const v of [0, 1, 2, 3]) {
      const d = asDataset(roster(v));
      const o = generateTeams({ players: d.players, scores: balanceScores(d, real.weights, true), selected, sizeA: 5, sizeB: 5 });
      o?.combos.forEach((c) => notations.add((c.modA as Module).notation + '|' + (c.modB as Module).notation));
    }
    expect(notations.size).toBeGreaterThan(1);
    // la prima proposta è tra le più equilibrate
    expect(out.combos[0]!.diff).toBeLessThan(0.2);
  });
});
