import { describe, expect, it } from 'vitest';
import { formState } from '../../src/domain/form';
import { seasonOf } from '../../src/domain/seasons';
import { seasonStats } from '../../src/domain/stats';
import type { Dataset } from '../../src/domain/types';
describe('stato di forma: contano le ultime 2 pagelle', () => {
  /** Un giocatore con questi voti, uno per partita, in 5 partite consecutive (le più recenti del gruppo). */
  const withVotes = (votes: number[]) => {
    const player = { id: 'p', name: 'P', roles: ['MED'], stats: Array(11).fill(6) };
    const matches = votes.map((_, i) => ({ id: `m${i}`, date: `2026-10-${String(i + 1).padStart(2, '0')}`, teamA: [{ id: 'p', name: 'P' }], teamB: [], scoreA: 5, scoreB: 3 }));
    const ratings = votes.map((v, i) => ({ matchId: `m${i}`, player: 'P', playerId: 'p', rating: v }));
    const ds = { players: [player], matches, ratings } as unknown as Dataset;
    return formState(ds, player as never, seasonStats(ds));
  };
  it('le ultime 2 pagelle sopra la media di sempre di almeno 0,2 → in forma (con 3 non lo sarebbe)', () => {
    // media 6,2; ultime 2 = 6,5 (+0,3) → su; ultime 3 = 6,33 (+0,13) → costante
    expect(withVotes([6, 6, 6, 5, 8])).toBe('up');
  });
  it('le ultime 2 sotto di almeno 0,2 → in calo', () => {
    // media 6,4; ultime 2 = 5,5 (−0,9)
    expect(withVotes([7, 7, 7, 6, 5])).toBe('down');
  });
  it('vicine alla media → costante; la terzultima non conta', () => {
    expect(withVotes([6, 6, 6, 6, 6])).toBe('flat');
    // la terzultima (2) non pesa: ultime 2 = 6,5, media 5,5 → in forma
    expect(withVotes([5, 5, 2, 7, 6])).toBe('up');
  });
  it('servono almeno 4 pagelle', () => {
    expect(withVotes([6, 6, 9])).toBeNull();
  });
});

describe('nome della stagione: «Estate 26» (anno a due cifre)', () => {
  it.each([
    ['2026-03-01', 'Primavera 26'], ['2025-05-31', 'Primavera 25'],
    ['2026-07-15', 'Estate 26'], ['2025-08-31', 'Estate 25'],
    ['2025-10-05', 'Autunno 25'], ['2026-11-30', 'Autunno 26'],
    ['2025-12-01', 'Inverno 25'], ['2026-01-20', 'Inverno 25'], ['2026-02-28', 'Inverno 25'], ['2026-12-10', 'Inverno 26'],
  ])('%s → %s', (date, label) => {
    expect(seasonOf(date)?.label).toBe(label);
  });
  it('la chiave e le date non cambiano', () => {
    expect(seasonOf('2026-07-15')).toMatchObject({ key: '2026-EST', start: '2026-06-01', end: '2026-08-31' });
    expect(seasonOf('2026-01-20')).toMatchObject({ key: '2025-INV', start: '2025-12-01', end: '2026-02-28' });
  });
});

describe('stato di forma: dopo più di un mese dall\'ultima pagella non vale', () => {
  const player = { id: 'p', name: 'P', roles: ['MED'], stats: Array(11).fill(6) };
  const votes = [6, 6, 6, 5, 8];
  const ds = {
    players: [player],
    matches: votes.map((_, i) => ({ id: `m${i}`, date: `2026-10-${String(i + 1).padStart(2, '0')}`, teamA: [{ id: 'p', name: 'P' }], teamB: [], scoreA: 5, scoreB: 3 })),
    ratings: votes.map((v, i) => ({ matchId: `m${i}`, player: 'P', playerId: 'p', rating: v })),
  } as unknown as Dataset; // ultima pagella: 5 ottobre 2026
  it('entro un mese c\'è lo stato, oltre no', () => {
    const all = seasonStats(ds);
    expect(formState(ds, player as never, all, '2026-11-05')).toBe('up'); // esattamente un mese: vale ancora
    expect(formState(ds, player as never, all, '2026-11-06')).toBeNull(); // un giorno in più: non vale
  });
});
