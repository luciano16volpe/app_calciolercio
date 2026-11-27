import { expect, test } from 'vitest';
import { generateTeams, makeSlots } from './balancing';

test('il primo 1 del modulo è il posto del portiere', () => {
  expect(makeSlots(1, 1, 2, 1)[0]?.role).toBe('POR');
});

test('il sorteggio separa i due portieri fissi in ogni proposta', () => {
  const players = Array.from({ length: 10 }, (_, i) => ({ roles: i < 2 ? ['POR'] : ['DIF', 'MED', 'ATT'] }));
  const result = generateTeams({
    players, scores: [6, 6, 5, 5, 5, 5, 5, 5, 5, 5],
    selected: players.map((_, i) => i), sizeA: 5, sizeB: 5,
    goalkeepers: [0, 1],
  });
  expect(result?.combos.length).toBeGreaterThan(0);
  for (const combo of result?.combos ?? []) {
    expect(combo.tA.includes(0)).not.toBe(combo.tA.includes(1));
    expect(combo.tB.includes(0)).not.toBe(combo.tB.includes(1));
  }
});

test('il sorteggio accetta un solo portiere fisso', () => {
  const players = Array.from({ length: 10 }, () => ({ roles: ['DIF', 'MED', 'ATT'] }));
  const result = generateTeams({
    players, scores: Array(10).fill(5), selected: players.map((_, i) => i),
    sizeA: 5, sizeB: 5, goalkeepers: [2],
  });
  expect(result?.combos.length).toBeGreaterThan(0);
  for (const combo of result?.combos ?? []) {
    expect(combo.tA.includes(2) !== combo.tB.includes(2)).toBe(true);
  }
});

test('non accetta un portiere fisso fuori dai convocati', () => {
  const players = Array.from({ length: 4 }, () => ({ roles: ['MED'] }));
  expect(generateTeams({ players, scores: [5, 5, 5, 5], selected: [0, 1, 2, 3], sizeA: 2, sizeB: 2, goalkeepers: [0, 4] })).toBeNull();
});
