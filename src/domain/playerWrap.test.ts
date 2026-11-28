import { expect, test } from 'vitest';
import { playerWrap } from './playerWrap';
import type { Dataset } from './types';

const players = [
  { id: 'a', name: 'Alice', stats: Array(11).fill(5) as number[] },
  { id: 'b', name: 'Bruno', stats: Array(11).fill(5) as number[] },
];
const data: Dataset = {
  players,
  matches: [
    { id: 'estate-1', date: '2026-06-10', teamA: [{ id: 'a', name: 'Alice' }], teamB: [{ id: 'b', name: 'Bruno' }], scoreA: 2, scoreB: 1 },
    { id: 'estate-2', date: '2026-07-10', teamA: [{ id: 'a', name: 'Alice' }], teamB: [{ id: 'b', name: 'Bruno' }], scoreA: 1, scoreB: 0 },
    { id: 'estate-3', date: '2026-08-10', teamA: [{ id: 'a', name: 'Alice' }], teamB: [{ id: 'b', name: 'Bruno' }], scoreA: 0, scoreB: 1 },
    { id: 'autunno-1', date: '2026-09-10', teamA: [{ id: 'a', name: 'Alice' }], teamB: [{ id: 'b', name: 'Bruno' }], scoreA: null, scoreB: null },
  ],
  ratings: [
    { matchId: 'estate-1', playerId: 'a', player: 'Alice', rating: 7, goals: 2, assist: 1 },
    { matchId: 'estate-2', playerId: 'a', player: 'Alice', rating: 8, goals: 1 },
    { matchId: 'estate-3', playerId: 'a', player: 'Alice', rating: 6 },
  ],
};

test('il Wrap sceglie la stagione terminata e conta solo le partite giocate', () => {
  const wrap = playerWrap(data, players[0]!, [], '2026-10-01');
  expect(wrap?.season).toBe('Estate 26');
  expect(wrap?.stats).toMatchObject({ pres: 3, w: 2, l: 1, goals: 3, assist: 1, voteAvg: 7 });
  expect(wrap?.awards.some((award) => award.title.includes('Goleador'))).toBe(true);
});

test('senza una stagione precedente il Wrap non è disponibile', () => {
  expect(playerWrap({ ...data, matches: data.matches.slice(-1), ratings: [] }, players[0]!, [], '2026-10-01')).toBeNull();
  expect(playerWrap({ ...data, matches: [{ ...data.matches[0]!, scoreA: null, scoreB: null }], ratings: [] }, players[0]!, [], '2026-10-01')).toBeNull();
});

test('il Wrap conserva i premi dell’Albo dopo un cambio nome', () => {
  const renamed = { ...players[0]!, name: 'Alessia' };
  const renamedData = { ...data, players: [renamed, players[1]!] };
  const albo = [{ stagione: 'Estate 26', chiave: '2026-EST', dal: '2026-06-01', al: '2026-08-31', stato: 'chiusa', premio: 'goleador', titolo: 'Goleador', giocatore: 'Alice', valore: '3 gol' }];
  expect(playerWrap(renamedData, renamed, albo, '2026-10-01', ['Alice'])?.awards.some((award) => award.title.includes('Goleador'))).toBe(true);
});
