// Scheda giocatore: trofei, elenco delle pagelle, peso dei voti e dati del grafico "📈 Pagelle".
// Fonte: playerTrophies, bachecaHTML, playerPagelleList, formWeightCell, drawPagelle in legacy/index.html.
// Qui ci sono solo i calcoli: il disegno (HTML) è nei componenti.
import { alboSeasons, FEATS, type AlboRow, type SeasonAwards } from './awards';
import { FORM_FULL_RATINGS, FORM_MAX_WEIGHT, FORM_MIN_RATINGS, formState, formWeight, playerRatingAvg } from './form';
import { formatDate } from './format';
import { calcOvr } from './ovr';
import { playerKey, playerSeason, seasonStats } from './stats';
import { FORM_STATES } from './tiers';
import type { Dataset, Match, Player } from './types';


// ── trofei e bacheca ───────────────────────────────────────────────────────
export interface TrophyAward {
  k: string;
  t: string;
  shame?: boolean;
  season: string;
  /** stagione non ancora chiusa: il premio può ancora cambiare ("in lizza") */
  live: boolean;
}

export interface PlayerTrophies {
  awards: TrophyAward[];
  feats: Array<{ k: string; t: string; d: string; count: number }>;
}

/** Premi e imprese di un giocatore in tutte le stagioni (albo salvato + calcolo dal vivo). */
export function playerTrophies(
  data: Dataset,
  p: Pick<Player, 'id' | 'name'>,
  albo: AlboRow[] = [],
  today?: string,
  seasons: SeasonAwards[] = alboSeasons(data, albo, today),
): PlayerTrophies {
  const name = playerKey(data.players, p.id, p.name).name;
  const awards: TrophyAward[] = [];
  seasons.forEach((S) =>
    S.awards.forEach((a) => {
      if (a.winners.some((w) => w === name || w.split(' & ').includes(name)))
        awards.push({ k: a.k, t: a.t, shame: a.shame, season: S.label, live: S.status !== 'chiusa' });
    }),
  );
  const feats = FEATS.map((f) => ({
    k: f.k,
    t: f.t,
    d: f.d,
    count: seasons.reduce((s, S) => s + ((S.feats[f.k] || []).find((x) => x.name === name)?.count || 0), 0),
  })).filter((f) => f.count > 0);
  return { awards, feats };
}

/** La stagione si scrive sempre per intero e con l'anno a due cifre («Estate 26»): niente più sigle. */
export const shortSeason = (s: string): string => String(s);

export interface BachecaView {
  /** nessun trofeo, nessuna impresa */
  empty: boolean;
  /** riga riassuntiva: "2 trofei · 1 in lizza · 3 imprese" */
  summary: string;
  /** trofei vinti, raggruppati per premio (stesso premio in più stagioni → ×N) */
  chips: Array<{ t: string; shame: boolean; seasons: string[] }>;
  /** premi della stagione in corso */
  live: { label: string; emojis: string; names: string } | null;
  feats: PlayerTrophies['feats'];
}

