import { expect, test } from 'vitest';
import { previousSeason, seasonOf } from '../src/domain/seasons';

test('la stagione precedente segue il calendario anche a cavallo d’anno', () => {
  expect(previousSeason(seasonOf('2026-11-04')!)?.key).toBe('2026-EST');
  expect(previousSeason(seasonOf('2027-01-10')!)?.key).toBe('2026-AUT');
  expect(previousSeason(seasonOf('2027-03-01')!)?.key).toBe('2026-INV');
});
