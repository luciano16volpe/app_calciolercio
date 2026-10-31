// Test golden (passo 3.3b): tabella Statistiche, Confronto testa a testa e Albo d'oro — il testo che scrive la nuova
// schermata è uguale a quello della vecchia (vera schermata legacy eseguita in una pagina finta).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LeagueData } from '../../src/data/queries';
import { compareBars, compareLeads, cmpLead, resolveCompare } from '../../src/domain/h2h';
import { FUT_STATS, futStat } from '../../src/domain/ovr';
import { nextStatsSort, STATS_SORT_DEFAULT, type StatsCol, type StatsFilter } from '../../src/domain/rankings';
import { seasonsList } from '../../src/domain/seasons';
import type { Dataset } from '../../src/domain/types';
import { AlboList } from '../../src/features/classifiche/Albo';
import { Confronto } from '../../src/features/classifiche/Confronto';
import { StatsTable } from '../../src/features/classifiche/StatsTable';
import { real } from './data';
import { loadLegacy, type LegacyData } from './legacy';
import { synthetic } from './synthetic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...a: any[]) => any;
interface L extends Record<string, unknown> {
  __run: (fn: () => void, scope: string) => string;
  __stats: (c: string, d: number, f: string) => void;
  __cmp: (a: string | null, b: string | null) => void;
  renderStatsTable: () => void; renderAlbo: () => void; renderConfronto: () => void;
  FUT_STATS: unknown; futStat: Fn; cmpLead: Fn;
}