export function bachecaView(tr: PlayerTrophies): BachecaView {
  const won = tr.awards.filter((a) => !a.live);
  const live = tr.awards.filter((a) => a.live);
  const nW = won.length;
  const nL = live.length;
  const nF = tr.feats.length;
  const summary = [
    nW ? `${nW} ${nW === 1 ? 'trofeo' : 'trofei'}` : '',
    nL ? `${nL} in lizza` : '',
    nF ? `${nF} ${nF === 1 ? 'impresa' : 'imprese'}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const g: Record<string, { t: string; shame: boolean; seasons: string[] }> = {};
  won.forEach((a) => {
    (g[a.k] ??= { t: a.t, shame: !!a.shame, seasons: [] }).seasons.push(shortSeason(a.season));
  });
  return {
    empty: !summary,
    summary,
    chips: Object.values(g),
    live: nL
      ? {
          label: `⏳ In lizza · ${[...new Set(live.map((a) => shortSeason(a.season)))].join(', ')}`,
          emojis: live.map((a) => a.t.split(' ')[0]).join(' '),
          names: live.map((a) => a.t).join(' · '),
        }
      : null,
    feats: tr.feats,
  };
}

// ── pagelle del giocatore ──────────────────────────────────────────────────
export interface PagellaItem {
  hasText?: boolean;
  m: Match;
  v: number;
  tit: string;
  desc: string;
  g: number;
  a: number;
}

/** Le pagelle del giocatore (con voto), dalla più recente. */
export function playerPagelleList(data: Dataset, p: Pick<Player, 'id' | 'name'>): PagellaItem[] {
  const key = playerKey(data.players, p.id, p.name).key;
  const out: PagellaItem[] = [];
  data.matches
    .filter((m) => m.date)
    .forEach((m) => {
      const r = data.ratings.find((x) => x.matchId === m.id && playerKey(data.players, x.playerId, x.player).key === key);
      if (r && parseFloat(r.rating as string) >= 1) {
        out.push({
          m,
          v: parseFloat(r.rating as string),
          hasText: r.hasText,
          tit: String(r.titolo || '').trim(),
          desc: String(r.notes || '').trim(),
          g: parseInt(r.goals as string) || 0,
          a: parseInt(r.assist as string) || 0,
        });
      }
    });
  return out.sort((a, b) => String(b.m.date).localeCompare(String(a.m.date)));
}

/** Colore del voto: ≥ 6,5 verde · ≥ 5,5 giallo · sotto rosso. */
export const voteColor = (v: number): string => (v >= 6.5 ? '#3aad5e' : v >= 5.5 ? '#d9a300' : '#d9483b');

// ── peso dei voti (12ª casella delle statistiche) ──────────────────────────
export type WeightView = { off: true } | { off: false; pct: number; fill: number };

export function formWeightView(data: Dataset, p: Player, useForm: boolean, all = seasonStats(data)): WeightView {
  if (!useForm) return { off: true };
  const info = playerRatingAvg(playerSeason(data, p, all));
  const w = formWeight(info.count);
  return { off: false, pct: Math.round(w * 100), fill: Math.round((w / FORM_MAX_WEIGHT) * 100) };
}

/** Spiegazione del peso, mostrata al passaggio del dito/mouse. */
export const formWeightTip = `Peso della media voti nel bilanciamento: 0% con ${FORM_MIN_RATINGS} pagelle, sale fino a ${Math.round(FORM_MAX_WEIGHT * 100)}% con ${FORM_FULL_RATINGS}+`;

// ── grafico e numeri di "📈 Pagelle" ───────────────────────────────────────
export const PG_CHART_MAX = 10; // barre mostrate nel grafico

export interface PagCell {
  label: string;
  value?: string;
  color?: string;
  size?: number;
  /** casella "Forma": i colori degli ultimi risultati (null = nessuno) */
  dots?: string[] | null;
}

export interface PagelleChart {
  W: number;
  H: number;
  grid: Array<{ g: number; y: number; x1: number; x2: number; tx: number }>;
  bars: Array<{ j: number; x: number; y: number; width: number; height: number; fill: string; rating: number; date: string; cx: number }>;
  trend: { x1: number; y1: number; x2: number; y2: number } | null;
  hits: Array<{ j: number; x: number; width: number }>;
  caption: string;
  /** voti nel grafico (per il riquadro che si apre toccando una barra) */
  series: Array<{ date: string; rating: number; matchId: string }>;
}

export type PagelleView =
  | { kind: 'none' }
  | { kind: 'noVotes'; cells: PagCell[] }
  | {
      kind: 'full';
      trend: { arrow: string; label: string; col: string };
      cells: PagCell[];
      chart: PagelleChart;
      /** ultima pagella scritta (titolo o descrizione) e quante ce ne sono */
      last: { tit: string; descPreview: string; date: string; n: number } | null;
    };

const barColor = (v: number) => (v >= 6.5 ? '#3aad5e' : v >= 5.5 ? '#d9a300' : '#d9483b');
const shortD = (d: string) => formatDate(d).slice(0, 5);

/** Numeri e grafico della sezione "📈 Pagelle" di un giocatore (tutto dalle statistiche di stagione). */
export function pagelleView(data: Dataset, weights: number[], p: Player, all = seasonStats(data), includeResultsWithoutRatings = false, formDataset: Dataset = data): PagelleView {
  const a = playerSeason(data, p, all);
  if (!a || (!a.rows && !(includeResultsWithoutRatings && a.pres))) return { kind: 'none' };
  const { goals: totGoals, assist: totAssist, autogol: totAutogol, rigori: totRigori, meta: totMeta } = a;
  const matchesPlayed = a.pres || a.rows;
  const goalsPerMatch = matchesPlayed ? totGoals / matchesPlayed : 0;

  const decided = a.w + a.d + a.l;
  const winPct = decided ? Math.round((a.w / decided) * 100) : null;
  const winCol = winPct == null ? 'var(--text3)' : winPct >= 60 ? 'var(--green)' : winPct < 40 ? 'var(--red)' : 'var(--amber)';
  const last5 = a.results.slice(-5);
  const dots = last5.length ? last5.map((x) => (x.res === 'W' ? '#3aad5e' : x.res === 'L' ? '#e05c5c' : '#e0a92e')) : null;
  const winTxt = winPct == null ? '—' : winPct + '%';
  const cell = (label: string, value: string | number, color?: string | null, size?: number): PagCell => ({
    label,
    value: String(value),
    ...(color ? { color } : {}),
    ...(size ? { size } : {}),
  });
  const formCell: PagCell = { label: 'Forma', dots };

  const dated = a.votes.filter((x) => x.date).map((x) => ({ date: x.date, rating: x.v, matchId: x.matchId }));
  if (!dated.length) {
    return {
      kind: 'noVotes',
      cells: [
        cell('Partite', matchesPlayed, null, 14),
        cell('⚽ Gol', totGoals, 'var(--green)'),
        cell('⚽ Gol/P', goalsPerMatch.toFixed(2), 'var(--green)'),
        cell('% Vittorie', winTxt, winCol),
        formCell,
        cell('🙃 AG · 🚀 Meta', `${totAutogol} · ${totMeta}`, null, 14),
      ],
    };
  }

  const sum = dated.reduce((s, r) => s + r.rating, 0);
  const avg = sum / dated.length;
  const max = Math.max(...dated.map((r) => r.rating));
  const min = Math.min(...dated.map((r) => r.rating));
  const ovr = calcOvr(p.stats, weights);
  const delta = avg - ovr;
  const deltaCol = delta > 0.5 ? 'var(--green)' : delta < -0.5 ? 'var(--red)' : 'var(--amber)';
  const deltaSym = delta > 0.3 ? '↑' : delta < -0.3 ? '↓' : '≈';

  // grafico: solo gli ultimi PG_CHART_MAX voti (i numeri sopra restano su tutta la storia)
  const ser = dated.slice(-PG_CHART_MAX);
  const n = ser.length;
  const xsIdx = ser.map((_, j) => j);
  const meanX = xsIdx.reduce((s, v) => s + v, 0) / n;
  const meanY = ser.reduce((s, r) => s + r.rating, 0) / n;
  let num = 0;
  let den = 0;
  xsIdx.forEach((x, j) => {
    num += (x - meanX) * ((ser[j] as { rating: number }).rating - meanY);
    den += (x - meanX) * (x - meanX);
  });
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  const trendStart = intercept;
  const trendEnd = intercept + slope * (n - 1);
  // intestazione: lo stato di forma dell'app (come la figurina); linea tratteggiata: tendenza di lungo periodo
  const fsKey = formState(formDataset, p, formDataset === data ? all : undefined);
  const FS = fsKey ? FORM_STATES[fsKey] : null;
  const trend = { arrow: FS ? FS.arrow : '', label: FS ? FS.label : '', col: FS ? FS.col : 'var(--text3)' };

  const W = 320, H = 56, padL = 22, padR = 10, padT = 10, padB = 3;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  // scala adattata ai voti del giocatore: da poco sotto il minimo (mai sopra 3) a poco sopra il massimo (mai sotto 8, max 10)
  const minV = Math.min(...ser.map((r) => r.rating));
  const maxV = Math.max(...ser.map((r) => r.rating));
  const yMin = Math.max(1, Math.min(3, Math.floor(minV) - 1));
  const yMax = Math.min(10, Math.max(8, Math.ceil(maxV) + 1));
  const yToPx = (v: number) => padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
  const slotW = plotW / n;
  const barW = Math.min(34, slotW * 0.6);

  const grid = [4, 6, 8].filter((g) => g > yMin && g < yMax).map((g) => ({ g, y: yToPx(g), x1: padL, x2: W - padR, tx: padL - 4 }));
  const bars = ser.map((r, j) => {
    const cx = padL + slotW * j + slotW / 2;
    const by = yToPx(r.rating);
    return { j, x: cx - barW / 2, y: by, width: barW, height: padT + plotH - by, fill: barColor(r.rating), rating: r.rating, date: r.date, cx };
  });
  const hits = ser.map((_, j) => ({ j, x: padL + slotW * j, width: slotW }));
  const tx1 = padL + slotW * 0 + slotW / 2;
  const tx2 = padL + slotW * (n - 1) + slotW / 2;
  const ty1 = yToPx(Math.max(yMin, Math.min(yMax, trendStart)));
  const ty2 = yToPx(Math.max(yMin, Math.min(yMax, trendEnd)));
  const trendLine = n >= 2 ? { x1: tx1, y1: ty1, x2: tx2, y2: ty2 } : null;

  const texts = playerPagelleList(data, p).filter((x) => x.hasText || x.tit || x.desc);
  const lp = texts[0];
  const first = ser[0] as { date: string };
  const lastBar = ser[n - 1] as { date: string };
  return {
    kind: 'full',
    trend,
    cells: [
      cell('Media voto', avg.toFixed(2)),
      cell('Partite', matchesPlayed, null, 14),
      cell('vs OVR', `${deltaSym} ${delta.toFixed(1)}`, deltaCol, 14),
      cell('Min · Max', `${min} · ${max}`, null, 13),
      cell('⚽ Gol', totGoals, 'var(--green)'),
      cell('⚽ Gol/P', goalsPerMatch.toFixed(2), 'var(--green)'),
      cell('🅰️ Assist', totAssist, 'var(--green)'),
      cell('% Vittorie', winTxt, winCol),
      formCell,
      cell('🙃 Autogol', totAutogol, totAutogol > 0 ? 'var(--red)' : null),
      cell('❌ Rig. sbagliati', totRigori, totRigori > 0 ? 'var(--red)' : null),
      cell('🚀 Meta', totMeta, totMeta > 0 ? 'var(--amber)' : null),
    ],
    chart: {
      W, H, grid, bars, trend: trendLine, hits,
      caption: `${dated.length > n ? `ultime ${n} · ` : ''}${shortD(first.date)} → ${shortD(lastBar.date)} · ┄ tendenza · tocca una barra`,
      series: ser,
    },
    last: lp
      ? { tit: lp.tit, descPreview: lp.desc.slice(0, 40) + (lp.desc.length > 40 ? '…' : ''), date: shortD(lp.m.date as string), n: texts.length }
      : null,
  };
}
