// Test golden (passo 3.5): Gioca — convocati, risultato del sorteggio (campo, squadre, riepilogo), scambi a mano e
// precisione del bilanciamento, confrontati con la vera schermata legacy (renderResult, renderPitch, buildConvList…).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LeagueData } from '../../src/data/queries';
import { balanceScores, generateTeams, type Combo } from '../../src/domain/balancing';
import { balancePrecision, comboSummary, swapPlayers, teamPlayers } from '../../src/domain/gioca';
import { pitchSvg } from '../../src/domain/pitch';
import type { Dataset } from '../../src/domain/types';
import { GiocaPage, PrecisionCard, ResultView, type Result } from '../../src/features/gioca/GiocaPage';
import { real } from './data';
import { loadLegacy, type LegacyData } from './legacy';
import { synthetic } from './synthetic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...a: any[]) => any;
interface El { innerHTML: string; textContent: string; style: Record<string, string>; attrs: Record<string, string> }
interface L extends Record<string, unknown> {
  __gen: (sa: number, sb: number, sel: number[]) => { combos: Combo[]; genBest: number | null };
  __multiOn: (b: boolean) => void; __getEl: (id: string) => El | undefined; __idx: (i: number) => void;
  __swap: (a: number, b: number) => void; __combo: () => Combo; __sel: (a: number[]) => void;
  buildConvList: () => void; balancePrecisionHTML: Fn; renderGiocaPrecision: () => void;
}

const FUNCS = [
  'renderResult', 'renderPitch', 'renderGiocaPrecision', 'balancePrecisionHTML', 'statCompareHTML', 'swapPlayers', 'recomputeCombo',
  'buildConvList', 'updateCnt', 'neededTotal', 'comboMetrics', 'teamSpread', 'roleFitScore', 'roleCountPenalty', 'wScore',
  'effectiveScore', 'playerRatingAvg', 'playerSeason', 'seasonStats', 'playerKey', 'normalizeTeam', 'getPlayerMatchResult',
  'validVote', 'seasonOf', 'primaryRole', 'rosaOrder', 'calcOvr', 'getPlayerPagInfo', 'initialsAvatar', 'avCls', 'ini', 'esc',
  'goalsLabel', 'formWeight', 'generateTeams', 'combos', 'makeSlots', 'getModulesForSize',
];
const CONSTS = [
  'ROLE_ORDER', 'MODULES', 'SLOT_FALLBACK', 'GOALS_PER_POINT', 'predGoals', 'goalsLevel', 'distribLabel', 'STATS', 'ICONS',
  'FORM_MAX_WEIGHT', 'FORM_MIN_RATINGS', 'FORM_FULL_RATINGS',
];
const TODAY = '2026-10-31';

