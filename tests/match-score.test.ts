import { describe, expect, it } from 'vitest';
import { scoreFromEvents, type PlayerFields } from '../src/domain/matchEdit';

const player = (goals = '', autogol = '') => ({ goals, autogol } as PlayerFields);

describe('risultato calcolato dai giocatori', () => {
  it('accredita ogni autogol alla squadra avversaria', () => {
    expect(scoreFromEvents([player('2'), player('', '1')], [player('1'), player('', '2')]))
      .toEqual({ a: 4, b: 2, hasGoals: true });
  });

  it('non marca come giocata una partita ancora senza reti inserite', () => {
    expect(scoreFromEvents([player()], [player()])).toEqual({ a: 0, b: 0, hasGoals: false });
  });
});
