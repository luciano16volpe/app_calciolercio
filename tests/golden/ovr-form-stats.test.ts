// Test golden: ovr, seasons, stats, form — stessi dati, stessi risultati della versione legacy.
import { describe, expect, it } from 'vitest';
import { formState, formWeight, effectiveScore, inCrisi, onFire } from '../../src/domain/form';
import { calcOvr, futRating, futTier } from '../../src/domain/ovr';
import { seasonOf, seasonStatus, seasonsList } from '../../src/domain/seasons';
import { seasonStats, playerKey, validVote, clampRating, mvpPerf } from '../../src/domain/stats';
import type { Dataset, Player } from '../../src/domain/types';
import { real } from './data';
import { loadLegacy } from './legacy';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...a: any[]) => any;
interface L extends Record<string, unknown> {
  __useForm: (b: boolean) => void;
  calcOvr: Fn; formWeight: Fn; effectiveScore: Fn; playerRatingAvg: Fn; playerSeason: Fn; seasonStats: Fn;
  playerKey: Fn; validVote: Fn; clampRating: Fn; mvpPerf: Fn; seasonOf: Fn; seasonStatus: Fn; seasonsList: Fn;
  formState: Fn; onFire: Fn; inCrisi: Fn; futTier: Fn; futRating: Fn;
}

const FUNCS = [
  'calcOvr', 'formWeight', 'effectiveScore', 'playerRatingAvg', 'playerSeason', 'seasonStats', 'playerKey',
  'normalizeTeam', 'getPlayerMatchResult', 'validVote', 'clampRating', 'mvpPerf', 'seasonOf', 'seasonStatus',
  'seasonsList', 'formState', 'onFire', 'inCrisi', 'futTier',
];
const CONSTS = ['ALBO_GRACE_DAYS', 'FORM_MAX_WEIGHT', 'FORM_MIN_RATINGS', 'FORM_FULL_RATINGS', 'FORM_DELTA', 'futRating'];

const TODAY = '2026-10-31';
const data: Dataset = { players: real.players, matches: real.matches as Dataset['matches'], ratings: real.ratings as Dataset['ratings'] };
const legacy = loadLegacy<L>(FUNCS, CONSTS, real, TODAY);

describe('dati di prova', () => {
  it('sono quelli attesi: 22 giocatori, 16 partite, 162 pagelle', () => {
    expect(real.players).toHaveLength(22);
    expect(real.matches).toHaveLength(16);
    expect(real.ratings).toHaveLength(162);
  });
});

describe('ovr', () => {
  it.each(real.players.map((p) => [p.name, p] as const))('OVR, valutazione e fascia di %s', (_n, p) => {
    expect(calcOvr(p.stats, real.weights)).toBeCloseTo(legacy.calcOvr(p.stats), 12);
    expect(futRating(p.stats, real.weights)).toBe(legacy.futRating(p));
    expect(futTier(p.stats, real.weights)).toBe(legacy.futTier(p));
  });

  it('fasce ai confini (73/74, 67/68, 59/60, 50/51, 40/41): Bronzo 51–59, Cacca 41–50, sotto MARCIO VOMITO', () => {
    // pesi uguali e statistiche uguali: OVR = valore → valutazione = valore × 10
    const w = real.weights.map(() => 1);
    const tier = (v: number) => futTier(w.map(() => v), w);
    expect([7.3, 7.4, 6.7, 6.8, 5.9, 6.0, 5.0, 5.1, 4.0, 4.1].map(tier)).toEqual([
      'gold', 'top', 'silver', 'gold', 'bronze', 'silver', 'cacca', 'bronze', 'marcia', 'cacca',
    ]);
    // gli estremi: 50 è ancora Cacca, 41 è la Cacca più bassa, 40 e meno è MARCIO VOMITO
    expect([5.0, 4.1, 4.0, 0].map(tier)).toEqual(['cacca', 'cacca', 'marcia', 'marcia']);
  });
});

describe('peso dei voti', () => {
  it('formWeight come legacy per 0–30 pagelle', () => {
    for (let n = 0; n <= 30; n++) expect(formWeight(n)).toBeCloseTo(legacy.formWeight(n), 12);
  });
  it('0 fino a 2 pagelle, 25% da 18', () => {
    expect(formWeight(2)).toBe(0);
    expect(formWeight(18)).toBe(0.25);
    expect(formWeight(40)).toBe(0.25);
  });
});

