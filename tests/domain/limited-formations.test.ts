import { expect, test } from 'vitest';
import { comboMetrics, combos, generateTeams, getModulesForSize } from '../../src/domain/balancing';

const roles = ['ATT', 'MED', 'DIF'] as const;
const players = Array.from({ length: 16 }, (_, i) => ({ id: String(i), roles: [roles[i % 3]!] }));
const scores = Array.from({ length: 16 }, (_, i) => 5 + ((i * 7) % 13) / 5);

test('con 16 convocati restituisce al massimo 10 formazioni complete, distinte e ripetibili', () => {
  const input = { players, scores, selected: Array.from({ length: 16 }, (_, i) => i), sizeA: 8, sizeB: 8 };
  const first = generateTeams(input)!;
  const second = generateTeams(input)!;
  expect(first.combos.length).toBe(10);
  expect(second).toEqual(first);
  const keys = first.combos.map((c) => [...c.tA].sort((a, b) => a - b).join(','));
  expect(new Set(keys).size).toBe(first.combos.length);
  for (const formation of first.combos) {
    expect(formation.tA).toHaveLength(8);
    expect(formation.tB).toHaveLength(8);
    expect([...formation.tA, ...formation.tB].sort((a, b) => a - b)).toEqual(input.selected);
    expect(formation.score).toBeGreaterThanOrEqual(0);
  }
});

test('la prima proposta resta vicina alla migliore ricerca completa sui casi tipici', () => {
  for (const size of [5, 6, 7, 8]) {
    const selected = Array.from({ length: size * 2 }, (_, i) => i);
    const result = generateTeams({ players, scores, selected, sizeA: size, sizeB: size })!;
    const reference = combos(selected, size).filter((a) => a.includes(0)).map((a) => {
      const inA = new Set(a);
      const b = selected.filter((i) => !inA.has(i));
      const metrics = getModulesForSize(size).flatMap((modA) => getModulesForSize(size)
        .map((modB) => comboMetrics({ players, scores }, a, b, modA, modB)));
      return metrics.sort((x, y) => x.score - y.score)[0]!;
    });
    const bestDiff = Math.min(...reference.map((c) => c.diff));
    const margin = selected.length <= 10 ? 0.2 : 0.15;
    const bestNearScore = Math.min(...reference.filter((c) => c.diff <= bestDiff + margin).map((c) => c.score));
    expect(result.combos[0]!.diff).toBeLessThanOrEqual(bestDiff + margin + 1e-9);
    expect(result.combos[0]!.score).toBeLessThanOrEqual(bestNearScore * 1.5 + 1e-9);
  }
});

test('rispetta anche un formato asimmetrico e conserva il modulo migliore della divisione', () => {
  const selected = Array.from({ length: 11 }, (_, i) => i);
  const result = generateTeams({ players, scores, selected, sizeA: 5, sizeB: 6 })!;
  expect(result.combos.length).toBe(10);
  for (const c of result.combos) {
    expect(c.tA).toHaveLength(5);
    expect(c.tB).toHaveLength(6);
    const scoresForModules = getModulesForSize(5).flatMap((modA) => getModulesForSize(6)
      .map((modB) => comboMetrics({ players, scores }, c.tA, c.tB, modA, modB).score));
    expect(c.score).toBeCloseTo(Math.min(...scoresForModules));
  }
});

test('rispetta il minimo possibile di coppie vietate anche in rose varie', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const count = seed <= 40 ? 10 : 16;
    const size = count / 2;
    const selected = Array.from({ length: count }, (_, i) => i);
    const blocked: Array<[number, number]> = [];
    let random = seed;
    for (let a = 0; a < count; a++) for (let b = a + 1; b < count; b++) {
      random = (random * 1664525 + 1013904223) >>> 0;
      if (random % 7 === 0) blocked.push([a, b]);
    }
    const expected = Math.min(...combos(selected, size).map((a) => {
      const inA = new Set(a);
      return blocked.filter(([x, y]) => inA.has(x) === inA.has(y)).length;
    }));
    const result = generateTeams({ players, scores, selected, sizeA: size, sizeB: size, blocked })!;
    expect(result.violations, `seed ${seed}`).toBe(expected);
    expect(result.combos.length).toBeLessThanOrEqual(10);
  }
});
