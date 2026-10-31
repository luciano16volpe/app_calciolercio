// Test golden (passo 3.6): le immagini da condividere. Legacy e la nuova versione disegnano su una tela finta che registra
// ogni chiamata (forme, colori, font, testi, posizioni): se i due registri sono identici, le immagini sono identiche.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setCanvasFactory } from '../../src/canvas/share';
import { drawCompare, compareInput } from '../../src/canvas/confronto';
import { drawFutCard, futCardModel, FUT_SHORT, seasonShort } from '../../src/canvas/figurina';
import { comboSheet, combosFormations, matchFormations, matchSheet, matchSummary } from '../../src/canvas/make';
import type { LeagueData } from '../../src/data/queries';
import { balanceScores, generateTeams, type Combo } from '../../src/domain/balancing';
import { seasonsList } from '../../src/domain/seasons';
import type { Dataset, Player } from '../../src/domain/types';
import { real } from './data';
import { fakeImage, makeRecorderCanvas } from './canvasRecorder';
import { loadLegacy, type LegacyData } from './legacy';
import { synthetic } from './synthetic';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...a: any[]) => any;
interface Rec { width: number; height: number; __log: unknown[][] }
interface L extends Record<string, unknown> {
  __gen: (sa: number, sb: number, sel: number[]) => { combos: Combo[]; genBest: number | null };
  __idx: (i: number) => void;
  __cmp: (a: string | null, b: string | null) => void;
  __run: (fn: () => void, scope: string) => string;
  __setLogo: (l: unknown) => void;
  __viewerGet: () => { title: string | null; canvas: Rec; name: string; text: string } | null;
  drawFutCard: Fn; drawCompareCard: Fn; shareTeams: Fn; shareTeamsSheet: Fn; shareMatchFormations: Fn; shareMatchSummary: Fn;
  shareMatchSheet: Fn; openFutCard: Fn; shareCompare: Fn; FUT_SHORT: unknown; seasonShort: Fn;
}

const FUNCS = [
  'shareTeams', 'shareTeamsSheet', 'shareMatchFormations', 'shareMatchSummary', 'shareMatchSheet', 'openFutCard', 'shareCompare',
  'drawFormationsCanvas', 'drawFieldSheet', 'drawFutCard', 'drawCompareCard', 'rosterPlayerFor', 'matchHighlights', 'mvpPerf',
  'newShareCanvas', 'drawShareHeader', 'drawTeamBlock', 'fitText', 'roundRect', 'futTier', 'onFire', 'inCrisi', 'formState',
  'playerSeason', 'seasonStats', 'playerKey', 'normalizeTeam', 'getPlayerMatchResult', 'validVote', 'seasonOf', 'seasonStatus',
  'seasonsList', 'alboSeasons', 'computeSeasonAwards', 'matchEvents', 'seasonFromRows', 'playerTrophies', 'playerRatingAvg',
  'primaryRole', 'wScore', 'effectiveScore', 'formWeight', 'calcOvr', 'formatDate', 'esc', 'ini', 'headToHead', 'compareRows',
  'scopeMvp', 'scopeTrophies', 'cmpIdx', 'rosaOrder', 'generateTeams', 'combos', 'makeSlots', 'getModulesForSize', 'comboMetrics',
  'neededTotal', 'updateCnt', 'teamSpread', 'roleFitScore', 'roleCountPenalty', 'initialsAvatar', 'avCls', 'getPlayerPagInfo', 'goalsLabel', 'playerKey',
];
const CONSTS = [
  'SHARE_C', 'SHARE_FONT', 'FUT_TIERS', 'FUT_STATS', 'futStat', 'futRating', 'FORM_STATES', 'FEATS', 'AWARDS', 'FUT_SHORT',
  'seasonShort', 'noVS', 'APP_VERSION', 'ALBO_GRACE_DAYS', 'ALBO_MIN_MATCHES', 'ALBO_MIN_MVP', 'ALBO_NEW_KEYS', 'isFrozen',
  'FORM_DELTA', 'FORM_MAX_WEIGHT', 'FORM_MIN_RATINGS', 'FORM_FULL_RATINGS', 'ROLE_ORDER', 'MODULES', 'SLOT_FALLBACK',
  'GOALS_PER_POINT', 'predGoals', 'goalsLevel', 'distribLabel', 'STATS', 'ICONS', 'scopeMatches', 'scopeLabel', 'cmpLead',
  'idxById', 'SEASON_ICON', 'scopeMinPres',
];
const TODAY = '2026-10-31';
const NOW = () => new Date(TODAY + 'T12:00:00');
const liveAlbo = (JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/live_feed.json'), 'utf8')) as { albo: unknown[] }).albo;

const datasets: Array<[string, LegacyData]> = [
  ['dati reali', real as unknown as LegacyData],
  ['dati reali con albo salvato', { ...(real as unknown as LegacyData), albo: liveAlbo }],
  ...[1, 2, 3, 4].map((s) => [`dati inventati (seme ${s})`, synthetic(s)] as [string, LegacyData]),
];

/** Confronta due registri e, se differiscono, dice dove (la prima chiamata diversa). */
function sameCanvas(mine: Rec, theirs: Rec, label: string): void {
  expect(`${label}: ${mine.width}×${mine.height}`).toBe(`${label}: ${theirs.width}×${theirs.height}`);
  const a = JSON.parse(JSON.stringify(mine.__log)) as unknown[], b = JSON.parse(JSON.stringify(theirs.__log)) as unknown[];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) {
      throw new Error(`${label}: la chiamata n.${i} è diversa\n  nuova:  ${JSON.stringify(a[i])}\n  legacy: ${JSON.stringify(b[i])}\n  (${a.length} contro ${b.length} chiamate)`);
    }
  }
}

