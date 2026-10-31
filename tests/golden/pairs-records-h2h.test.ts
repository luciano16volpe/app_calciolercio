// Test golden: coppie, record e confronto testa a testa — stessi dati, stessi risultati di legacy.
// Per classifica coppie e record si esegue la vera schermata legacy (renderCoppie / renderRecord)
// in una pagina finta e se ne legge il testo, così si verificano anche ordine e tagli (8/5 coppie, 4 nomi…).
import { describe, expect, it } from 'vitest';
import { alboSeasons } from '../../src/domain/awards';
import { formatDate, noVS } from '../../src/domain/format';
import { cmpLead, compareRows, defaultRival, headToHead, scopeMvp, scopeTrophies } from '../../src/domain/h2h';
import { rosaOrder } from '../../src/domain/ovr';
import { pairsRanking, playerPairs, scopePairs } from '../../src/domain/pairs';
import { computeRecords, type RecordRow } from '../../src/domain/records';
import { seasonsList } from '../../src/domain/seasons';
import type { Dataset, Player } from '../../src/domain/types';
import { real } from './data';
import { loadLegacy, type LegacyData } from './legacy';
import { synthetic } from './synthetic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...a: any[]) => any;
interface L extends Record<string, unknown> {
  __run: (fn: () => void, scope: string) => string;
  playerPairs: Fn; scopePairs: Fn; renderCoppie: () => void; renderRecord: () => void; headToHead: Fn; scopeMvp: Fn;
  scopeTrophies: Fn; compareRows: Fn; defaultRival: Fn; rosaOrder: Fn; cmpLead: Fn; formatDate: Fn; noVS: Fn;
}

const FUNCS = [
  'playerPairs', 'scopePairs', 'renderCoppie', 'renderRecord', 'headToHead', 'scopeMvp', 'scopeTrophies', 'compareRows',
  'defaultRival', 'rosaOrder', 'formatDate', 'esc', 'calcOvr', 'playerKey', 'normalizeTeam', 'validVote', 'mvpPerf',
  'getPlayerMatchResult',
  'seasonOf', 'seasonStatus', 'seasonsList', 'seasonStats', 'matchEvents', 'computeSeasonAwards', 'seasonFromRows', 'alboSeasons',
];
const CONSTS = [
  'scopeMatches', 'noVS', 'clEmpty', 'clMedal', 'cmpLead', 'FEATS', 'AWARDS', 'ALBO_GRACE_DAYS', 'ALBO_MIN_MATCHES',
  'ALBO_MIN_MVP', 'ALBO_NEW_KEYS', 'isFrozen',
];
const TODAY = '2026-10-31';

const legacyOf = (d: LegacyData) => loadLegacy<L>(FUNCS, CONSTS, d, TODAY);
const asDataset = (d: LegacyData): Dataset => d as unknown as Dataset;

const datasets: Array<[string, LegacyData]> = [
  ['dati reali', real as unknown as LegacyData],
  ...[1, 2, 3, 4, 5, 6].map((s) => [`dati inventati (seme ${s})`, synthetic(s)] as [string, LegacyData]),
];

const scopesOf = (d: Dataset) => ['all', ...seasonsList(d.matches, [], TODAY).map((s) => s.key)];

/** Testo semplice di un pezzo di HTML: <br> → "|", via tutti i tag, spazi normalizzati. */
const plain = (html: string) =>
  html.replace(/<br>/g, '|').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

