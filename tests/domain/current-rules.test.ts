import { describe, expect, it } from 'vitest';
import { calcOvr, futRating, futTierOfRating, rosaOrder } from '../../src/domain/ovr';
import { effectiveScore, formWeight, pagInfo } from '../../src/domain/form';
import { combos, generateTeams, predGoals } from '../../src/domain/balancing';
import { clampStat, toggleRole } from '../../src/domain/playerEdit';
import { planSave, stepCount, stepRating, stepScore, type PlayerFields } from '../../src/domain/matchEdit';
import type { Dataset, Player } from '../../src/domain/types';

describe('regole attuali del giocatore', () => {
  it('OVR è la media pesata; la figurina arrotonda OVR per dieci', () => {
    expect(calcOvr([4, 8], [1, 3])).toBe(7);
    expect(futRating([4, 8], [1, 3])).toBe(70);
    expect(rosaOrder([{ name: 'Zeta', stats: [7] }, { name: 'Anna', stats: [7] }, { name: 'Max', stats: [8] }], [1])).toEqual([2, 1, 0]);
  });
  it.each([[40, 'marcia'], [41, 'cacca'], [50, 'cacca'], [51, 'bronze'], [59, 'bronze'], [60, 'silver'], [67, 'silver'], [68, 'gold'], [73, 'gold'], [74, 'top']] as const)('valutazione %i: fascia %s', (value, tier) => {
    expect(futTierOfRating(value)).toBe(tier);
  });
  it('il peso delle pagelle cresce da zero a un quarto, senza superarlo', () => {
    expect([0, 2, 10, 18, 30].map(formWeight)).toEqual([0, 0, 0.125, 0.25, 0.25]);
    const player: Player = { id: 'p', name: 'Test', stats: [8] };
    const data: Dataset = { players: [player], matches: [], ratings: [] };
    for (let i = 0; i < 18; i++) {
      data.matches.push({ id: String(i), date: '2026-10-01', scoreA: 1, scoreB: 0, teamA: [{ id: 'p', name: 'Test' }], teamB: [] });
      data.ratings.push({ matchId: String(i), playerId: 'p', player: 'Test', rating: 6 });
    }
    expect(effectiveScore(data, [1], player)).toBe(7.5);
    expect(effectiveScore(data, [1], player, false)).toBe(8);
  });
  it('badge PAG: verde da 6,5, giallo da 5,5 e assente senza voti', () => {
    expect([6.5, 6.49, 5.5, 5.49, null].map((v) => pagInfo(v).cls)).toEqual(['pag-good', 'pag-mid', 'pag-mid', 'pag-bad', 'pag-none']);
    expect(pagInfo(7.04).label).toBe('PAG 7.0');
  });
  it('le statistiche hanno limiti e deve rimanere almeno un ruolo', () => {
    expect(clampStat('11')).toBe(10);
    expect(clampStat('-3')).toBe(1);
    expect(toggleRole(['MED'], 'MED')).toBeNull();
    expect(toggleRole(['MED'], 'DIF')).toEqual(['MED', 'DIF']);
    expect(toggleRole(['MED', 'DIF'], 'MED')).toEqual(['DIF']);
  });
});

describe('bilanciamento senza un riferimento esterno', () => {
  it('enumera i sottoinsiemi senza duplicare elementi', () => {
    expect(combos([0, 1, 2], 2)).toEqual([[0, 1], [0, 2], [1, 2]]);
    expect(predGoals(0.5)).toBe(4.5);
  });
  it('ogni proposta usa tutti e soli i convocati una volta, con le dimensioni richieste', () => {
    const players = Array.from({ length: 6 }, (_, i) => ({ id: String(i), name: String(i), roles: ['DIF', 'MED', 'ATT'], stats: [5 + i / 2] }));
    const input = { players, scores: [5, 5.5, 6, 6.5, 7, 7.5], selected: [0, 1, 2, 3, 4, 5], sizeA: 3, sizeB: 3 };
    const result = generateTeams(input);
    expect(result?.combos.length).toBeGreaterThan(0);
    for (const proposal of result!.combos) {
      expect(proposal.tA).toHaveLength(3);
      expect(proposal.tB).toHaveLength(3);
      expect([...proposal.tA, ...proposal.tB].sort()).toEqual(input.selected);
      expect(proposal.diff).toBeCloseTo(Math.abs(proposal.sA - proposal.sB));
    }
    expect(generateTeams({ ...input, selected: [0, 1] })).toBeNull();
  });
});

describe('salvataggio delle pagelle', () => {
  const fields = (patch: Partial<PlayerFields> = {}): PlayerFields => ({ id: 'p', name: 'Test', rating: '', goals: '', assist: '', autogol: '', rigori: '', meta: '', tit: '', desc: '', ...patch });
  it('blocca gol e testi senza voto e omette chi non ha pagella', () => {
    expect(planSave([fields({ goals: '1' })], [], '', '').missingRating).toEqual(['Test']);
    expect(planSave([fields({ tit: 'Titolo' })], [], '', '').missingRating).toEqual(['Test']);
    expect(planSave([fields()], [], '', '').rows).toEqual([]);
  });
  it('normalizza il voto e conserva i testi entro i limiti previsti', () => {
    const result = planSave([fields({ rating: '7.5', goals: '2', assist: '3', tit: ' Titolo ', desc: 'Testo' })], [], '2', '0');
    expect(result.rows[0]).toMatchObject({ rating: 7.5, goals: 2, assist: 3, titolo: 'Titolo', notes: 'Testo' });
    expect(result.overAssist).toHaveLength(1);
    expect(result.scoreA).toBe(2);
    expect(result.scoreB).toBe(0);
  });
  it('i pulsanti rispettano i limiti e il passo dei mezzi voti', () => {
    expect(stepScore('99', 1)).toBe('99');
    expect(stepScore('0', -1)).toBe('0');
    expect(stepRating('', 1)).toBe('6');
    expect(stepRating('6', 1)).toBe('6.5');
    expect(stepCount('1', -1, 20)).toBe('');
  });
});