const FUNCS = [
  'renderStatsTable', 'statsFilterTabs', 'renderAlbo', 'nameLink', 'renderConfronto', 'cmpIdx', 'headToHead', 'compareRows',
  'scopeMvp', 'scopeTrophies', 'futMiniHTML', 'initialsAvatar', 'avCls', 'ini', 'esc', 'formatDate', 'rosaOrder', 'calcOvr',
  'futTier', 'onFire', 'inCrisi', 'formState', 'getPlayerPagInfo', 'playerRatingAvg', 'playerSeason', 'seasonStats',
  'playerKey', 'normalizeTeam', 'getPlayerMatchResult', 'validVote', 'seasonOf', 'seasonStatus', 'seasonsList', 'alboSeasons',
  'computeSeasonAwards', 'matchEvents', 'seasonFromRows', 'mvpPerf', 'playerTrophies', 'playerPairs', 'effectiveScore',
  'formWeight',
];
const CONSTS = [
  'clEmpty', 'clMedal', 'scopeMatches', 'scopeMinPres', 'winnersHTML', 'scopeLabel', 'cmpLead', 'idxById', 'noVS', 'SEASON_ICON',
  'FUT_STATS', 'futStat', 'futRating', 'FUT_TIERS', 'FORM_STATES', 'FEATS', 'AWARDS', 'ALBO_GRACE_DAYS', 'ALBO_MIN_MATCHES',
  'ALBO_MIN_MVP', 'ALBO_NEW_KEYS', 'isFrozen', 'FORM_DELTA', 'FORM_MAX_WEIGHT', 'FORM_MIN_RATINGS', 'FORM_FULL_RATINGS',
];
const TODAY = '2026-10-31';
const liveAlbo = (JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/live_feed.json'), 'utf8')) as { albo: unknown[] }).albo;

const datasets: Array<[string, LegacyData]> = [
  ['dati reali', real as unknown as LegacyData],
  ['dati reali con albo salvato (stagioni chiuse congelate)', { ...(real as unknown as LegacyData), albo: liveAlbo }],
  ...[1, 2, 3].map((s) => [`dati inventati (seme ${s})`, synthetic(s)] as [string, LegacyData]),
];

const ENT: Record<string, string> = { '&#039;': "'", '&#x27;': "'", '&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>' };
const plain = (html: string) =>
  html
    .replace(/<br\s*\/?>/g, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#039;|&#x27;|&amp;|&quot;|&lt;|&gt;/g, (m) => ENT[m] as string)
    .replace(/\s+/g, ' ')
    .trim();
const noop = () => undefined;
const toLd = (d: Dataset, albo: unknown[] = []): LeagueData => ({
  league: { id: 'L', name: 'Lega', is_public: true, slug: 'calciolercio', owner_id: null }, dataset: d, weights: real.weights, photos: {}, albo: albo as LeagueData['albo'], gazzette: {},
});

describe.each(datasets)('%s', (_label, raw) => {
  const data = raw as unknown as Dataset;
  const ld = toLd(data, raw.albo);
  const legacy = loadLegacy<L>(FUNCS, CONSTS, raw, TODAY);
  const scopes = ['all', ...seasonsList(data.matches, [], TODAY).map((s) => s.key)];
  const run = (fn: () => void, scope: string) => plain(legacy.__run(fn, scope));

  it('tabella Statistiche: ogni filtro e ogni ordinamento', () => {
    const sorts: Array<[StatsCol, 1 | -1]> = [['goals', -1], ['name', 1], ['voto', -1], ['winpct', -1], ['pres', 1], ['w', -1], ['l', 1], ['d', -1]];
    const filters: StatsFilter[] = ['all', 'regulars', 'occ'];
    let rows = 0;
    for (const sc of scopes) {
      for (const f of filters) {
        for (const [col, dir] of sorts) {
          legacy.__stats(col, dir, f);
          const mine = plain(renderToStaticMarkup(
            <StatsTable data={ld} scope={sc} filter={f} sort={{ col, dir }} onFilter={noop} onSort={noop} onOpenPlayer={noop} />,
          ));
          expect(mine).toBe(run(legacy.renderStatsTable, sc));
          rows += mine.length;
        }
      }
    }
    expect(rows).toBeGreaterThan(1000);
  });

  it("albo d'oro: ogni stagione e 'sempre'", () => {
    let some = 0;
    for (const sc of scopes) {
      const mine = plain(renderToStaticMarkup(<AlboList data={ld} scope={sc} onOpenPlayer={noop} />));
      expect(mine).toBe(run(legacy.renderAlbo, sc));
      if (mine.includes('Premi')) some++;
    }
    expect(some).toBeGreaterThan(0);
  });

  it('confronto: giocatori di partenza e coppie scelte, ogni stagione', () => {
    const ps = data.players;
    const pairs: Array<[number | null, number | null]> = [[null, null], [0, 1], [1, 0], [2, 5], [3, ps.length - 1], [ps.length - 1, 4], [4, 4], [0, null]];
    let checked = 0;
    for (const sc of scopes) {
      for (const [i, j] of pairs) {
        const a = i == null ? null : (ps[i] as { id: string }).id;
        const b = j == null ? null : (ps[j] as { id: string }).id;
        legacy.__cmp(a, b);
        const mine = plain(renderToStaticMarkup(<Confronto data={ld} scope={sc} a={a} b={b} onChange={noop} />));
        expect(mine).toBe(run(legacy.renderConfronto, sc));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });
});

describe('piccole regole', () => {
  const legacy = loadLegacy<L>(FUNCS, CONSTS, real as unknown as LegacyData, TODAY);
  it('le 6 statistiche della figurina e chi è avanti come legacy', () => {
    expect(FUT_STATS).toEqual(legacy.FUT_STATS);
    for (const p of real.players) for (const [, idx] of FUT_STATS) expect(futStat(p.stats, idx)).toBe(legacy.futStat(p, idx));
    for (const [a, b, low] of [[1, 2, false], [2, 1, false], [1, 1, false], [null, 3, false], [3, null, true], [1, 2, true], [2, 1, true], [1, 1 + 1e-12, false]] as const) {
      expect(cmpLead(a, b, low)).toBe(legacy.cmpLead(a, b, low));
    }
  });
  it('giocatori del confronto: scelti, altrimenti i due più forti; barre e riepilogo', () => {
    const ps = real.players;
    const r = resolveCompare(ps, real.weights, null, null) as [number, number];
    expect(r[0]).not.toBe(r[1]);
    expect((resolveCompare(ps, real.weights, (ps[5] as { id: string }).id, (ps[5] as { id: string }).id) as [number, number])[1]).not.toBe(5);
    expect(resolveCompare([ps[0] as (typeof ps)[number]], real.weights, null, null)).toBeNull();
    expect(compareBars(10, 5)).toEqual({ wa: 100, wb: 50 });
    expect(compareBars(0, 0)).toEqual({ wa: 0, wb: 0 });
    expect(compareBars(null, 4)).toEqual({ wa: 0, wb: 100 });
    expect(compareLeads([{ label: 'x', a: 3, b: 1, text: String }, { label: 'y', a: 3, b: 1, text: String, lowerIsBetter: true }])).toEqual({ leads: [1, -1], la: 1, lb: 1 });
  });
  it('ordinamento: stessa colonna inverte, altra colonna riparte (nomi A–Z, numeri dal più alto)', () => {
    expect(nextStatsSort(STATS_SORT_DEFAULT, 'goals')).toEqual({ col: 'goals', dir: 1 });
    expect(nextStatsSort({ col: 'goals', dir: 1 }, 'goals')).toEqual({ col: 'goals', dir: -1 });
    expect(nextStatsSort(STATS_SORT_DEFAULT, 'name')).toEqual({ col: 'name', dir: 1 });
    expect(nextStatsSort(STATS_SORT_DEFAULT, 'voto')).toEqual({ col: 'voto', dir: -1 });
  });
});
