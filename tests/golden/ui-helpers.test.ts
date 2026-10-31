// Test golden: iniziali, colore dell'avatar e badge PAG — stessi risultati di legacy sulla rosa vera.
import { describe, expect, it } from 'vitest';
import { pagInfo, playerRatingAvg } from '../../src/domain/form';
import { avatarClass, initials } from '../../src/domain/format';
import { playerSeason, seasonStats } from '../../src/domain/stats';
import type { Dataset } from '../../src/domain/types';
import { real } from './data';
import { loadLegacy, type LegacyData } from './legacy';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...a: any[]) => any;
interface L extends Record<string, unknown> {
  ini: Fn; avCls: Fn; getPlayerPagInfo: Fn; esc: Fn;
}

const FUNCS = [
  'ini', 'avCls', 'getPlayerPagInfo', 'esc', 'playerRatingAvg', 'playerSeason', 'seasonStats', 'playerKey', 'normalizeTeam',
  'getPlayerMatchResult', 'validVote', 'seasonOf',
];
const legacy = loadLegacy<L>(FUNCS, [], real as unknown as LegacyData, '2026-10-31');
const data = real as unknown as Dataset;

describe('iniziali, colore e badge PAG', () => {
  it('iniziali come legacy per tutti i nomi della rosa e per nomi strani', () => {
    const names = [...real.players.map((p) => p.name), 'Vito Azz', 'FabioFicarelli', 'Rella', 'x', '', null, undefined, '  Anna  Maria ', "D'Angelo", 'éric', 'McDonald', '123'];
    for (const n of names) expect(legacy.esc(initials(n))).toBe(legacy.ini(n));
    expect(initials('Vito Azz')).toBe('VA');
    expect(initials('FabioFicarelli')).toBe('FF');
    expect(initials('Rella')).toBe('RE');
  });

  it('colore dell\'avatar come legacy', () => {
    const cases: Array<string[] | undefined | null> = [[], ['ATT'], ['DIF'], ['MED'], ['ATT', 'MED'], ['MED', 'DIF', 'ATT'], undefined, null, ['XXX']];
    for (const r of cases) expect(avatarClass(r)).toBe(legacy.avCls({ roles: r }));
    for (const p of real.players) expect(avatarClass(p.roles)).toBe(legacy.avCls(p));
  });

  it('badge PAG di ogni giocatore come legacy', () => {
    const all = seasonStats(data);
    const seen = new Set<string>();
    for (const p of data.players) {
      const mine = pagInfo(playerRatingAvg(playerSeason(data, p, all)).avg);
      const theirs = legacy.getPlayerPagInfo(p);
      expect(mine).toEqual(theirs);
      seen.add(mine.cls);
    }
    expect(seen.size).toBeGreaterThan(1); // i dati veri usano più colori
  });

  it('soglie del PAG: ≥ 6,5 verde · < 5,5 rosso · in mezzo giallo · senza voti grigio', () => {
    expect(pagInfo(6.5).cls).toBe('pag-good');
    expect(pagInfo(6.49).cls).toBe('pag-mid');
    expect(pagInfo(5.5).cls).toBe('pag-mid');
    expect(pagInfo(5.49).cls).toBe('pag-bad');
    expect(pagInfo(null)).toEqual({ label: 'PAG —', cls: 'pag-none', avg: null });
    expect(pagInfo(7.04).label).toBe('PAG 7.0');
  });
});