describe('stagioni', () => {
  const dates = ['2026-03-01', '2026-05-31', '2026-06-01', '2026-08-31', '2026-09-01', '2026-11-30', '2026-12-01',
    '2027-01-15', '2027-02-28', '2028-02-29', '2028-02-10', '2026-02-28', 'x', '', null, undefined];
  it.each(dates.map((d) => [String(d), d] as const))('seasonOf(%s)', (_l, d) => {
    expect(seasonOf(d)).toEqual(legacy.seasonOf(d));
  });
  it('seasonStatus: in corso / in chiusura / chiusa', () => {
    for (const t of ['2026-11-30', '2026-12-01', '2026-12-14', '2026-12-15', '2027-01-01']) {
      const l = loadLegacy<L>(['seasonStatus', 'seasonOf'], ['ALBO_GRACE_DAYS'], real, t);
      for (const d of ['2026-10-05', '2026-06-10', '2026-03-10']) {
        expect(seasonStatus(seasonOf(d)!, t)).toBe(l.seasonStatus(l.seasonOf(d)));
      }
    }
  });
  it('seasonsList sulle partite reali', () => {
    expect(seasonsList(data.matches, [], TODAY)).toEqual(legacy.seasonsList());
  });
});

describe('voti', () => {
  const vals = [6, '6,5', '7.5', 0, 11, 10, 1, '', null, undefined, 'abc', 6.26, 6.25, 6.24, '8'];
  it.each(vals.map((v) => [String(v), v] as const))('validVote / clampRating di %s', (_l, v) => {
    expect(validVote(v)).toBe(legacy.validVote(v));
    expect(clampRating(v)).toBe(legacy.clampRating(v));
  });
  it('mvpPerf su tutte le pagelle', () => {
    for (const r of data.ratings) expect(mvpPerf(r)).toBe(legacy.mvpPerf(r));
  });
});

describe('seasonStats', () => {
  const scopes = [undefined, 'all', '2026-PRI', '2026-EST', '2026-AUT', '2026-INV'];
  it.each(scopes.map((s) => [String(s), s] as const))('scope %s identico a legacy', (_l, scope) => {
    expect(seasonStats(data, scope)).toEqual(legacy.seasonStats(scope));
  });
  it('playerKey: id in rosa, poi nome, poi orfano', () => {
    const p = real.players[0] as Player;
    for (const [id, nm] of [[p.id, 'x'], ['id-vecchio', p.name], ['zzz', 'Sconosciuto'], [null, null], [undefined, 'A']] as const) {
      expect(playerKey(data.players, id, nm)).toEqual(legacy.playerKey(id, nm));
    }
  });
});

describe('stato di forma', () => {
  it('formState, onFire, inCrisi per tutti i giocatori', () => {
    const all = seasonStats(data);
    const states = new Set<unknown>();
    for (const p of data.players) {
      expect(formState(data, p, all)).toBe(legacy.formState(p));
      expect(onFire(data, p, all)).toBe(legacy.onFire(p) === 1);
      expect(inCrisi(data, p, all)).toBe(legacy.inCrisi(p) === 1);
      states.add(formState(data, p, all));
    }
    // il test è utile solo se i dati reali coprono più di un caso
    expect(states.size).toBeGreaterThan(1);
  });

  it('effectiveScore (con e senza "usa la forma") per tutti i giocatori', () => {
    const all = seasonStats(data);
    for (const useForm of [true, false]) {
      legacy.__useForm(useForm);
      for (const p of data.players) {
        expect(effectiveScore(data, real.weights, p, useForm, all)).toBeCloseTo(legacy.effectiveScore(p), 12);
      }
    }
    legacy.__useForm(true);
  });

  it('stato di forma: soglie ±0,2 e regola delle 5 partite recenti', () => {
    const mk = (votes: number[], dates: string[]): Dataset => ({
      players: [{ id: 'p1', name: 'Test', stats: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5] }],
      matches: dates.map((d, i) => ({ id: 'm' + i, date: d, teamA: [{ id: 'p1', name: 'Test' }], teamB: [] })),
      ratings: votes.map((v, i) => ({ matchId: 'm' + i, playerId: 'p1', player: 'Test', rating: v })),
    });
    const d5 = ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29'];
    const p = mk([6, 6, 6, 6, 6], d5).players[0] as Player;
    expect(formState(mk([6, 6, 6, 6, 6], d5), p)).toBe('flat');
    expect(formState(mk([5, 5, 7, 7, 7], d5), p)).toBe('up');
    expect(formState(mk([7, 7, 5, 5, 5], d5), p)).toBe('down');
    expect(formState(mk([6, 6, 6], d5.slice(0, 3)), p)).toBeNull(); // meno di 4 pagelle
    // ultima pagella fuori dalle 5 partite più recenti del gruppo → nessuno stato
    const old = mk([7, 7, 7, 7], ['2026-01-01', '2026-01-08', '2026-01-15', '2026-01-22']);
    old.matches.push(...d5.map((d, i) => ({ id: 'n' + i, date: d, teamA: [], teamB: [] })));
    expect(formState(old, p)).toBeNull();
  });
});

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
