import { describe, expect, it } from 'vitest';
import { generateTeams } from '../../src/domain/balancing';
import { blockedPairs } from '../../src/domain/rotation';
import type { Dataset, Match } from '../../src/domain/types';

const players = Array.from({ length: 6 }, (_, i) => ({ id: 'p' + i, name: 'N' + i, roles: ['ATT', 'MED', 'DIF'], stats: [5] }));
const team = (ids: number[]) => ids.map((i) => ({ id: 'p' + i, name: 'N' + i }));
const game = (n: number, a: number[], b: number[], played = true): Match => ({
  id: 'm' + n, date: `2026-10-${String(n).padStart(2, '0')}`, scoreA: played ? 2 : null, scoreB: played ? 1 : null, teamA: team(a), teamB: team(b),
});
const data = (matches: Match[]): Dataset => ({ players, matches, ratings: [] });
const all = [0, 1, 2, 3, 4, 5];
const TODAY = '2026-10-31';

describe('turnazione: massimo 3 partite di fila insieme', () => {
  it('blocca la coppia insieme nelle ultime 3 partite (in squadra A o B)', () => {
    const d = data([game(1, [0, 1, 2], [3, 4, 5]), game(2, [3, 4, 5], [0, 1, 2]), game(3, [0, 1, 4], [2, 3, 5])]);
    // 0-1 e 3-5 sono insieme in tutte e tre; 2-3 e 2-5 solo nelle prime due, 0-2 e 4-5 non sempre
    expect(blockedPairs(d, all, 3, TODAY)).toEqual([[0, 1], [3, 5]]);
  });
  it('la serie si interrompe se uno dei due non c’era', () => {
    const d = data([game(1, [0, 1, 2], [3, 4, 5]), game(2, [0, 2], [3, 4, 5]), game(3, [0, 1, 2], [3, 4, 5])]);
    expect(blockedPairs(d, all, 3, TODAY)).not.toContainEqual([0, 1]);
    expect(blockedPairs(d, all, 3, TODAY)).toContainEqual([0, 2]);
  });
  it('conta solo le ultime 3 partite giocate: le programmate e le future non contano', () => {
    const d = data([game(1, [0, 1, 2], [3, 4, 5]), game(2, [0, 1, 2], [3, 4, 5]), game(3, [0, 1, 2], [3, 4, 5]), game(4, [0, 3, 2], [1, 4, 5], false), game(5, [0, 3, 2], [1, 4, 5])]);
    // oggi = 5 ottobre: ultime 3 giocate = partite 5, 3, 2 (la 4 è senza risultato) → solo 0-2 sempre insieme
    expect(blockedPairs(d, all, 3, '2026-10-05')).toContainEqual([0, 2]);
    expect(blockedPairs(d, all, 3, '2026-10-05')).not.toContainEqual([0, 1]);
    // oggi = 3 ottobre: la partita 5 è nel futuro e non conta
    expect(blockedPairs(d, all, 3, '2026-10-03')).toContainEqual([0, 1]);
  });
  it('con meno di 3 partite giocate non blocca nulla', () => {
    expect(blockedPairs(data([game(1, [0, 1, 2], [3, 4, 5]), game(2, [0, 1, 2], [3, 4, 5])]), all, 3, TODAY)).toEqual([]);
  });
  it('il sorteggio non propone mai la coppia bloccata nella stessa squadra', () => {
    const input = { players, scores: [5, 5.5, 6, 6.5, 7, 7.5], selected: all, sizeA: 3, sizeB: 3, blocked: [[0, 1]] as Array<[number, number]> };
    const result = generateTeams(input)!;
    expect(result.combos.length).toBeGreaterThan(0);
    for (const c of result.combos) {
      expect(c.tA.includes(0) && c.tA.includes(1)).toBe(false);
      expect(c.tB.includes(0) && c.tB.includes(1)).toBe(false);
    }
  });
  it('se nessuna divisione rispetta la regola, non propone nulla', () => {
    // 0-1, 1-2 e 0-2 vietate: tre giocatori non possono stare in due squadre senza che due si ritrovino insieme
    const r = generateTeams({ players, scores: [5, 5, 5, 5, 5, 5], selected: all, sizeA: 3, sizeB: 3, blocked: [[0, 1], [1, 2], [0, 2]] });
    expect(r?.combos).toEqual([]);
  });
});
