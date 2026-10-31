// Test golden: premi di stagione, imprese, Occasionali e albo — stessi dati, stessi risultati di legacy.
import { describe, expect, it } from 'vitest';
import {
  ALBO_MIN_MATCHES, ALBO_MIN_MVP, ALBO_NEW_KEYS, AWARDS, FEATS,
  alboRows, alboSeasons, computeSeasonAwards, isFrozen, matchEvents, seasonFromRows, type AlboRow,
} from '../../src/domain/awards';
import { seasonsList } from '../../src/domain/seasons';
import type { Dataset } from '../../src/domain/types';
import { real } from './data';
import { synthetic } from './synthetic';
import { loadLegacy, type LegacyData } from './legacy';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...a: any[]) => any;
interface L extends Record<string, unknown> {
  computeSeasonAwards: Fn; matchEvents: Fn; alboRows: Fn; seasonFromRows: Fn; isFrozen: Fn; alboSeasons: Fn;
  seasonsList: Fn; AWARDS: unknown; FEATS: unknown; ALBO_MIN_MATCHES: number; ALBO_MIN_MVP: number; ALBO_NEW_KEYS: string[];
}

const FUNCS = [
  'computeSeasonAwards', 'matchEvents', 'alboRows', 'seasonFromRows', 'alboSeasons', 'seasonsList',
  'seasonOf', 'seasonStatus', 'playerKey', 'normalizeTeam', 'validVote', 'mvpPerf',
];
const CONSTS = ['ALBO_GRACE_DAYS', 'ALBO_MIN_MATCHES', 'ALBO_MIN_MVP', 'AWARDS', 'ALBO_NEW_KEYS', 'FEATS', 'isFrozen'];
const TODAY = '2026-10-31';

const legacyOf = (d: LegacyData, today = TODAY) => loadLegacy<L>(FUNCS, CONSTS, d, today);
const asDataset = (d: LegacyData): Dataset => d as unknown as Dataset;

describe('costanti dei premi', () => {
  const legacy = legacyOf(real);
  it('premi, imprese e soglie uguali a legacy', () => {
    expect(AWARDS).toEqual(legacy.AWARDS);
    expect(FEATS).toEqual(legacy.FEATS);
    expect(ALBO_MIN_MATCHES).toBe(legacy.ALBO_MIN_MATCHES);
    expect(ALBO_MIN_MVP).toBe(legacy.ALBO_MIN_MVP);
    expect(ALBO_NEW_KEYS).toEqual(legacy.ALBO_NEW_KEYS);
  });
});

describe('imprese (matchEvents) e premi di stagione sui dati reali', () => {
  const legacy = legacyOf(real);
  const data = asDataset(real);

  it('matchEvents identico a legacy', () => {
    expect(matchEvents(data)).toEqual(legacy.matchEvents());
  });

  it('computeSeasonAwards identico per ogni stagione', () => {
    const seasons = seasonsList(data.matches, [], TODAY);
    expect(seasons.length).toBeGreaterThanOrEqual(3);
    for (const s of seasons) expect(computeSeasonAwards(data, s)).toEqual(legacy.computeSeasonAwards(s));
  });

  it('i dati reali assegnano davvero dei premi e delle imprese (il confronto non è vuoto)', () => {
    const seasons = seasonsList(data.matches, [], TODAY).map((s) => computeSeasonAwards(data, s));
    const winners = seasons.flatMap((s) => s.awards.filter((a) => a.winners.length));
    expect(winners.length).toBeGreaterThan(5);
    const featCount = seasons.flatMap((s) => Object.values(s.feats).flat()).length;
    expect(featCount).toBeGreaterThan(0);
  });

  it('alboRows identico a legacy', () => {
    for (const s of seasonsList(data.matches, [], TODAY)) {
      const mine = alboRows(computeSeasonAwards(data, s));
      expect(mine).toEqual(legacy.alboRows(legacy.computeSeasonAwards(s)));
      expect(mine.length).toBeGreaterThan(0);
    }
  });
});

