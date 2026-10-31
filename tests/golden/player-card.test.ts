// Test golden: scheda giocatore — trofei, bacheca, pagelle, grafico e peso dei voti come legacy.
// Si esegue il vero codice legacy (drawPagelle, bachecaHTML, formWeightCell…) e se ne leggono i numeri.
import { describe, expect, it } from 'vitest';
import { alboSeasons } from '../../src/domain/awards';
import { formatDate } from '../../src/domain/format';
import {
  PG_CHART_MAX, bachecaView, formWeightTip, formWeightView, pagelleView, playerPagelleList, playerTrophies, shortSeason, voteColor,
  type BachecaView, type PagCell, type PagelleView,
} from '../../src/domain/playerCard';
import { FORM_STATES, FUT_TIERS } from '../../src/domain/tiers';
import type { Dataset } from '../../src/domain/types';
import { real } from './data';
import { loadLegacy, type LegacyData } from './legacy';
import { synthetic } from './synthetic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...a: any[]) => any;
interface L extends Record<string, unknown> {
  __draw: (i: number) => string;
  __useForm: (b: boolean) => void;
  playerPagelleList: Fn; playerTrophies: Fn; bachecaHTML: Fn; formWeightCell: Fn; shortSeason: Fn; pgVoteCol: Fn;
  FUT_TIERS: unknown; FORM_STATES: unknown; PG_CHART_MAX: number;
}

