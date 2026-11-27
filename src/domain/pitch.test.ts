import { expect, test } from 'vitest';
import { makeSlots } from './balancing';
import { pitchSvg, type PitchPlayer } from './pitch';

test('il campo evidenzia il portiere fisso e mantiene leggibili i nomi', () => {
  const goalie: PitchPlayer = { name: 'P<Blu>', roles: ['MED'], dispRole: 'MED', fixedGoalkeeper: true };
  const others: PitchPlayer[] = ['Uno', 'Due', 'Tre', 'Quattro'].map((name) => ({ name, roles: ['DIF'], dispRole: 'DIF' }));
  const { inner } = pitchSvg([goalie, ...others], others, { notation: '1-1-2-1', desc: '', slots: makeSlots(1, 1, 2, 1) });
  expect(inner).toContain('id="pitch-turf"');
  expect(inner).toContain('stroke="#d8b5ff"');
  expect(inner).toContain('P&lt;Blu&gt;');
});
