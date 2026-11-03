import { describe, expect, it } from 'vitest';
import { myRecentMatches, profileSeasonData } from '../src/domain/profile';
import type { Dataset, Match, Player } from '../src/domain/types';
import { seasonStats, playerSeason } from '../src/domain/stats';
import { formWeightView, pagelleView } from '../src/domain/playerCard';
import { futCardModel } from '../src/canvas/figurina';

const player: Player = { id: 'p', name: 'Marco', stats: Array(11).fill(5) };
const match = (id: string, date: string, own = true, played = true): Match => ({
  id, date, scoreA: played ? 3 : null, scoreB: played ? 1 : null,
  teamA: own ? [{ id: 'p', name: 'Marco' }] : [{ id: 'x', name: 'Altro' }], teamB: [],
});
const makeData = (matches: Match[]): Dataset => ({
  players: [player], matches,
  ratings: matches.map((m, i) => ({ matchId: m.id, playerId: 'p', player: 'Marco', rating: 5 + i % 3 })),
});

describe('profilo della lega', () => {
  it('usa tutta la stagione corrente quando il giocatore ha almeno cinque partite', () => {
    const games = [match('old', '2026-08-30'), ...Array.from({ length: 6 }, (_, i) => match('s' + i, `2026-09-${String(i + 1).padStart(2, '0')}`)), match('other', '2026-09-10', false), match('future', '2026-10-10', true, false)];
    const scoped = profileSeasonData(makeData(games), player.id, player.name, '2026-10-01');
    expect(scoped.label).toBe('Stagione in corso');
    expect(scoped.dataset.matches.map((m) => m.id)).toEqual(['s5', 's4', 's3', 's2', 's1', 's0']);
    expect(playerSeason(scoped.dataset, player, seasonStats(scoped.dataset))?.pres).toBe(6);
    expect(scoped.dataset.ratings).toHaveLength(6);
  });
  it('con meno di cinque partite stagionali usa le ultime cinque giocate, anche prima della stagione', () => {
    const games = [match('a', '2026-08-01'), match('b', '2026-08-10'), match('c', '2026-08-20'), match('d', '2026-08-30'), match('e', '2026-09-05'), match('f', '2026-09-15'), match('upcoming', '2026-09-20', true, false), match('other', '2026-09-18', false)];
    const scoped = profileSeasonData(makeData(games), player.id, player.name, '2026-09-30');
    expect(scoped.label).toBe('Ultime 5 partite');
    expect(scoped.dataset.matches.map((m) => m.id)).toEqual(['f', 'e', 'd', 'c', 'b']);
    expect(scoped.dataset.ratings).toHaveLength(5);
  });
  it('non inventa partite se sono meno di cinque e considera solo il giocatore richiesto', () => {
    const scoped = profileSeasonData(makeData([match('a', '2026-09-01'), match('other', '2026-09-02', false)]), player.id, player.name, '2026-09-30');
    expect(scoped.dataset.matches.map((m) => m.id)).toEqual(['a']);
  });
  it('il peso dei voti resta calcolato sulla lega corrente, non sulle altre leghe', () => {
    const a = makeData(Array.from({ length: 5 }, (_, i) => match('a' + i, '2026-09-0' + (i + 1))));
    const b = makeData(Array.from({ length: 18 }, (_, i) => match('b' + i, '2026-09-' + String(i + 1).padStart(2, '0'))));
    const wa = formWeightView(a, player, true);
    const wb = formWeightView(b, player, true);
    expect(wa.off).toBe(false);
    expect(wb.off).toBe(false);
    if (wa.off || wb.off) throw new Error('peso disattivato');
    expect(wa.pct).toBeLessThan(wb.pct);
    expect(wb.pct).toBe(25);
  });
  it('figurina: usa la media del periodo ma conserva OVR e trofei dello storico della lega', () => {
    const games = [match('old', '2026-08-30'), ...Array.from({ length: 5 }, (_, i) => match('s' + i, '2026-09-0' + (i + 1)))];
    const data = makeData(games);
    data.ratings = data.ratings.map((r) => ({ ...r, rating: r.matchId === 'old' ? 1 : 10 }));
    const period = profileSeasonData(data, player.id, player.name, '2026-10-01');
    const full = futCardModel(data, Array(11).fill(1), [], player, '2026-10-01');
    const scoped = futCardModel(data, Array(11).fill(1), [], player, '2026-10-01', period.dataset);
    expect(full.pag).not.toBe(10);
    expect(scoped.pag).toBe(10);
    expect(scoped.rating).toBe(full.rating);
    expect(scoped.trophies).toEqual(full.trophies);
  });
  it('parita di data: sceglie in modo stabile per identificativo e non include partite future', () => {
    const games = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => match(id, '2026-08-01'));
    games.push(match('future', '2026-12-01'));
    const result = profileSeasonData(makeData(games), player.id, player.name, '2026-09-30');
    expect(result.dataset.matches.map((m) => m.id)).toEqual(['f', 'e', 'd', 'c', 'b']);
    expect(myRecentMatches(makeData(games), player.id, player.name, 10, '2026-09-30').map((m) => m.id)).not.toContain('future');
  });
  it('inverno attraversa il cambio anno e include tutta la stagione dopo cinque partite', () => {
    const games = [match('before', '2026-11-30'), match('a', '2026-12-01'), match('b', '2026-12-15'), match('c', '2027-01-01'), match('d', '2027-01-15'), match('e', '2027-02-01')];
    const scoped = profileSeasonData(makeData(games), player.id, player.name, '2027-02-10');
    expect(scoped.label).toBe('Stagione in corso');
    expect(scoped.dataset.matches.map((m) => m.id)).toEqual(['e', 'd', 'c', 'b', 'a']);
  });
  it('mostra le vittorie nel profilo anche senza pagelle', () => {
    const data: Dataset = { players: [player], matches: [match('m', '2026-09-02')], ratings: [] };
    const result = pagelleView(data, Array(11).fill(1), player, undefined, true);
    expect(result.kind).toBe('noVotes');
    if (result.kind !== 'noVotes') throw new Error('atteso riepilogo senza voti');
    expect(result.cells.find((c) => c.label === '% Vittorie')?.value).toBe('100%');
  });
  it('ultime partite: massimo dieci, ordine stabile, esclude le future e quelle di altri', () => {
    const games = Array.from({ length: 12 }, (_, i) => match('m' + i, `2026-09-${String(i + 1).padStart(2, '0')}`));
    games.push(match('not-played', '2026-10-01', true, false), match('not-mine', '2026-09-28', false));
    const result = myRecentMatches(makeData(games), player.id, player.name);
    expect(result).toHaveLength(10);
    expect(result[0]?.id).toBe('m11');
    expect(result[9]?.id).toBe('m2');
  });
});
