// Test golden: schede delle Classifiche — il testo che scrive la nuova schermata è uguale a quello della vecchia.
// Si esegue la vera schermata legacy (renderScorersList, renderMediaList, renderCoppie, renderRecord, renderSeasonDash)
// in una pagina finta e si confronta, riga per riga, con il testo dei nuovi componenti.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LeagueData } from '../../src/data/queries';
import { seasonsList } from '../../src/domain/seasons';
import type { Dataset } from '../../src/domain/types';
import { SeasonDash } from '../../src/features/classifiche/ClassifichePage';
import { CoppieList, MediaList, RecordList, ScorersList } from '../../src/features/classifiche/lists';
import { real } from './data';
import { loadLegacy, type LegacyData } from './legacy';
import { synthetic } from './synthetic';

interface L extends Record<string, unknown> {
  __run: (fn: () => void, scope: string) => string;
  __tab: (t: string) => void;
  renderScorersList: () => void; renderMediaList: () => void; renderCoppie: () => void; renderRecord: () => void; renderSeasonDash: () => void;
}

const FUNCS = [
  'renderScorersList', 'renderMediaList', 'renderCoppie', 'renderRecord', 'renderSeasonDash', 'clRow', 'scopePairs', 'seasonStats',
  'playerKey', 'normalizeTeam', 'getPlayerMatchResult', 'validVote', 'seasonOf', 'seasonStatus', 'seasonsList', 'esc', 'formatDate',
];
const CONSTS = ['clEmpty', 'clMedal', 'scopeMatches', 'scopeMinPres'];
const TODAY = '2026-10-31';

const datasets: Array<[string, LegacyData]> = [
  ['dati reali', real as unknown as LegacyData],
  ...[1, 2, 3].map((s) => [`dati inventati (seme ${s})`, synthetic(s)] as [string, LegacyData]),
];

const ENT: Record<string, string> = { '&#039;': "'", '&#x27;': "'", '&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>' };
/** Solo il testo che si legge: ogni tag è un confine, <br> è "|", le entità sono decodificate, gli spazi uniformati. */
const plain = (html: string) =>
  html
    .replace(/<br\s*\/?>/g, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#039;|&#x27;|&amp;|&quot;|&lt;|&gt;/g, (m) => ENT[m] as string)
    .replace(/\s+/g, ' ')
    .trim();

const toLeagueData = (d: Dataset): LeagueData =>
  ({ league: { id: 'L', name: 'Lega', is_public: true, slug: 'calciolercio', owner_id: null }, dataset: d, weights: real.weights, photos: {}, albo: [], gazzette: {} });
const noop = () => undefined;

describe.each(datasets)('%s', (_label, raw) => {
  const data = raw as unknown as Dataset;
  const ld = toLeagueData(data);
  const legacy = loadLegacy<L>(FUNCS, CONSTS, raw, TODAY);
  const scopes = ['all', ...seasonsList(data.matches, [], TODAY).map((s) => s.key)];
  const legacyText = (fn: () => void, scope: string, tab?: string) => {
    if (tab) legacy.__tab(tab);
    return plain(legacy.__run(fn, scope));
  };

  it('i quattro numeri della stagione', () => {
    let some = 0;
    for (const sc of scopes) {
      const mine = plain(renderToStaticMarkup(<SeasonDash data={ld} scope={sc} />));
      expect(mine).toBe(legacyText(legacy.renderSeasonDash, sc));
      if (mine) some++;
    }
    expect(some).toBeGreaterThan(0);
  });

  it.each([['marcatori', 'goals'], ['assist', 'assist']] as const)('classifica %s', (tab, field) => {
    let rows = 0;
    for (const sc of scopes) {
      const mine = plain(renderToStaticMarkup(<ScorersList data={ld} scope={sc} field={field} onOpenPlayer={noop} />));
      expect(mine).toBe(legacyText(legacy.renderScorersList, sc, tab));
      rows += mine.length;
    }
    expect(rows).toBeGreaterThan(100);
  });

  it('classifica media voto, con gli Occasionali a parte', () => {
    for (const sc of scopes) {
      const mine = plain(renderToStaticMarkup(<MediaList data={ld} scope={sc} onOpenPlayer={noop} />));
      expect(mine).toBe(legacyText(legacy.renderMediaList, sc));
    }
  });

  it("coppie d'oro e maledette", () => {
    for (const sc of scopes) {
      const mine = plain(renderToStaticMarkup(<CoppieList data={ld} scope={sc} onOpenPlayer={noop} />));
      expect(mine).toBe(legacyText(legacy.renderCoppie, sc));
    }
  });

  it('record', () => {
    for (const sc of scopes) {
      const mine = plain(renderToStaticMarkup(<RecordList data={ld} scope={sc} onOpenPlayer={noop} onOpenMatch={noop} />));
      // nei record a pari merito l'ordine dei nomi può cambiare (vedi docs/DECISIONI.md): qui i dati sono gli stessi
      // di legacy, quindi l'ordine è identico
      expect(mine).toBe(legacyText(legacy.renderRecord, sc));
    }
  });
});

describe('casi vuoti', () => {
  it('senza partite: nessun numero, elenchi vuoti con i messaggi di legacy', () => {
    const empty: Dataset = { players: (real as unknown as Dataset).players, matches: [], ratings: [] };
    const ld = toLeagueData(empty);
    expect(renderToStaticMarkup(<SeasonDash data={ld} scope="all" />)).toBe('');
    expect(plain(renderToStaticMarkup(<ScorersList data={ld} scope="all" field="goals" onOpenPlayer={noop} />))).toContain('Nessun gol registrato ancora');
    expect(plain(renderToStaticMarkup(<ScorersList data={ld} scope="all" field="assist" onOpenPlayer={noop} />))).toContain('Nessun assist registrato ancora');
    expect(plain(renderToStaticMarkup(<MediaList data={ld} scope="all" onOpenPlayer={noop} />))).toContain('Nessun voto ancora');
    expect(plain(renderToStaticMarkup(<CoppieList data={ld} scope="all" onOpenPlayer={noop} />))).toContain('Servono almeno 3 partite giocate insieme');
    expect(plain(renderToStaticMarkup(<RecordList data={ld} scope="all" onOpenPlayer={noop} onOpenMatch={noop} />))).toContain('Nessuna partita con risultato');
  });
});
