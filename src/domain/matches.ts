// Partite: elenco, highlights, testo delle pagelle, equilibrio squadre, Gazzette.
// Qui ci sono solo i calcoli: il disegno è nei componenti.
import { comboMetrics, distribLabel, goalsLabel, goalsLevel, predGoals, balanceScores, type ComboMetrics } from './balancing';
import { formatDate } from './format';
import { seasonOf } from './seasons';
import { mvpPerf, normalizeTeam, playerKey } from './stats';
import { ICONS, STATS, type Dataset, type Match } from './types';

const num = (v: unknown): number | null => {
  const n = parseInt(v as string);
  return isNaN(n) ? null : n;
};

/** Un risultato esiste solo se ci sono entrambi i punteggi (vuoto o mancante = nessun risultato). */
export const hasScore = (m: Pick<Match, 'scoreA' | 'scoreB'>): boolean =>
  m.scoreA !== '' && m.scoreA != null && m.scoreB !== '' && m.scoreB != null;

/** Descrizione della partita giocata con risultato: "A - B" oppure vuoto. */
export const scoreText = (m: Pick<Match, 'scoreA' | 'scoreB'>): string => (hasScore(m) ? `${m.scoreA} - ${m.scoreB}` : '');

// ── elenco ─────────────────────────────────────────────────────────────────
export interface MatchListItem {
  m: Match;
  ratedCount: number;
  /** pagelle con titolo o descrizione */
  descCount: number;
  totalPlayers: number;
}

export interface MatchGroup {
  key: string;
  label: string;
  items: MatchListItem[];
}

const byDateDesc = (a: Match, b: Match) => String(b.date || '').localeCompare(String(a.date || ''));

/** Tutte le partite divise per stagione, le più recenti per prime. */
export function matchListGroups(data: Dataset): MatchGroup[] {
  const sorted = [...data.matches].sort(byDateDesc);
  const groups: MatchGroup[] = [];
  sorted.forEach((m) => {
    const S = seasonOf(m.date) ?? { key: '?', label: 'Senza data' };
    let g = groups.find((x) => x.key === S.key);
    if (!g) groups.push((g = { key: S.key, label: S.label, items: [] }));
    const rs = data.ratings.filter((r) => r.matchId === m.id);
    g.items.push({
      m,
      ratedCount: rs.length,
      descCount: rs.filter((r) => r.hasText || String(r.notes || '').trim() || String(r.titolo || '').trim()).length,
      totalPlayers: (m.teamA?.length || 0) + (m.teamB?.length || 0),
    });
  });
  return groups;
}

/** L'ultima partita per data (null se non ce ne sono). */
export const lastMatch = (data: Dataset): Match | null => ([...data.matches].sort(byDateDesc)[0] ?? null);

/** Almeno una pagella con titolo o descrizione. */
export const matchHasDesc = (data: Dataset, matchId: string): boolean =>
  data.ratings.some((r) => r.matchId === matchId && (r.hasText || String(r.notes || '').trim() || String(r.titolo || '').trim()));

/**
 * Quanto è «pagellata» una partita: quanti giocatori hanno titolo o descrizione su quanti ne giocano.
 * (Giocatori della partita = quelli in squadra; se la partita non ha squadre, le pagelle che ci sono.)
 */
export function ratingsCoverage(data: Dataset, m: Match): { written: number; total: number } {
  const rs = data.ratings.filter((r) => r.matchId === m.id);
  const written = rs.filter((r) => r.hasText || String(r.notes || '').trim() || String(r.titolo || '').trim()).length;
  const total = (m.teamA?.length || 0) + (m.teamB?.length || 0) || rs.length;
  return { written, total };
}

/** Una partita con risultato «senza pagelle»: meno della METÀ dei giocatori ha titolo o descrizione (non basta che ne manchino un paio). */
export const needsRatings = (data: Dataset, m: Match): boolean => {
  if (!hasScore(m)) return false;
  const { written, total } = ratingsCoverage(data, m);
  return total === 0 || written * 2 < total;
};

/** Partite senza pagelle (meno della metà delle descrizioni), escluse quelle «saltate». Dalla più recente. */
export const pendingRatings = (data: Dataset): Match[] =>
  [...data.matches].filter((m) => !m.ratingsSkipped && needsRatings(data, m)).sort(byDateDesc);

