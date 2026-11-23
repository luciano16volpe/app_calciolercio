import { describe, expect, it } from 'vitest';
import { nextLeagueDay } from '../../src/domain/leagueDay';

// 2026-11-23 è un lunedì
describe('nextLeagueDay', () => {
  const mon = new Date(2026, 10, 23, 23, 30);
  it('oggi se oggi è il giorno scelto', () => expect(nextLeagueDay(1, mon)).toBe('2026-11-23'));
  it('il giovedì successivo', () => expect(nextLeagueDay(4, mon)).toBe('2026-11-26'));
  it('la settimana dopo se il giorno è già passato', () => expect(nextLeagueDay(1, new Date(2026, 10, 24))).toBe('2026-11-30'));
  it('passa il mese e l’anno', () => expect(nextLeagueDay(5, new Date(2026, 11, 29))).toBe('2027-01-01'));
  it('senza giorno: oggi', () => expect(nextLeagueDay(undefined, mon)).toBe('2026-11-23'));
});