/** Dati veri con qualche previsione salvata, perché la precisione mostri tutte le sue parti. */
function realWithPred(): LegacyData {
  const matches = real.matches.map((m, i) => ({ ...m, ...(i % 2 ? { pred: 0.12 * ((i % 5) - 2), predRank: i % 4 } : {}) }));
  return { players: real.players, weights: real.weights, matches, ratings: real.ratings } as unknown as LegacyData;
}
const datasets: Array<[string, LegacyData]> = [
  ['dati reali con previsioni salvate', realWithPred()],
  ['dati reali senza previsioni', real as unknown as LegacyData],
  ['dati inventati (seme 2)', synthetic(2)],
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
const toLd = (raw: LegacyData): LeagueData => ({
  league: { id: 'L', name: 'Lega', is_public: true, slug: 'calciolercio', owner_id: null }, dataset: raw as unknown as Dataset, weights: real.weights,
  // chi ha la foto nei dati di prova la ha anche qui (il campo mostra la foto e il nome sotto)
  photos: Object.fromEntries((raw.players as Array<{ id: string; photo?: string }>).filter((p) => p.photo).map((p) => [p.id, 'p.jpg'])),
  albo: [], gazzette: {},
});
const shuffle = <T,>(a: T[], seed: number) => {
  let s = seed >>> 0;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  return a.map((x) => [r(), x] as const).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
};

describe.each(datasets)('%s', (_label, raw) => {
  const ld = toLd(raw);
  const data = ld.dataset;
  const legacy = loadLegacy<L>(FUNCS, CONSTS, raw, TODAY);
  const n = data.players.length;
  const formats: Array<[number, number]> = [[5, 5], [6, 6], [5, 6], [4, 6], [3, 5]];

  it('risultato del sorteggio: campo (SVG identico), squadre, riepilogo, per ogni proposta e per ogni formato', () => {
    const scores = balanceScores(data, real.weights, true);
    legacy.__multiOn(true);
    let svgChecked = 0;
    for (const [sa, sb] of formats) {
      const selected = shuffle(Array.from({ length: n }, (_, i) => i), sa * 10 + sb).slice(0, sa + sb);
      const mine = generateTeams({ players: data.players, scores, selected, sizeA: sa, sizeB: sb }) as NonNullable<ReturnType<typeof generateTeams>>;
      legacy.__gen(sa, sb, selected); // esegue anche renderResult (la proposta 1)
      for (const idx of [0, 1, Math.min(5, mine.combos.length - 1)]) {
        legacy.__idx(idx);
        const g = (id: string) => legacy.__getEl(id) as El;
        const c = mine.combos[idx] as Combo;
        const players = data.players.map((p) => ({ ...p, photo: (p as { photo?: string }).photo ?? null }));
        const pA = teamPlayers(players, scores, c.tA);
        const pB = teamPlayers(players, scores, c.tB);
        // campo: stesso identico SVG
        const svg = pitchSvg(pA, pB, c.modA, c.modB);
        expect(svg.viewBox).toBe(g('pitch-svg').attrs.viewBox);
        expect(svg.inner).toBe(g('pitch-svg').innerHTML);
        svgChecked++;
        // testi del riepilogo
        const sum = comboSummary(c, mine.genBest, idx, mine.combos.length);
        expect(sum.avgA).toBe(g('avg-a').textContent);
        expect(sum.avgB).toBe(g('avg-b').textContent);
        expect(sum.modLabelA).toBe(g('mod-label-a').textContent);
        expect(sum.modLabelB).toBe(g('mod-label-b').textContent);
        expect(sum.idxText).toBe(g('combo-idx').textContent);
        expect(sum.quality.text).toBe(g('combo-quality').textContent);
        const colors = { ok: 'var(--green)', warn: 'var(--amber)', bad: 'var(--red)' };
        expect(colors[sum.quality.level]).toBe(g('combo-quality').style.color);
        const cost = sum.balance.cost ? `<div class="bal-cost">${sum.balance.cost}</div>` : '';
        const balHtml = `<span class="pill-${sum.balance.level}">${sum.balance.level === 'ok' ? '⚖️' : '⚠'} ${sum.balance.label} <span class="pill-sub">· diff ${sum.balance.diff}</span></span>${cost}`;
        expect(plain(balHtml)).toBe(plain(g('bal-row').innerHTML));
        // squadre e confronto statistiche: lo stesso testo
        const res: Result = { combos: mine.combos, genBest: mine.genBest, idx };
        const html = plain(renderToStaticMarkup(<ResultView data={ld} res={res} scores={scores} onChange={noop} />));
        const expected = plain(
          [
            'Campo Blu Bianchi', g('pitch-svg').innerHTML, '✋ Trascina un giocatore sull\'altra squadra per scambiarlo',
            '🔵 Blu', g('avg-a').textContent, g('mod-label-a').textContent, g('chips-a').innerHTML,
            '⚪ Bianchi', g('avg-b').textContent, g('mod-label-b').textContent, g('chips-b').innerHTML,
            '📲 Condividi 🖨️ Foglio 📅 Crea partita Confronto statistiche',
            g('stat-cmp').innerHTML, g('bal-row').innerHTML, '◀', g('combo-idx').textContent, g('combo-quality').textContent, '▶',
            g('gioca-precision').innerHTML,
          ].join(' '),
        );
        expect(html).toBe(expected);
      }
    }
    expect(svgChecked).toBe(formats.length * 3);
  });

  it('scambi a mano: stesse squadre, stesso punteggio, stesso aspetto del risultato', () => {
    const scores = balanceScores(data, real.weights, true);
    legacy.__multiOn(true);
    const selected = shuffle(Array.from({ length: n }, (_, i) => i), 77).slice(0, 10);
    const mine = generateTeams({ players: data.players, scores, selected, sizeA: 5, sizeB: 5 }) as NonNullable<ReturnType<typeof generateTeams>>;
    legacy.__gen(5, 5, selected);
    let c = mine.combos[0] as Combo;
    for (const [i, j] of [[0, 0], [1, 2], [4, 3], [2, 4]] as const) {
      const a = c.tA[i] as number;
      const b = c.tB[j] as number;
      legacy.__swap(a, b);
      const next = swapPlayers({ players: data.players, scores }, c, a, b) as Combo;
      expect(next.custom).toBe(true);
      expect(next).toEqual(legacy.__combo());
      c = next;
      const combos = [c, ...mine.combos.slice(1)];
      const sum = comboSummary(c, mine.genBest, 0, combos.length);
      expect(sum.idxText).toBe((legacy.__getEl('combo-idx') as El).textContent);
      expect(plain(`${sum.balance.cost ?? ''}`)).toBe(plain(((legacy.__getEl('bal-row') as El).innerHTML.match(/<div class="bal-cost">(.*?)<\/div>/) ?? [])[1] ?? ''));
    }
    // due giocatori della stessa squadra: nessuno scambio
    expect(swapPlayers({ players: data.players, scores }, c, c.tA[0] as number, c.tA[1] as number)).toBeNull();
  });

  it('precisione del bilanciamento: stessi numeri', () => {
    const mineText = plain(renderToStaticMarkup(<PrecisionCard data={ld} />));
    const theirs = plain(legacy.balancePrecisionHTML(data.matches));
    expect(mineText).toBe(theirs);
    expect(balancePrecision(data.matches) !== null).toBe(theirs !== '');
  });

  it('convocati: lista, selezione e contatore', () => {
    legacy.__multiOn(true);
    const order = [...data.players.keys()];
    const selIdx = order.slice(0, 7);
    legacy.__sel(selIdx);
    legacy.buildConvList();
    const html = plain(renderToStaticMarkup(<GiocaPage data={ld} initialSelected={selIdx.map((i) => (data.players[i] as { id: string }).id)} />));
    const conv = plain((legacy.__getEl('conv-list') as El).innerHTML);
    expect(html).toContain(conv);
    expect(html).toContain('Selezionati: 7 / 10 richiesti'); // formato di partenza 5 vs 5
  });
});

describe('casi particolari', () => {
  it('senza partite con risultato non c\'è la precisione', () => {
    const d: Dataset = { players: (real as unknown as Dataset).players, matches: [], ratings: [] };
    expect(balancePrecision(d.matches)).toBeNull();
    expect(renderToStaticMarkup(<PrecisionCard data={toLd(d as unknown as LegacyData)} />)).toBe('');
  });
});