/** Partite che si è scelto di saltare e che hanno ancora meno della metà delle descrizioni. Dalla più recente. */
export const skippedRatings = (data: Dataset): Match[] =>
  [...data.matches].filter((m) => !!m.ratingsSkipped && needsRatings(data, m)).sort(byDateDesc);

// ── Gazzette ───────────────────────────────────────────────────────────────
export interface GazItem {
  matchId: string;
  path: string;
  m: Match;
}

/** Le Gazzette con la loro partita, dalla più recente. `gazzette` = id partita → file. */
export function gazzetteByDate(data: Dataset, gazzette: Record<string, string>): GazItem[] {
  return Object.entries(gazzette)
    .map(([matchId, path]) => ({ matchId, path, m: data.matches.find((x) => x.id === matchId) }))
    .filter((x): x is GazItem => !!x.m)
    .sort((a, b) => String(b.m.date).localeCompare(String(a.m.date)));
}

/** Le Gazzette divise per stagione (archivio). */
export function gazzetteBySeason(items: GazItem[]): Array<{ key: string; label: string; list: GazItem[] }> {
  const groups: Array<{ key: string; label: string; list: GazItem[] }> = [];
  items.forEach((it) => {
    const S = seasonOf(it.m.date) ?? { key: '?', label: 'Senza data' };
    let gr = groups.find((x) => x.key === S.key);
    if (!gr) groups.push((gr = { key: S.key, label: S.label, list: [] }));
    gr.list.push(it);
  });
  return groups;
}

// ── highlights ─────────────────────────────────────────────────────────────
export interface MatchHighlights {
  mvp: { name: string; v: number; perf: number } | null;
  worst: { name: string; v: number; perf: number } | null;
  topScorer: { name: string; g: number } | null;
  topAssist: { name: string; a: number } | null;
  avgA: number | null;
  avgB: number | null;
}

/** MVP, peggiore, capocannoniere, assistman e media voto delle due squadre di una partita. */
export function matchHighlights(data: Dataset, m: Match): MatchHighlights {
  const ratings = data.ratings.filter((r) => r.matchId === m.id);
  const teamA = normalizeTeam(m.teamA);
  const teamB = normalizeTeam(m.teamB);
  const inTeam = (pl: { id: string | null | undefined; name: string | undefined }, team: Array<{ id: string | null; name: string }>) =>
    team.some((t) => (t.id && pl.id && t.id === pl.id) || t.name === pl.name);
  let mvp: MatchHighlights['mvp'] = null;
  let worst: MatchHighlights['worst'] = null;
  let topScorer: MatchHighlights['topScorer'] = null;
  let topAssist: MatchHighlights['topAssist'] = null;
  let sumA = 0, cntA = 0, sumB = 0, cntB = 0;
  ratings.forEach((r) => {
    const { name } = playerKey(data.players, r.playerId, r.player);
    const rt = parseFloat(r.rating as string);
    const g = parseInt(r.goals as string) || 0;
    const ast = parseInt(r.assist as string) || 0;
    if (!isNaN(rt) && rt >= 1) {
      const perf = mvpPerf(r) as number; // stessa formula dell'albo d'oro (Re degli MVP)
      if (!mvp || perf > mvp.perf) mvp = { name, v: rt, perf };
      if (!worst || perf < worst.perf) worst = { name, v: rt, perf };
      const pl = { id: r.playerId, name: r.player };
      if (inTeam(pl, teamA)) {
        sumA += rt;
        cntA++;
      } else if (inTeam(pl, teamB)) {
        sumB += rt;
        cntB++;
      }
    }
    if (g > 0 && (!topScorer || g > topScorer.g)) topScorer = { name, g };
    if (ast > 0 && (!topAssist || ast > topAssist.a)) topAssist = { name, a: ast };
  });
  return { mvp, worst, topScorer, topAssist, avgA: cntA ? sumA / cntA : null, avgB: cntB ? sumB / cntB : null };
}

