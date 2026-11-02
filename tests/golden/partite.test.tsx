// Test golden (passo 3.4): Partite — elenco, ultima partita, Gazzette, scheda partita, equilibrio squadre, highlights e
// testo delle pagelle. Si esegue la vera schermata legacy e si confronta con i nuovi componenti.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LeagueData } from '../../src/data/queries';
import { matchBalance, matchHighlights, pagelleText, rateColors } from '../../src/domain/matches';
import type { Dataset } from '../../src/domain/types';
import { BalanceBody, MatchCard } from '../../src/features/partite/MatchCard';
import { GazArchiveBody, GazStrip, LastMatch, MatchesList, type MatchActions } from '../../src/features/partite/parts';
import { real } from './data';
import { loadLegacy, type LegacyData } from './legacy';
import { synthetic } from './synthetic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...a: any[]) => any;
interface L extends Record<string, unknown> {
  __run: (fn: () => void, scope: string) => string;
  renderMatchesList: () => void; renderLastMatch: () => void; renderGazStrip: () => void; openGazArchive: () => void;
  openMatch: (id: string) => void; pagelleText: Fn; matchHighlights: Fn; matchBalanceHTML: Fn; rateColor: Fn;
}

const FUNCS = [
  'renderMatchesList', 'renderLastMatch', 'renderGazStrip', 'openGazArchive', 'openMatch', 'matchShareButtons', 'matchHasDesc',
  'matchHighlights', 'matchHighlightsHTML', 'pagelleText', 'matchBalanceHTML', 'statCompareHTML', 'gazSectionHTML', 'pgtViewHTML',
  'comboMetrics', 'teamSpread', 'roleFitScore', 'roleCountPenalty', 'wScore', 'effectiveScore', 'playerRatingAvg', 'playerSeason',
  'seasonStats', 'playerKey', 'normalizeTeam', 'getPlayerMatchResult', 'validVote', 'seasonOf', 'formatDate', 'esc', 'calcOvr',
  'mvpPerf', 'goalsLabel', 'formWeight', 'setMatchEditable', 'rateColor',
];
const CONSTS = [
  'gazList', 'gazOf', 'gazImg', 'SEASON_ICON', 'waHTML', 'predGoals', 'goalsLevel', 'distribLabel', 'FORM_MAX_WEIGHT',
  'FORM_MIN_RATINGS', 'FORM_FULL_RATINGS', 'GOALS_PER_POINT', 'STATS', 'ICONS',
];
const TODAY = '2026-10-31';

const live = JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/live_feed.json'), 'utf8')) as {
  gazzette: Array<{ matchId: string; fileId: string; data: string; url: string; nome: string }>;
  ratings: Array<Record<string, unknown>>;
  matches: Array<Record<string, unknown>>;
};
/** Dati veri, ma con titoli, descrizioni, note e una previsione salvata (come le vere partite di oggi). */
function realFull(): LegacyData {
  const notes: Record<string, string> = {};
  for (const lm of live.matches) notes[lm.id as string] = String(lm.notes ?? '');
  const byKey = new Map(live.ratings.map((r) => [`${r.matchId}|${r.playerId}`, r]));
  const matches = real.matches.map((m, i) => ({ ...m, notes: notes[m.id as string] || (i % 3 === 0 ? "Serata al Sole d'estate" : ''), ...(i % 2 ? { pred: 0.15 * (i % 5 - 2), predRank: i % 4 } : {}) }));
  const ratings = real.ratings.map((r) => {
    const x = byKey.get(`${r.matchId}|${r.playerId}`);
    return x ? { ...r, notes: x.notes, titolo: x.titolo } : r;
  });
  return { players: real.players, weights: real.weights, matches, ratings, gazzette: live.gazzette } as unknown as LegacyData;
}

const datasets: Array<[string, LegacyData]> = [
  ['dati reali, con titoli, descrizioni e Gazzette', realFull()],
  ...[1, 2, 3].map((s) => {
    const d = synthetic(s);
    // qualche partita senza risultato, con nota e previsione, e due Gazzette
    const matches: Array<Record<string, unknown>> = (d.matches as Array<Record<string, unknown>>).map((m, i) => ({ ...m, notes: i % 4 === 0 ? `Nota ${i} & "prova"` : '', ...(i % 3 === 0 ? { pred: -0.2, predRank: 2 } : {}) }));
    const gazzette = matches.slice(2, 4).map((m) => ({ matchId: m.id as string, fileId: 'f', data: m.date as string, url: '', nome: '' }));
    return [`dati inventati (seme ${s})`, { ...d, matches, gazzette }] as [string, LegacyData];
  }),
];