const FUNCS = [
  'playerPagelleList', 'playerTrophies', 'bachecaHTML', 'formWeightCell', 'formWeightCellInner', 'drawPagelle', 'playerRatingAvg',
  'playerSeason', 'seasonStats', 'playerKey', 'normalizeTeam', 'getPlayerMatchResult', 'validVote', 'seasonOf', 'seasonStatus',
  'seasonsList', 'alboSeasons', 'computeSeasonAwards', 'matchEvents', 'seasonFromRows', 'mvpPerf', 'formState', 'formWeight',
  'calcOvr', 'formatDate', 'esc',
];
const CONSTS = [
  'FUT_TIERS', 'FORM_STATES', 'PG_CHART_MAX', 'shortSeason', 'pgVoteCol', 'FORM_DELTA', 'FORM_MAX_WEIGHT', 'FORM_MIN_RATINGS',
  'FORM_FULL_RATINGS', 'FEATS', 'AWARDS', 'ALBO_GRACE_DAYS', 'ALBO_MIN_MATCHES', 'ALBO_MIN_MVP', 'ALBO_NEW_KEYS', 'isFrozen',
  '_pgSeries',
];
const TODAY = '2026-10-31';
/** Dati veri con due casi limite: un giocatore senza nessuna pagella, uno con pagelle ma senza voto (solo gol e presenze). */
function casiLimite(): LegacyData {
  const [senza, senzaVoto] = real.players;
  const ratings = real.ratings
    .filter((r) => r.playerId !== senza?.id)
    .map((r) => (r.playerId === senzaVoto?.id ? { ...r, rating: 0 } : r));
  return { players: real.players, weights: real.weights, matches: real.matches, ratings } as unknown as LegacyData;
}
const datasets: Array<[string, LegacyData]> = [
  ['dati reali', real as unknown as LegacyData],
  ['dati reali con casi limite', casiLimite()],
  ...[1, 2, 3].map((s) => [`dati inventati (seme ${s})`, synthetic(s)] as [string, LegacyData]),
];

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Casella del grafico → testo (come si legge dall'HTML di legacy). */
function parseCells(html: string): Array<{ label: string; value: string; style: string }> {
  return (html.match(/<div class="pg-cell">[\s\S]*?<\/div><\/div>/g) || []).map((c) => {
    const label = ((c.match(/<div class="pg-lbl">([\s\S]*?)<\/div>/) as RegExpMatchArray)[1] as string).trim();
    const val = c.match(/<div class="pg-val"(?: style="([^"]*)")?>([\s\S]*?)<\/div>/);
    const form = c.match(/<div class="pg-form">([\s\S]*?)<\/div>/);
    if (form) {
      const dots = (form[1] as string).match(/background:(#[0-9a-f]{6})/g) || [];
      return { label, value: dots.map((d) => d.slice(11)).join(',') || '—', style: '' };
    }
    return { label, value: ((val as RegExpMatchArray)[2] as string).trim(), style: ((val as RegExpMatchArray)[1] as string | undefined) ?? '' };
  });
}
const mineCells = (cells: PagCell[]) =>
  cells.map((c) => ({
    label: c.label,
    value: c.dots !== undefined ? (c.dots ? c.dots.join(',') : '—') : (c.value as string),
    style: [c.color ? 'color:' + c.color : '', c.size ? 'font-size:' + c.size + 'px' : ''].filter(Boolean).join(';'),
  }));

describe('costanti', () => {
  const legacy = loadLegacy<L>(FUNCS, CONSTS, real as unknown as LegacyData, TODAY);
  it('fasce delle figurine, stati di forma e soglie uguali a legacy', () => {
    expect(FUT_TIERS).toEqual(legacy.FUT_TIERS);
    expect(FORM_STATES).toEqual(legacy.FORM_STATES);
    expect(PG_CHART_MAX).toBe(legacy.PG_CHART_MAX);
  });
  it('colore del voto, stagione abbreviata, formato data', () => {
    for (const v of [1, 5, 5.49, 5.5, 6, 6.49, 6.5, 8, 10]) expect(voteColor(v)).toBe(legacy.pgVoteCol(v));
    for (const s of ['Estate 2026', 'Autunno 2026', 'Inverno 2026/27', 'Primavera 2025', 'boh']) expect(shortSeason(s)).toBe(legacy.shortSeason(s));
    expect(shortSeason('Estate 2026')).toBe('Est 26');
  });
});

describe.each(datasets)('%s', (_label, raw) => {
  const data = raw as unknown as Dataset;
  const legacy = loadLegacy<L>(FUNCS, CONSTS, raw, TODAY);
  const weights = real.weights;

  it('elenco delle pagelle di ogni giocatore identico', () => {
    let tot = 0;
    for (const p of data.players) {
      const mine = playerPagelleList(data, p);
      expect(mine).toEqual(legacy.playerPagelleList(p));
      tot += mine.length;
    }
    expect(tot).toBeGreaterThan(20);
  });

  it('trofei di ogni giocatore identici', () => {
    let tot = 0;
    const seasons = alboSeasons(data, [], TODAY);
    for (const p of data.players) {
      const mine = playerTrophies(data, p, [], TODAY, seasons);
      expect(mine).toEqual(legacy.playerTrophies(p));
      tot += mine.awards.length + mine.feats.length;
    }
    expect(tot).toBeGreaterThan(5);
  });

  it('bacheca: stessa riga riassuntiva, trofei raggruppati, premi in lizza e imprese', () => {
    const seasons = alboSeasons(data, [], TODAY);
    for (const p of data.players) {
      const v = bachecaView(playerTrophies(data, p, [], TODAY, seasons));
      const html = norm(legacy.bachecaHTML(p) as string);
      if (v.empty) {
        expect(html).toContain('Ancora nessun trofeo');
        continue;
      }
      expect(html).toContain(`<span class="bach-sumt">${v.summary}</span>`);
      expect(html).toBe(norm(renderBacheca(v)));
    }
  });

  it('peso dei voti (12ª casella) con e senza "usa la forma"', () => {
    for (const useForm of [true, false]) {
      legacy.__useForm(useForm);
      for (const p of data.players) {
        const v = formWeightView(data, p, useForm);
        const html = norm(legacy.formWeightCell(p) as string);
        if (v.off) expect(html).toContain('stat-ro" style="color:var(--text3);-webkit-text-fill-color:var(--text3)">Off</span>');
        else {
          expect(html).toContain(`<span class="stat-input stat-ro">${v.pct}%</span>`);
          expect(html).toContain(`width:${v.fill}%;background:var(--amber)`);
        }
        expect(html).toContain(`title="${formWeightTip}"`);
      }
    }
    legacy.__useForm(true);
  });

  it('numeri e grafico "📈 Pagelle" di ogni giocatore identici', () => {
    const kinds = new Set<string>();
    const all = data.players.map((p, i) => ({ p, i, v: pagelleView(data, weights, p) }));
    for (const { i, v } of all) {
      kinds.add(v.kind);
      const html = legacy.__draw(i) as string;
      checkPagelle(v, html);
    }
    expect(kinds.has('full')).toBe(true);
  });
});

describe('copertura', () => {
  it('i dati veri e inventati producono tutti i tipi di scheda: nessuna pagella, solo gol, con grafico', () => {
    const kinds = new Set<string>();
    for (const [, raw] of datasets) {
      const d = raw as unknown as Dataset;
      d.players.forEach((p) => kinds.add(pagelleView(d, real.weights, p).kind));
    }
    expect(kinds).toEqual(new Set(['none', 'noVotes', 'full']) as Set<string>);
    // il grafico mostra al massimo 10 barre
    const d = real as unknown as Dataset;
    for (const p of d.players) {
      const v = pagelleView(d, real.weights, p);
      if (v.kind === 'full') expect(v.chart.bars.length).toBeLessThanOrEqual(PG_CHART_MAX);
    }
  });
  it('senza voti ma con presenze: casella "AG · Meta" e nessun grafico', () => {
    const d = real as unknown as Dataset;
    // un giocatore con presenze ma senza alcun voto valido
    const data: Dataset = {
      ...d,
      ratings: d.ratings.map((r) => ({ ...r, rating: 0 })),
    };
    const v = pagelleView(data, real.weights, d.players[0] as Dataset['players'][number]);
    expect(['noVotes', 'none']).toContain(v.kind);
    const nv = data.players.map((p) => pagelleView(data, real.weights, p)).find((x) => x.kind === 'noVotes');
    expect(nv?.kind).toBe('noVotes');
    if (nv?.kind === 'noVotes') expect(nv.cells.map((c) => c.label)).toEqual(['Partite', '⚽ Gol', '⚽ Gol/P', '% Vittorie', 'Forma', '🙃 AG · 🚀 Meta']);
  });
});

/** HTML della bacheca come lo scrive legacy, a partire dai dati calcolati (specchio del modello in bachecaHTML). */
function renderBacheca(v: BachecaView): string {
  const chips = v.chips
    .map((x) => `<span class="trophy${x.shame ? ' shame' : ''}">${x.t}${x.seasons.length > 1 ? ` <b>×${x.seasons.length}</b>` : ''}<small>${x.seasons.join(', ')}</small></span>`)
    .join('');
  const lizza = v.live
    ? `<div class="bach-live" onclick="this.classList.toggle('open')" title="Premi della stagione in corso: possono ancora cambiare">
      <span class="bach-lbl">${v.live.label}</span>
      <span class="bach-emo">${v.live.emojis}</span><span class="bach-names">${v.live.names.replace(/'/g, '&#039;')}</span><span class="bach-more">›</span></div>`
    : '';
  const feats = v.feats.length ? `<div class="bach-feats">${v.feats.map((f) => `<span title="${f.d}">${f.t} <b>×${f.count}</b></span>`).join('')}</div>` : '';
  return `<div class="pe-sec bach">
      <div class="bach-sum" onclick="toggleBacheca(this)"><span class="pe-title" style="margin:0">🏆 Bacheca</span><span class="bach-sumt">${v.summary}</span><span class="bach-arr">▾</span></div>
      <div class="bach-body">${chips ? `<div class="trophies">${chips}</div>` : ''}${lizza}${feats}</div>
    </div>`;
}

/** Confronta la vista calcolata con l'HTML scritto da legacy. */
function checkPagelle(v: PagelleView, html: string) {
  if (v.kind === 'none') {
    expect(norm(html)).toContain('Nessuna pagella ancora');
    return;
  }
  expect(parseCells(html)).toEqual(mineCells(v.cells));
  if (v.kind === 'noVotes') {
    expect(norm(html)).toContain('Nessun voto ancora registrato');
    expect(html).not.toContain('pg-chart');
    return;
  }
  const c = v.chart;
  // intestazione: stato di forma (freccia, etichetta, colore)
  const head = html.match(/<span style="font-size:11px;font-weight:800;color:([^"]*)">([^<]*)<\/span>/) as RegExpMatchArray;
  expect([head[1], (head[2] as string).trim()]).toEqual([v.trend.col, `${v.trend.arrow} ${v.trend.label}`.trim()]);
  // barre
  const bars = [...html.matchAll(/<rect class="pg-bar" data-j="(\d+)" x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)" rx="2.5" fill="(#[0-9a-f]{6})"/g)];
  expect(bars.map((m) => [Number(m[1]), m[2], m[3], m[4], m[5], m[6]])).toEqual(
    c.bars.map((b) => [b.j, b.x.toFixed(1), b.y.toFixed(1), b.width.toFixed(1), b.height.toFixed(1), b.fill]),
  );
  // numero sopra ogni barra
  const labels = [...html.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" font-size="7.5" font-weight="800" fill="var\(--text2\)" text-anchor="middle">([\d.]+)<\/text>/g)];
  expect(labels.map((m) => [m[1], m[2], m[3]])).toEqual(c.bars.map((b) => [b.cx.toFixed(1), (b.y - 3).toFixed(1), String(b.rating)]));
  // linee della griglia
  const grid = [...html.matchAll(/<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="[\d.-]+" stroke="var\(--gray3\)"/g)];
  expect(grid.map((m) => [m[1], m[2], m[3]])).toEqual(c.grid.map((g) => [String(g.x1), g.y.toFixed(1), String(g.x2)]));
  // linea di tendenza
  const tl = html.match(/<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)" stroke="#5aa9ff"/);
  if (c.trend) expect(tl && [tl[1], tl[2], tl[3], tl[4]]).toEqual([c.trend.x1.toFixed(1), c.trend.y1.toFixed(1), c.trend.x2.toFixed(1), c.trend.y2.toFixed(1)]);
  else expect(tl).toBeNull();
  // aree toccabili
  const hits = [...html.matchAll(/<rect class="pg-hit" x="([\d.-]+)" y="0" width="([\d.-]+)"/g)];
  expect(hits.map((m) => [m[1], m[2]])).toEqual(c.hits.map((h) => [h.x.toFixed(1), h.width.toFixed(1)]));
  // didascalia e ultima pagella scritta
  expect(norm(html.match(/<div class="pg-cap">([\s\S]*?)<\/div>/)?.[1] as string)).toBe(norm(c.caption));
  const last = html.match(/<button type="button" class="pg-last"[^>]*>([\s\S]*?)<\/button>/);
  if (v.last) {
    const L = v.last;
    const expected = `📝 Ultima pagella: ${L.tit ? `<b>«${L.tit}»</b>` : `<i>${L.descPreview}</i>`} · ${L.date} <span class="pg-last-n">${L.n > 1 ? L.n + ' ›' : '›'}</span>`;
    expect(norm(last?.[1] as string).replace(/&#039;/g, "'")).toBe(norm(expected));
  } else expect(last).toBeNull();
  expect(formatDate(c.series[0]?.date)).toBeTruthy();
}