// ── testo delle pagelle (formato WhatsApp) ─────────────────────────────────
/** Tutte le pagelle di una partita in UN testo, con il formato di WhatsApp (*grassetto*, _corsivo_), da leggere e condividere. */
export function pagelleText(data: Dataset, m: Match, editor?: string): string {
  const ratings = data.ratings.filter((r) => r.matchId === m.id);
  const sa = num(m.scoreA);
  const sb = num(m.scoreB);
  const has = sa != null && sb != null;
  const fmtV = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const rows = (team: Match['teamA']) =>
    normalizeTeam(team)
      .map((pl) => {
        const k = playerKey(data.players, pl.id, pl.name);
        const r = ratings.find((x) => playerKey(data.players, x.playerId, x.player).key === k.key);
        const v = r ? parseFloat(r.rating as string) : NaN;
        return {
          name: k.name,
          v: !isNaN(v) && v >= 1 ? v : null,
          tit: r && r.titolo ? String(r.titolo).trim() : '',
          desc: r && r.notes ? String(r.notes).trim() : '',
          g: r ? parseInt(r.goals as string) || 0 : 0,
          a: r ? parseInt(r.assist as string) || 0 : 0,
          ag: r ? parseInt(r.autogol as string) || 0 : 0,
          rs: r ? parseInt(r.rigoriSbagliati as string) || 0 : 0,
        };
      })
      .sort((x, y) => (y.v ?? -1) - (x.v ?? -1) || x.name.localeCompare(y.name));
  const block = (label: string, team: Match['teamA']) => {
    const out = [label];
    rows(team).forEach((p) => {
      const stats = [p.g ? `⚽${p.g}` : '', p.a ? `🅰️${p.a}` : '', p.ag ? `🙃${p.ag}` : '', p.rs ? `❌${p.rs}` : ''].filter(Boolean).join(' ');
      out.push('', `*${p.name}${p.v != null ? ' ' + fmtV(p.v) : ''}*${p.tit ? ` — _«${p.tit}»_` : ''}${stats ? `  (${stats})` : ''}`);
      if (p.desc) out.push(p.desc);
    });
    return out.join('\n');
  };
  const h = matchHighlights(data, m);
  const head = [`📰 *LE PAGELLE DI CALCIOLERCIO*`, `📅 ${formatDate(m.date)}`];
  if (has) head.push(`🔵 Blu *${sa} – ${sb}* Bianchi ⚪ · ${sa === sb ? 'Pareggio' : (sa as number) > (sb as number) ? 'Vince Blu' : 'Vince Bianchi'}`);
  if (String(m.notes || '').trim()) head.push(`_${String(m.notes).trim()}_`);
  const foot: string[] = [];
  if (h.mvp) foot.push(`⭐ MVP: *${h.mvp.name}*`);
  if (h.worst && (!h.mvp || h.worst.name !== h.mvp.name)) foot.push(`🥴 Peggiore: *${h.worst.name}*`);
  return [head.join('\n'), block('🔵 *BLU*', m.teamA), block('⚪ *BIANCHI*', m.teamB), (editor ? [...foot, '', `✒️ _a cura della Redazione ${editor}_`] : foot).join('\n')].join('\n\n');
}

// ── equilibrio squadre di una partita salvata ──────────────────────────────
export interface StatCompareRow {
  /** icona e nome della statistica */
  label: string;
  a: number;
  b: number;
}

/** Media di ognuna delle 11 statistiche per le due squadre (indici nella rosa). */
export function statAverages(players: Array<{ stats: number[] }>, tA: number[], tB: number[]): StatCompareRow[] {
  return STATS.map((s, j) => ({
    label: `${ICONS[j]} ${s}`,
    a: tA.reduce((sum, i) => sum + ((players[i] as { stats: number[] }).stats[j] as number), 0) / tA.length,
    b: tB.reduce((sum, i) => sum + ((players[i] as { stats: number[] }).stats[j] as number), 0) / tB.length,
  }));
}

/** Confronto tra la previsione e il risultato. */
export interface BalanceVerdict {
  result: string;
  how: string;
  err: string;
}

export type MatchBalance =
  | { kind: 'unavailable' }
  | {
      kind: 'ok';
      /** giocatori della partita non più in rosa (esclusi dal calcolo) */
      missing: number;
      c: ComboMetrics;
      /** squilibrio con i valori di oggi (Blu − Bianchi) */
      now: number;
      /** squilibrio salvato alla creazione, se c'è */
      saved: number | null;
      rankTxt: string;
      /** confronto col risultato, se la partita è stata giocata */
      verdict: BalanceVerdict | null;
      stats: StatCompareRow[];
      distribLabel: string;
      pills: { saved: PillView | null; now: PillView };
    };