describe('dati inventati: parità, stagioni corte, ospiti non in rosa, voti strani', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('seme %i: premi, imprese e albo identici a legacy', (seed) => {
    const d = synthetic(seed);
    const legacy = legacyOf(d);
    const data = asDataset(d);
    expect(matchEvents(data)).toEqual(legacy.matchEvents());
    const seasons = seasonsList(data.matches, [], TODAY);
    expect(seasons).toEqual(legacy.seasonsList());
    expect(seasons.length).toBeGreaterThanOrEqual(4);
    for (const s of seasons) {
      const mine = computeSeasonAwards(data, s);
      expect(mine).toEqual(legacy.computeSeasonAwards(s));
      expect(alboRows(mine)).toEqual(legacy.alboRows(legacy.computeSeasonAwards(s)));
    }
  });

  it('copre davvero i casi particolari', () => {
    const all = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((seed) => {
      const data = asDataset(synthetic(seed));
      return seasonsList(data.matches, [], TODAY).map((s) => computeSeasonAwards(data, s));
    });
    const keysWon = new Set(all.flatMap((s) => s.awards.filter((a) => a.winners.length).map((a) => a.k)));
    // premi principali, vergogna e Occasionali vengono assegnati almeno una volta
    for (const k of ['goleador', 'assistman', 'media', 'stelle', 'stakanov', 'flop', 'cucchiaio', 'rigori', 'autogol', 'occMedia', 'occPendolare']) {
      expect(keysWon.has(k), 'premio mai assegnato: ' + k).toBe(true);
    }
    expect(all.some((s) => s.n < ALBO_MIN_MATCHES)).toBe(true); // stagione troppo corta
    expect(all.some((s) => s.awards.some((a) => a.winners.length > 1))).toBe(true); // almeno un pari merito
    const feats = new Set(all.flatMap((s) => Object.entries(s.feats).filter(([, v]) => v.length).map(([k]) => k)));
    for (const k of ['tripletta', 'manita', 'regista', 'fuoriclasse', 'ritorno', 'debutto']) {
      expect(feats.has(k), 'impresa mai assegnata: ' + k).toBe(true);
    }
  });
});

describe('albo salvato e stagioni congelate', () => {
  const data = asDataset(real);
  const legacy = legacyOf(real);
  const seasons = seasonsList(data.matches, [], TODAY);

  // Albo come era alla chiusura: tutte le righe "chiusa", ma senza le categorie aggiunte dopo (Occasionali, imprese nuove)
  const closedSeasons = seasons.filter((s) => s.status === 'chiusa');
  const stored: AlboRow[] = closedSeasons.flatMap((s) =>
    legacy
      .alboRows(legacy.computeSeasonAwards(s))
      .filter((r: AlboRow) => !ALBO_NEW_KEYS.includes(r.premio as string))
      .map((r: AlboRow) => ({ ...r, stato: 'chiusa' })),
  );

  it('c\'è almeno una stagione chiusa da congelare', () => {
    expect(closedSeasons.length).toBeGreaterThanOrEqual(1);
    expect(stored.length).toBeGreaterThan(0);
  });

  it('isFrozen e seasonFromRows identici a legacy', () => {
    const lg = legacyOf({ ...real, albo: stored });
    for (const s of seasons) {
      const st = stored.filter((r) => r.chiave === s.key);
      expect(isFrozen(s, st)).toBe(lg.isFrozen(s, st));
      if (st.length) expect(seasonFromRows(data, s, st)).toEqual(lg.seasonFromRows(s, st));
    }
  });

  it('alboSeasons: congelate dall\'albo + categorie nuove dal calcolo dal vivo, identico a legacy', () => {
    const lg = legacyOf({ ...real, albo: stored });
    const mine = alboSeasons(data, stored, TODAY);
    expect(mine).toEqual(lg.alboSeasons());
    expect(mine.some((s) => s.frozen)).toBe(true);
    expect(mine.some((s) => !s.frozen)).toBe(true);
    // newest first
    expect(mine.map((s) => s.ord)).toEqual([...mine.map((s) => s.ord)].sort((a, b) => b - a));
  });

  it('senza albo salvato, alboSeasons = tutte calcolate dal vivo', () => {
    expect(alboSeasons(data, [], TODAY)).toEqual(legacy.alboSeasons());
  });
});
