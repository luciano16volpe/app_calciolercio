// Profilo personale (passo 4.4): riepilogo per lega e storico delle statistiche.
import { describe, expect, it } from 'vitest';
import { describeChange, outcome, recentMatches, summarizeByLeague, type ProfileRow } from '../../src/domain/profile';

const row = (o: Partial<ProfileRow>): ProfileRow => ({
  matchId: 'm', date: '2026-01-01', leagueId: 'L1', leagueName: 'Lega 1', team: 'A', rating: null, goals: 0, assist: 0, scoreA: null, scoreB: null, ...o,
});

describe('esito', () => {
  it('Blu = A, Bianchi = B', () => {
    expect(outcome({ team: 'A', scoreA: 5, scoreB: 3 })).toBe('V');
    expect(outcome({ team: 'B', scoreA: 5, scoreB: 3 })).toBe('S');
    expect(outcome({ team: 'B', scoreA: 2, scoreB: 2 })).toBe('P');
    expect(outcome({ team: 'A', scoreA: null, scoreB: 3 })).toBeNull();
  });
});

describe('riepilogo per lega', () => {
  it('conta partite, V/P/S, gol, assist e media dei soli voti presenti', () => {
    const rows = [
      row({ leagueId: 'L1', team: 'A', scoreA: 4, scoreB: 2, rating: 7, goals: 2, assist: 1 }),
      row({ leagueId: 'L1', team: 'B', scoreA: 4, scoreB: 2, rating: 6, goals: 0, assist: 0 }),
      row({ leagueId: 'L1', team: 'A', scoreA: 1, scoreB: 1, rating: null, goals: 1 }),
      row({ leagueId: 'L1', team: 'A' }), // senza risultato
      row({ leagueId: 'L2', leagueName: 'Lega 2', team: 'B', scoreA: 0, scoreB: 3, rating: 8, assist: 2 }),
    ];
    const [a, b] = summarizeByLeague(rows);
    expect(a).toMatchObject({ leagueId: 'L1', played: 4, wins: 1, draws: 1, losses: 1, goals: 3, assist: 1 });
    expect(a?.avgRating).toBe(6.5);
    expect(b).toMatchObject({ leagueId: 'L2', played: 1, wins: 1, assist: 2, avgRating: 8 });
  });
  it('nessun voto: media assente; nessuna partita: elenco vuoto', () => {
    expect(summarizeByLeague([row({})])[0]?.avgRating).toBeNull();
    expect(summarizeByLeague([])).toEqual([]);
  });
});

describe('ultime partite', () => {
  it('dalla più recente, al massimo n', () => {
    const rows = ['2026-01-02', '2026-03-01', '2026-02-01'].map((date) => row({ date }));
    expect(recentMatches(rows, 2).map((r) => r.date)).toEqual(['2026-03-01', '2026-02-01']);
  });
});

describe('storico statistiche', () => {
  it('descrive solo quello che è cambiato', () => {
    const e = { at: 'x', oldStats: [5, 5, 5, 5, 6, 5, 5, 5, 5, 5, 5], newStats: [5, 5, 5, 5, 7, 5, 5, 5, 5, 5, 4], oldRoles: ['MED'], newRoles: ['MED', 'ATT'] };
    expect(describeChange(e)).toEqual(['tiro 6 → 7', 'intelligenza 5 → 4', 'Ruoli: MED → MED, ATT']);
  });
  it('nessun cambiamento: niente righe', () => {
    expect(describeChange({ at: 'x', oldStats: [1], newStats: [1], oldRoles: ['ATT'], newRoles: ['ATT'] })).toEqual([]);
  });
});