export interface PillView {
  level: 'ok' | 'warn' | 'bad';
  text: string;
  sub: string;
}

/** "Equilibrio squadre": previsione salvata, calcolo con i valori di oggi, confronto col risultato, 11 statistiche. */
export function matchBalance(data: Dataset, weights: number[], m: Match, useForm = true): MatchBalance {
  const { players } = data;
  const toIdx = (team: Match['teamA']) =>
    normalizeTeam(team).map((pl) => {
      const k = playerKey(players, pl.id, pl.name).key;
      return players.findIndex((p) => playerKey(players, p.id, p.name).key === k);
    });
  const rawA = toIdx(m.teamA);
  const rawB = toIdx(m.teamB);
  const ia = rawA.filter((i) => i >= 0);
  const ib = rawB.filter((i) => i >= 0);
  const missing = rawA.length + rawB.length - ia.length - ib.length;
  if (!ia.length || !ib.length) return { kind: 'unavailable' };
  const scores = balanceScores(data, weights, useForm);
  const c = comboMetrics({ players, scores }, ia, ib);
  const now = c.sA - c.sB;
  const predRaw = (m as { pred?: unknown }).pred;
  const saved = predRaw != null && predRaw !== '' && !isNaN(Number(predRaw)) ? Number(predRaw) : null;
  const rankRaw = (m as { predRank?: unknown }).predRank;
  const rank = rankRaw != null && rankRaw !== '' ? Number(rankRaw) : null;
  const rankTxt = rank == null ? '' : rank === 0 ? 'squadre modificate a mano' : rank === 1 ? '1ª proposta del generatore' : `${rank}ª proposta del generatore`;
  const pill = (pred: number, sub: string): PillView => ({ level: goalsLevel(pred), text: goalsLabel(pred), sub });

  const sa = parseInt(m.scoreA as string);
  const sb = parseInt(m.scoreB as string);
  const has = !isNaN(sa) && !isNaN(sb);
  let verdict: BalanceVerdict | null = null;
  if (has) {
    const ref = saved != null ? saved : now;
    const g = predGoals(ref);
    const gd = sa - sb;
    const res = gd === 0 ? 'pareggio' : `${gd > 0 ? 'Blu' : 'Bianchi'} +${Math.abs(gd)}`;
    const how =
      Math.abs(g) < 0.5
        ? Math.abs(gd) <= 2
          ? '✓ prevista alla pari, ed è stata equilibrata'
          : '✗ prevista alla pari, ma è finita con uno scarto largo'
        : gd === 0
          ? '≈ finita pari'
          : Math.sign(gd) === Math.sign(g)
            ? '✓ ha vinto la squadra favorita'
            : '✗ ha vinto la squadra sfavorita';
    verdict = { result: `${sa} - ${sb} · ${res}`, how, err: Math.abs(gd - g).toFixed(1) };
  }
  return {
    kind: 'ok',
    missing,
    c,
    now,
    saved,
    rankTxt,
    verdict,
    stats: statAverages(players, ia, ib),
    distribLabel: distribLabel(c.distrib),
    pills: {
      saved: saved != null ? pill(saved, 'diff ' + Math.abs(saved).toFixed(2)) : null,
      now: pill(now, 'diff ' + c.diff.toFixed(2)),
    },
  };
}

/** Colore del voto nei riquadri del voto (rateColor): < 5,5 rosso · < 6,5 giallo · altrimenti verde · vuoto neutro (stessi limiti del badge PAG). */
export function rateColors(v: unknown): { background: string; color: string; borderColor: string } {
  const n = parseFloat(v as string);
  if (isNaN(n)) return { background: 'var(--gray)', color: 'var(--text)', borderColor: 'var(--gray3)' };
  if (n < 5.5) return { background: '#fde8e8', color: '#a82020', borderColor: '#e05c5c' };
  if (n < 6.5) return { background: '#fff4d6', color: '#7a4a00', borderColor: '#c4a040' };
  return { background: '#e4f7ec', color: '#1a5a2a', borderColor: '#3aad5e' };
}