const ENT: Record<string, string> = { '&#039;': "'", '&#x27;': "'", '&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>' };
/** Testo che si legge: valori dei campi compresi; tag come confini; entità decodificate. */
const plain = (html: string) =>
  html
    .replace(/<input[^>]*?value="([^"]*)"[^>]*>/g, ' $1 ')
    .replace(/<br\s*\/?>/g, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#039;|&#x27;|&amp;|&quot;|&lt;|&gt;/g, (m) => ENT[m] as string)
    .replace(/\s+/g, ' ')
    .trim();
/** Toglie da legacy quello che in sola lettura non si vede (pulsanti −/+, campi nascosti, importazione, modifica). */
const locked = (html: string) =>
  html
    .replace(/<button type="button" onclick="(?:rateStep|goalStep|scoreStep)[^>]*>[^<]*<\/button>/g, '')
    .replace(/<button type="button" class="rate-btn pgt-add"[\s\S]*?<\/button>/g, '')
    .replace(/<div class="pgt-edit"[\s\S]*?<\/textarea>\s*<\/div>/g, '')
    .replace(/<div id="wa-import"[\s\S]*?<div id="wa-preview"><\/div>\s*<\/div>/g, '')
    .replace(/<div id="match-actions"[\s\S]*?🗑️<\/button>\s*<\/div>/g, '')
    .replace(/<button id="edit-toggle-btn"[\s\S]*?<\/button>/g, '')
    .replace(/<div class="gaz-edit"[\s\S]*?<\/div>/g, '');

const noop = () => undefined;
const act: MatchActions = { openMatch: noop, openGazzetta: noop, openPagelleText: noop };
const toLd = (raw: LegacyData): LeagueData => {
  const gaz = Object.fromEntries(((raw.gazzette ?? []) as Array<{ matchId: string }>).map((g) => [g.matchId, `L/${g.matchId}.jpg`]));
  return { league: { id: 'L', name: 'Lega', is_public: true, slug: 'calciolercio', owner_id: null }, dataset: raw as unknown as Dataset, weights: real.weights, photos: {}, albo: [], gazzette: gaz };
};

describe.each(datasets)('%s', (_label, raw) => {
  const ld = toLd(raw);
  const data = ld.dataset;
  const legacy = loadLegacy<L>(FUNCS, CONSTS, raw, TODAY);
  const run = (fn: () => void) => legacy.__run(fn, 'all');

  it('testo unico delle pagelle e highlights di ogni partita: identici', () => {
    let withText = 0;
    for (const m of data.matches) {
      expect(pagelleText(data, m, 'Avv. Peppe Rella')).toBe(legacy.pagelleText(m)); // la firma ora è di chi ha scritto: con lo stesso nome di una volta il testo è identico
      expect(matchHighlights(data, m)).toEqual(legacy.matchHighlights(m));
      if (/«/.test(pagelleText(data, m, 'Avv. Peppe Rella'))) withText++;
    }
    expect(data.matches.length).toBeGreaterThan(5);
    if (_label.startsWith('dati reali')) expect(withText).toBeGreaterThan(2); // le partite con titoli
  });

  it('elenco di tutte le partite, per stagione', () => {
    expect(plain(renderToStaticMarkup(<MatchesList data={ld} act={act} />))).toBe(plain(run(legacy.renderMatchesList)));
  });

  it('ultima partita, con i suoi pulsanti', () => {
    expect(plain(renderToStaticMarkup(<LastMatch data={ld} act={act} />))).toBe(plain(run(legacy.renderLastMatch)));
  });

  it('striscia e archivio delle Gazzette', () => {
    expect(plain(renderToStaticMarkup(<GazStrip data={ld} act={act} onArchive={noop} />))).toBe(plain(run(legacy.renderGazStrip)));
    expect(plain(renderToStaticMarkup(<GazArchiveBody data={ld} act={act} />))).toBe(plain(run(legacy.openGazArchive)));
  });

  it('scheda di ogni partita (sola lettura): descrizione, risultato, highlights, Gazzetta, pagelle', () => {
    for (const m of data.matches) {
      const mine = plain(renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><MatchCard data={ld} matchId={m.id} onClose={noop} act={act} /></QueryClientProvider>));
      // un voto mancante (null) in legacy scriverebbe la parola "null" nel campo; con i dati del foglio non succede mai
      // (vuoto = 0): nella nuova app il campo resta vuoto
      const theirs = plain(locked(run(() => legacy.openMatch(m.id)))).replace(/VOTO null/g, 'VOTO');
      // il titolo ("📅 data") sta in un altro elemento in legacy: si confronta il corpo
      expect(mine.replace(/^📅 \S+ ✕ /, '')).toBe(theirs);
    }
  });

  it('equilibrio squadre di ogni partita: previsione, valori di oggi, verdetto, 11 statistiche', () => {
    let ok = 0;
    for (const m of data.matches) {
      const mine = plain(renderToStaticMarkup(<BalanceBody b={matchBalance(data, real.weights, m, true)} />));
      expect(mine).toBe(plain(legacy.matchBalanceHTML(m)));
      if (mine.includes('Squilibrio')) ok++;
    }
    expect(ok).toBeGreaterThan(3);
  });
});

describe('casi particolari', () => {
  it('colore del riquadro del voto come rateColor', () => {
    for (const v of ['', 4, 4.5, 5, 5.4, 5.5, 6, 6.5, 8, 10, 'x', null]) {
      const { background } = rateColors(v);
      const bg = parseFloat(v as string);
      expect(background).toBe(isNaN(bg) ? 'var(--gray)' : bg < 5.5 ? '#fde8e8' : bg < 6.5 ? '#fff4d6' : '#e4f7ec');
    }
  });
  it('nessuna partita: messaggio come legacy', () => {
    const empty: Dataset = { players: (real as unknown as Dataset).players, matches: [], ratings: [] };
    const ld = toLd({ players: empty.players, weights: real.weights, matches: [], ratings: [] } as unknown as LegacyData);
    expect(plain(renderToStaticMarkup(<MatchesList data={ld} act={act} />))).toContain('Nessuna partita ancora.');
    expect(renderToStaticMarkup(<LastMatch data={ld} act={act} />)).toBe('');
    expect(renderToStaticMarkup(<GazStrip data={ld} act={act} onArchive={noop} />)).toBe('');
    expect(plain(renderToStaticMarkup(<GazArchiveBody data={ld} act={act} />))).toBe('Ancora nessuna Gazzetta');
  });
  it('squadre non più in rosa: equilibrio non disponibile', () => {
    const d = real as unknown as Dataset;
    const m = { ...(d.matches[0] as Dataset['matches'][number]), teamA: [{ id: 'fantasma', name: 'Nessuno' }], teamB: [{ id: 'f2', name: 'Altro' }] };
    expect(matchBalance(d, real.weights, m).kind).toBe('unavailable');
    expect(plain(renderToStaticMarkup(<BalanceBody b={matchBalance(d, real.weights, m)} />))).toContain('Squadre non disponibili');
  });
});

describe('firma della redazione', () => {
  const data = toLd(datasets[0]![1]).dataset;
  const m = data.matches.find((x) => data.ratings.some((r) => r.matchId === x.id && r.titolo)) ?? data.matches[0]!;
  it('senza sapere chi ha scritto non c\u2019è nessuna firma (né quella fissa di una volta)', () => {
    const t = pagelleText(data, m);
    expect(t).not.toContain('a cura della Redazione');
    expect(t).not.toContain('Avv. Peppe Rella');
    expect(t.trimEnd().endsWith('\n')).toBe(false);
  });
  it('con il nome di chi ha scritto la firma è quella persona', () => {
    const t = pagelleText(data, m, 'Luca Rossi');
    expect(t.trimEnd().endsWith('✒️ _a cura della Redazione Luca Rossi_')).toBe(true);
    expect(t).not.toContain('Avv. Peppe Rella');
  });
});
