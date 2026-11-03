import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { futCardModel } from '../src/canvas/figurina';
import { formState } from '../src/domain/form';
import { pagelleView } from '../src/domain/playerCard';
import { profileSeasonData } from '../src/domain/profile';
import type { Dataset, Player } from '../src/domain/types';

const player: Player = { id: 'p', name: 'Marco', stats: Array(11).fill(6) };
const dataset = (votes: number[]): Dataset => ({
  players: [player],
  matches: votes.map((_, i) => ({ id: `m${i}`, date: `2026-10-${String(i + 1).padStart(2, '0')}`, scoreA: 1, scoreB: 0, teamA: [{ id: 'p', name: 'Marco' }], teamB: [] })),
  ratings: votes.map((rating, i) => ({ matchId: `m${i}`, playerId: 'p', player: 'Marco', rating })),
});

describe('forma per lega', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-10T12:00:00Z')); });
  afterEach(() => vi.useRealTimers());

  it('lo stesso giocatore puo essere in forma in una lega e in crisi in un’altra', () => {
    expect(formState(dataset([5, 5, 5, 8, 8]), player)).toBe('up');
    expect(formState(dataset([8, 8, 8, 5, 5]), player)).toBe('down');
  });

  it('ignora partite future e senza risultato, anche se contengono voti', () => {
    const data = dataset([5, 5, 5, 8, 8]);
    data.matches.push(...Array.from({ length: 6 }, (_, i) => ({ id: `f${i}`, date: `2026-11-0${i + 1}`, scoreA: 2, scoreB: 1 })),
      { id: 'pending', date: '2026-10-09', scoreA: null, scoreB: null });
    data.ratings.push({ matchId: 'f0', playerId: 'p', player: 'Marco', rating: 1 }, { matchId: 'pending', playerId: 'p', player: 'Marco', rating: 1 });
    expect(formState(data, player)).toBe('up');
    data.matches.push(...Array.from({ length: 5 }, (_, i) => ({ id: `n${i}`, date: `2026-10-${String(i + 6).padStart(2, '0')}`, scoreA: 2, scoreB: 1 })));
    expect(formState(data, player)).toBeNull();
  });

  it('profilo e figurina usano lo storico per la forma e il periodo scelto per le pagelle', () => {
    const data = dataset([5, 5, 5, 5, 8, 8, 7, 6, 6]);
    data.matches.slice(0, 4).forEach((m, i) => { m.date = `2026-08-0${i + 1}`; });
    const period = profileSeasonData(data, player.id, player.name);
    expect(period.label).toBe('Stagione in corso');
    expect(formState(data, player)).toBe('flat');
    expect(formState(period.dataset, player)).toBe('down');
    const full = futCardModel(data, Array(11).fill(1), [], player);
    const scoped = futCardModel(data, Array(11).fill(1), [], player, undefined, period.dataset);
    expect(scoped.form).toBe(full.form);
    expect(scoped.pag).toBe(7);
    const section = pagelleView(period.dataset, Array(11).fill(1), player, undefined, true, data);
    expect(section.kind).toBe('full');
    if (section.kind === 'full') expect(section.trend.label).toBe('Costante');
  });
});