const toLd = (raw: LegacyData): LeagueData => ({
  league: { id: 'L', name: 'Lega', is_public: true } as LeagueData['league'],
  dataset: raw as unknown as Dataset,
  weights: raw.weights,
  photos: {},
  albo: (raw.albo ?? []) as LeagueData['albo'],
  gazzette: {},
});

beforeAll(() => setCanvasFactory(makeRecorderCanvas));
afterAll(() => setCanvasFactory(() => document.createElement('canvas')));

const seen = { up: 0, down: 0, flat: 0, none: 0, tiers: new Set<string>(), medals: 0, feats: 0 };

describe.each(datasets)('%s', (_label, raw) => {
  const ld = toLd(raw);
  const data = ld.dataset;
  const legacy = loadLegacy<L>(FUNCS, CONSTS, raw, TODAY);
  const players = data.players as Player[];

  it('figurina: ogni giocatore, con e senza foto, con e senza logo', () => {
    const photo = fakeImage('foto', 400, 300);
    const logo = fakeImage('logo', 128, 128);
    players.forEach((p, i) => {
      const withPhoto = i % 2 === 0, withLogo = i % 3 !== 0;
      legacy.__setLogo(withLogo ? logo : null);
      const theirs = legacy.drawFutCard(p, withPhoto ? photo : null) as Rec;
      const model = futCardModel(data, ld.weights, ld.albo, p, TODAY);
      const mine = drawFutCard(model, withPhoto ? (photo as unknown as HTMLImageElement) : null, withLogo ? (logo as unknown as HTMLImageElement) : null) as unknown as Rec;
      sameCanvas(mine, theirs, `figurina di ${p.name}`);
      if (model.form) seen[model.form]++;
      else seen.none++;
      seen.tiers.add(model.tier);
      if (model.trophies.awards.length) seen.medals++;
      if (model.trophies.feats.length) seen.feats++;
    });
  });

  it('figurina aperta dalla scheda: stesso titolo e stessa immagine', async () => {
    legacy.__setLogo(null);
    const i = Math.min(3, players.length - 1);
    const p = players[i] as Player;
    await legacy.openFutCard(i);
    const v = legacy.__viewerGet();
    expect(v?.title).toBe('🃏 La figurina di ' + p.name);
    expect(v?.name).toBe('figurina_' + p.name.replace(/\s+/g, '_') + '.png');
    sameCanvas(drawFutCard(futCardModel(data, ld.weights, ld.albo, p, TODAY), null, null) as unknown as Rec, v?.canvas as Rec, 'figurina aperta');
  });

  it('formazioni della proposta di Gioca e foglio da stampare', () => {
    const scores = balanceScores(data, ld.weights, true);
    const n = players.length;
    for (const [sa, sb] of [[5, 5], [4, 6]] as const) {
      const selected = Array.from({ length: n }, (_, i) => i).slice(3, 3 + sa + sb);
      if (selected.length < sa + sb) continue;
      const mine = generateTeams({ players: data.players, scores, selected, sizeA: sa, sizeB: sb }) as NonNullable<ReturnType<typeof generateTeams>>;
      legacy.__gen(sa, sb, selected);
      for (const idx of [0, 1, 4]) {
        legacy.__idx(idx);
        const c = mine.combos[idx] as Combo;
        legacy.shareTeams();
        const v = legacy.__viewerGet();
        expect(v?.title).toBe('⚽ Formazioni di oggi');
        sameCanvas(combosFormations(ld, scores, c, NOW()) as unknown as Rec, v?.canvas as Rec, `formazioni ${sa}v${sb} #${idx}`);
        legacy.shareTeamsSheet();
        const s = legacy.__viewerGet();
        const mineSheet = comboSheet(ld, c, NOW());
        expect(s?.name).toBe('foglio_partita_' + mineSheet.date + '.png');
        sameCanvas(mineSheet.canvas as unknown as Rec, s?.canvas as Rec, `foglio ${sa}v${sb} #${idx}`);
      }
    }
  });

  it('partite salvate: formazioni, riepilogo e foglio di ognuna', () => {
    expect(data.matches.length).toBeGreaterThan(0);
    for (const m of data.matches) {
      legacy.shareMatchFormations(m.id);
      const f = legacy.__viewerGet();
      sameCanvas(matchFormations(ld, m) as unknown as Rec, f?.canvas as Rec, `formazioni della partita ${m.date}`);
      legacy.shareMatchSummary(m.id);
      const r = legacy.__viewerGet();
      sameCanvas(matchSummary(ld, m) as unknown as Rec, r?.canvas as Rec, `riepilogo della partita ${m.date}`);
      legacy.shareMatchSheet(m.id);
      const s = legacy.__viewerGet();
      sameCanvas(matchSheet(ld, m) as unknown as Rec, s?.canvas as Rec, `foglio della partita ${m.date}`);
    }
  });

  it('confronto: coppie e stagioni diverse, con e senza foto', async () => {
    const scopes = ['all', ...seasonsList(data.matches, [], TODAY).map((s) => s.key)];
    const photo = fakeImage('foto', 300, 400);
    const pairs: Array<[number, number]> = [[0, 1], [1, 0], [2, players.length - 1], [3, 5]].filter(([a, b]) => (a as number) < players.length && (b as number) < players.length && a !== b) as Array<[number, number]>;
    let k = 0;
    for (const sc of scopes) {
      for (const [ia, ib] of pairs) {
        const imsL = k % 3 === 0 ? [photo, null] : k % 3 === 1 ? [null, photo] : [null, null];
        k++;
        const theirs = legacy.drawCompareCard(ia, ib, sc, imsL) as Rec;
        const pa = players[ia] as Player, pb = players[ib] as Player;
        const mine = drawCompare(compareInput(data, ld.weights, ld.albo, pa, pb, sc), imsL as unknown as [HTMLImageElement | null, HTMLImageElement | null]) as unknown as Rec;
        sameCanvas(mine, theirs, `confronto ${pa.name} / ${pb.name} (${sc})`);
      }
    }
    // dal pulsante "Condividi il confronto"
    legacy.__run(() => undefined, 'all');
    legacy.__cmp((players[0] as Player).id, (players[1] as Player).id);
    await legacy.shareCompare();
    const v = legacy.__viewerGet();
    expect(v?.name).toBe(`confronto_${(players[0] as Player).name}_vs_${(players[1] as Player).name}.png`.replace(/\s+/g, '_'));
    expect(v?.text).toBe(`⚔️ ${(players[0] as Player).name} vs ${(players[1] as Player).name}`);
  });

  it('didascalie delle medaglie e stagioni abbreviate', () => {
    expect(FUT_SHORT).toEqual(legacy.FUT_SHORT);
    for (const s of ['Estate 2026', 'Autunno 2025', 'Primavera 2027', 'Inverno 2026/27', 'Autunno 2026']) expect(seasonShort(s)).toBe(legacy.seasonShort(s));
  });
});

describe('copertura', () => {
  it('i casi più diversi della figurina sono stati provati', () => {
    // (i dati dei test sopra devono includere forma, crisi, più fasce e medaglie, altrimenti il confronto non dice abbastanza)
    expect(seen.up).toBeGreaterThan(0);
    expect(seen.down).toBeGreaterThan(0);
    expect(seen.tiers.size).toBeGreaterThanOrEqual(3);
    expect(seen.medals).toBeGreaterThan(0);
  });
});
