// Test golden: iniziali, colore dell'avatar e badge PAG — stessi risultati di legacy sulla rosa vera.
import { describe, expect, it } from 'vitest';
import { pagInfo, playerRatingAvg } from '../../src/domain/form';
import { avatarClass, formatTime, initials, whenWhere } from '../../src/domain/format';
import { needsRatings, pendingRatings, ratingsCoverage, skippedRatings } from '../../src/domain/matches';
import { myLastMatch, myNextMatch, myTeam } from '../../src/domain/profile';
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

describe('ora e luogo della partita', () => {
  it('formatTime: hh:mm:ss → hh:mm, vuoto se manca', () => {
    expect(formatTime('21:00:00')).toBe('21:00');
    expect(formatTime('9:05')).toBe('09:05');
    expect(formatTime(null)).toBe('');
    expect(formatTime('')).toBe('');
  });
  it('whenWhere: «alle 21:00 · Campo», parti mancanti saltate', () => {
    expect(whenWhere({ time: '21:00', place: 'Campo Sole' })).toBe('alle 21:00 · Campo Sole');
    expect(whenWhere({ time: '', place: ' Campo ' })).toBe('Campo');
    expect(whenWhere({ time: '08:30:00', place: '' })).toBe('alle 08:30');
    expect(whenWhere({})).toBe('');
  });
});

describe('pagelle da scrivere e pagelle saltate (meno della metà delle descrizioni)', () => {
  const team = (id: string, side: string) => Array.from({ length: 5 }, (_, i) => ({ id: `${id}${side}${i}`, name: `${side}${i}` }));
  const m = (id: string, date: string, over: Record<string, unknown> = {}) => ({ id, date, scoreA: 5, scoreB: 3, teamA: team(id, 'A'), teamB: team(id, 'B'), ...over });
  /** n giocatori della partita con una descrizione */
  const written = (id: string, n: number) => Array.from({ length: n }, (_, i) => ({ matchId: id, player: `A${i}`, rating: 6, notes: 'bravo' }));
  const ds = {
    players: [],
    matches: [
      m('a', '2026-10-01'),                                  // 0 descrizioni su 10 → da scrivere
      m('b', '2026-10-08'),                                  // 5 su 10 = esattamente la metà → a posto
      m('c', '2026-10-15'),                                  // 4 su 10 → meno della metà → da scrivere
      m('d', '2026-10-22'),                                  // 8 su 10: ne mancano un paio → a posto
      m('e', '2026-10-29', { ratingsSkipped: true }),        // saltata, 0 su 10 → tra le saltate
      m('f', '2026-11-05', { ratingsSkipped: true }),        // saltata ma poi ne hanno scritte 6 su 10 → non è più tra le saltate
      m('g', '2026-11-12', { scoreA: null, scoreB: null }),  // non giocata → niente
      m('h', '2026-11-19', { ratingsSkipped: true }),        // saltata, 4 su 10 → ancora tra le saltate
    ],
    ratings: [...written('b', 5), ...written('c', 4), ...written('d', 8), ...written('f', 6), ...written('h', 4)],
  } as unknown as Dataset;

  it('copertura: giocatori in squadra e descrizioni scritte', () => {
    expect(ratingsCoverage(ds, ds.matches[3] as never)).toEqual({ written: 8, total: 10 });
    expect(ratingsCoverage(ds, ds.matches[0] as never)).toEqual({ written: 0, total: 10 });
  });
  it('da scrivere: meno della metà delle descrizioni, non saltate (dalla più recente)', () => {
    expect(pendingRatings(ds).map((x) => x.id)).toEqual(['c', 'a']);
  });
  it('a metà esatta o con solo un paio di mancanti la partita è a posto', () => {
    expect(needsRatings(ds, ds.matches[1] as never)).toBe(false);
    expect(needsRatings(ds, ds.matches[3] as never)).toBe(false);
  });
  it('saltate: segnate come saltate e ancora sotto la metà (dalla più recente)', () => {
    expect(skippedRatings(ds).map((x) => x.id)).toEqual(['h', 'e']);
  });
  it('una partita non giocata non è mai «da scrivere»', () => {
    expect(needsRatings(ds, ds.matches[6] as never)).toBe(false);
  });
});

describe('le mie partite (pagina Il mio profilo)', () => {
  const t = (...ids: string[]) => ids.map((id) => ({ id, name: id.toUpperCase() }));
  const m = (id: string, date: string, a: string[], b: string[], over: Record<string, unknown> = {}) => ({ id, date, teamA: t(...a), teamB: t(...b), scoreA: 5, scoreB: 3, ...over });
  const ds = {
    players: [],
    matches: [
      m('vecchia', '2026-10-01', ['me', 'x'], ['y', 'z']),                                      // giocata: Blu 5-3 → vinta
      m('persa', '2026-10-08', ['x', 'y'], ['me', 'z']),                                        // giocata: Bianchi (io) perdo 5-3
      m('altrui', '2026-10-15', ['x', 'y'], ['z', 'w']),                                        // non gioco io
      m('pari', '2026-10-22', ['me'], ['x'], { scoreA: 2, scoreB: 2 }),                         // pareggio (la più recente giocata)
      m('futura', '2026-12-20', ['x'], ['me'], { scoreA: null, scoreB: null }),                // in programma, io Bianchi
      m('piulontana', '2027-01-10', ['me'], ['x'], { scoreA: null, scoreB: null }),            // più avanti
      m('senzadime', '2026-11-30', ['x'], ['y'], { scoreA: null, scoreB: null }),              // in programma ma non gioco
      m('ieri', '2026-11-01', ['me'], ['x'], { scoreA: null, scoreB: null }),                  // senza risultato ma già passata
    ],
    ratings: [],
  } as unknown as Dataset;
  it('in che squadra gioco', () => {
    expect(myTeam(ds.matches[0] as never, 'me', 'ME')).toBe('A');
    expect(myTeam(ds.matches[1] as never, 'me', 'ME')).toBe('B');
    expect(myTeam(ds.matches[2] as never, 'me', 'ME')).toBeNull();
  });
  it('ultima partita giocata: la più recente con risultato in cui ci sono, con l\u2019esito', () => {
    const r = myLastMatch(ds, 'me', 'ME');
    expect(r?.m.id).toBe('pari');
    expect(r?.result).toBe('P');
  });
  it('esiti: vinta con Blu, persa con Bianchi', () => {
    const only = (id: string) => ({ ...ds, matches: ds.matches.filter((x) => x.id === id) }) as Dataset;
    expect(myLastMatch(only('vecchia'), 'me', 'ME')?.result).toBe('V');
    expect(myLastMatch(only('persa'), 'me', 'ME')?.result).toBe('S');
    expect(myLastMatch(only('altrui'), 'me', 'ME')).toBeNull();
  });
  it('prossima partita: la più vicina di oggi o futura, senza risultato, in cui sono in squadra', () => {
    const r = myNextMatch(ds, 'me', 'ME', '2026-11-02');
    expect(r?.m.id).toBe('futura');
    expect(r?.team).toBe('B');
  });
  it('oggi conta ancora come «prossima»; una partita già passata senza risultato no', () => {
    expect(myNextMatch(ds, 'me', 'ME', '2026-12-20')?.m.id).toBe('futura');
    expect(myNextMatch(ds, 'me', 'ME', '2026-12-21')?.m.id).toBe('piulontana');
    expect(myNextMatch(ds, 'me', 'ME', '2027-02-01')).toBeNull();
  });
});