describe.each(datasets)('%s', (_label, raw) => {
  const data = asDataset(raw);
  const legacy = legacyOf(raw);
  const scopes = scopesOf(data);

  it('playerPairs identico per ogni giocatore', () => {
    for (const p of data.players) expect(playerPairs(data, p)).toEqual(legacy.playerPairs(p));
  });

  it('scopePairs identico per ogni stagione e per "sempre"', () => {
    for (const sc of scopes) expect(scopePairs(data, sc)).toEqual(legacy.scopePairs(sc));
  });

  it('classifica coppie: stesso ordine e stessi tagli della schermata legacy', () => {
    for (const sc of scopes) {
      const html = legacy.__run(legacy.renderCoppie, sc);
      const [goldHtml, badHtml = ''] = html.split('Coppie maledette');
      const rows = (h: string) =>
        h
          .split(/(?=<div class="cl-row">)/)
          .filter((x) => x.startsWith('<div class="cl-row">'))
          .map((r) => {
          const names = plain((r.match(/<div class="cl-name">([\s\S]*?)<\/div>/) as RegExpMatchArray)[1] as string);
          const sub = plain((r.match(/<div class="cl-sub">([\s\S]*?)<\/div>/) as RegExpMatchArray)[1] as string);
          return `${names} | ${sub}`;
        });
      const fmt = (c: { a: string; b: string; w: number; d: number; l: number; gd: number }) =>
        `${c.a} & ${c.b} | ${c.w}V · ${c.d}N · ${c.l}P · ${c.gd > 0 ? '+' : ''}${c.gd} gol`;
      const { gold, bad } = pairsRanking(data, sc);
      expect(gold.map(fmt)).toEqual(rows(goldHtml as string));
      expect(bad.map(fmt)).toEqual(rows(badHtml));
    }
  });

  it('record: stesse righe, stessi valori, stessi nomi della schermata legacy', () => {
    for (const sc of scopes) {
      const html = legacy.__run(legacy.renderRecord, sc);
      const legacyRows = html
        .split(/(?=<div class="rec-row">)/)
        .filter((x) => x.startsWith('<div class="rec-row">'))
        .map((r) => ({
        icon: plain((r.match(/<span class="rec-ic">([\s\S]*?)<\/span>/) as RegExpMatchArray)[1] as string),
        title: plain((r.match(/<div class="rec-t">([\s\S]*?)<\/div>/) as RegExpMatchArray)[1] as string),
        who: plain((r.match(/<div class="rec-who">([\s\S]*?)<\/div>/) as RegExpMatchArray)[1] as string),
        value: plain((r.match(/<span class="rec-v">([\s\S]*?)<\/span>/) as RegExpMatchArray)[1] as string),
      }));
      const who = (r: RecordRow) => {
        if (r.kind === 'streak') return r.entries.map((e) => e.name).join(', ');
        const lines = r.entries.map((e) => {
          const m = e.match as NonNullable<typeof e.match>;
          return r.kind === 'match' ? `${m.scoreA}-${m.scoreB} · ${formatDate(m.date)}` : `${e.name} · ${formatDate(m.date)}`;
        });
        return lines.join('|');
      };
      const mine = computeRecords(data, sc).map((r) => ({ icon: r.icon, title: r.title, who: who(r), value: r.value }));
      expect(mine).toEqual(legacyRows);
    }
  });

  it('headToHead identico per tutte le coppie di giocatori', () => {
    const ps = data.players;
    for (const sc of ['all', scopes[scopes.length - 1] as string]) {
      for (const a of ps) for (const b of ps) if (a !== b) expect(headToHead(data, a, b, sc)).toEqual(legacy.headToHead(a, b, sc));
    }
  });

  it('scopeMvp identico', () => {
    for (const sc of scopes) expect(scopeMvp(data, sc)).toEqual(legacy.scopeMvp(sc));
  });

  it('scopeTrophies identico', () => {
    const seasons = alboSeasons(data, [], TODAY);
    for (const sc of scopes) for (const p of data.players) expect(scopeTrophies(data, p, sc, seasons)).toEqual(legacy.scopeTrophies(p, sc));
  });

  it('compareRows identico (etichette, valori, testo mostrato, "meno è meglio")', () => {
    const ps = data.players;
    const pairsToTest: Array<[number, number]> = [[0, 1], [1, 0], [2, 5], [3, ps.length - 1], [ps.length - 1, 4]];
    for (const sc of scopes) {
      for (const [i, j] of pairsToTest) {
        const mine = compareRows(data, ps[i] as Player, ps[j] as Player, sc, [], TODAY);
        const theirs = legacy.compareRows(i, j, sc);
        expect(mine.length).toBe(theirs.length);
        mine.forEach((row, k) => {
          const t = theirs[k] as [string, number | null, number | null, (v: number | null) => string, boolean?];
          expect(row.label).toBe(t[0]);
          expect(row.a).toEqual(t[1]);
          expect(row.b).toEqual(t[2]);
          expect(row.text(row.a)).toBe(t[3](t[1]));
          expect(row.text(row.b)).toBe(t[3](t[2]));
          expect(!!row.lowerIsBetter).toBe(!!t[4]);
          expect(cmpLead(row.a, row.b, row.lowerIsBetter)).toBe(legacy.cmpLead(t[1], t[2], t[4]));
        });
      }
    }
  });

  it('defaultRival identico per ogni giocatore', () => {
    const order = rosaOrder(data.players, real.weights);
    expect(order).toEqual(legacy.rosaOrder());
    const candidates = order.map((i) => data.players[i] as Player);
    data.players.forEach((p, i) => {
      const mine = defaultRival(data, p, candidates);
      const r = legacy.defaultRival(i);
      expect(mine).toBe(r == null ? null : data.players[r]);
    });
  });
});

describe('formattazione', () => {
  const legacy = legacyOf(real as unknown as LegacyData);
  it('formatDate e noVS come legacy', () => {
    for (const d of ['2026-10-28', '2026-10-28T10:00', '', null, undefined, 'boh', '28/10/2026']) {
      expect(formatDate(d)).toBe(legacy.formatDate(d));
    }
    for (const s of ['🅰️ Assistman', '✒️ x', 'a', 7]) expect(noVS(s)).toBe(legacy.noVS(s));
    expect(noVS('🅰️')).not.toContain('️');
  });
});

describe('copertura: i dati di prova esercitano davvero queste funzioni', () => {
  it('ci sono coppie, record, serie e rivali', () => {
    const all = [real as unknown as LegacyData, ...[1, 2, 3, 4, 5, 6].map((s) => synthetic(s))].map(asDataset);
    expect(all.some((d) => pairsRanking(d, 'all').gold.length > 0)).toBe(true);
    expect(all.some((d) => pairsRanking(d, 'all').bad.length > 0)).toBe(true);
    const kinds = new Set(all.flatMap((d) => computeRecords(d, 'all').map((r) => r.title)));
    for (const t of ['Partita con più gol', 'Vittoria più larga', 'Più gol in una partita', 'Voto più alto', 'Più vittorie di fila']) {
      expect(kinds.has(t), 'record mai prodotto: ' + t).toBe(true);
    }
    expect(all.some((d) => d.players.some((p) => playerPairs(d, p).friend !== null))).toBe(true);
    expect(all.some((d) => d.players.some((p) => playerPairs(d, p).nemesis !== null))).toBe(true);
    expect(all.some((d) => headToHead(d, d.players[0] as Player, d.players[1] as Player, 'all').vs.n > 0)).toBe(true);
    expect(all.some((d) => headToHead(d, d.players[0] as Player, d.players[1] as Player, 'all').tog.n > 0)).toBe(true);
  });
});
