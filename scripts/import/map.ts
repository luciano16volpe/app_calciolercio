// Traduzione dei dati dell'app attuale (script Google + rosa_calcetto.json) nelle righe del database.
// Solo calcoli, niente rete: così si può provare con i dati veri senza scrivere nulla.
import type { Database } from '../../src/data/types';

type Tables = Database['public']['Tables'];
export type PlayerInsert = Tables['players']['Insert'];
export type MatchInsert = Tables['matches']['Insert'];
export type MatchPlayerInsert = Tables['match_players']['Insert'];
export type AlboInsert = Tables['albo']['Insert'];

// ── forma dei dati attuali ─────────────────────────────────────────────────
export interface LegacyPlayer {
  id: string;
  name: string;
  roles?: string[];
  stats: number[];
  photo?: string; // "data:image/jpeg;base64,…"
  aliases?: string[];
}
export interface LegacyRosa {
  players: LegacyPlayer[];
  weights: number[];
}
export type LegacyTeamEntry = string | { id?: string | null; name?: string };
export interface LegacyMatch {
  id: string;
  date: unknown;
  notes?: string;
  teamA?: LegacyTeamEntry[];
  teamB?: LegacyTeamEntry[];
  scoreA?: unknown;
  scoreB?: unknown;
  pred?: number | null;
  predRank?: number | null;
}
export interface LegacyRating {
  matchId: string;
  player?: string;
  playerId?: string;
  rating?: unknown;
  notes?: string;
  goals?: unknown;
  autogol?: unknown;
  meta?: unknown;
  assist?: unknown;
  rigoriSbagliati?: unknown;
  titolo?: string;
}
export interface LegacyAlboRow {
  stagione?: string;
  chiave?: string;
  dal?: string;
  al?: string;
  stato?: string;
  premio?: string;
  titolo?: string;
  giocatore?: string;
  valore?: string;
  aggiornato?: string;
}
export interface LegacyGazzetta {
  matchId: string;
  data?: string;
  fileId: string;
  url?: string;
  nome?: string;
  caricata?: string;
}
export interface LegacyFeed {
  matches: LegacyMatch[];
  ratings: LegacyRating[];
  albo: LegacyAlboRow[];
  gazzette: LegacyGazzetta[];
}

/** Cose che non tornano nei dati: l'importazione vera si ferma se ce ne sono. */
export type Issue = string;

// ── date ───────────────────────────────────────────────────────────────────
const romeFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });

/**
 * Data della partita come giorno italiano (aaaa-mm-gg). Il foglio Google restituisce le date come istanti in UTC
 * ("2026-06-16T22:00:00.000Z" = 17 giugno, ora italiana): vanno riportate all'ora di Roma, altrimenti
 * ogni partita slitta di un giorno. Le date già "aaaa-mm-gg" restano com'è.
 */
export function romeDate(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = Date.parse(s);
  if (!s || isNaN(t)) return null;
  return romeFmt.format(new Date(t));
}

// ── helpers ────────────────────────────────────────────────────────────────
const int = (v: unknown): number => parseInt(v as string) || 0;
const intOrNull = (v: unknown): number | null => {
  const n = parseInt(v as string);
  return isNaN(n) ? null : n;
};
const textOrNull = (v: unknown): string | null => {
  const s = String(v ?? '');
  return s.trim() ? s : null;
};

// ── giocatori ──────────────────────────────────────────────────────────────
/** Riga `players` (senza la foto, che si carica a parte). `legacy_id` = id della vecchia app. */
export function mapPlayers(rosa: LegacyRosa): PlayerInsert[] {
  return rosa.players.map((p) => {
    const id = playerUuid(p.id);
    return {
      ...(id ? { id } : {}),
      legacy_id: p.id,
      name: p.name,
      roles: p.roles ?? [],
      stats: p.stats,
    };
  });
}

/**
 * Id del giocatore nel database. Gli id della vecchia app sono "p_" + un UUID: si usa quell'UUID, così
 * l'ordine tra i giocatori resta identico (da quell'ordine dipende, per esempio, come si scrivono i due nomi
 * della Coppia d'oro). Per id di altro formato: nessuno, lo assegna il database.
 */
export function playerUuid(legacyId: string): string | undefined {
  const m = legacyId.match(/^p_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return m ? (m[1] as string).toLowerCase() : undefined;
}

/** Foto di un giocatore: tipo e contenuto dal "data:image/jpeg;base64,…". Senza foto → null. */
export function parsePhoto(dataUrl: string | undefined): { mime: string; bytes: Buffer } | null {
  const m = String(dataUrl ?? '').match(/^data:(image\/[a-z+.-]+);base64,(.+)$/i);
  if (!m) return null;
  return { mime: m[1] as string, bytes: Buffer.from(m[2] as string, 'base64') };
}

// ── partite e squadre ──────────────────────────────────────────────────────
/** Riga `matches` (senza id: lo assegna il database; si ritrova con `legacy_id`). */
export function mapMatches(feed: LegacyFeed, leagueId: string): { rows: MatchInsert[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const rows: MatchInsert[] = [];
  const seen = new Set<string>();
  for (const m of feed.matches) {
    const date = romeDate(m.date);
    if (!date) {
      issues.push(`partita ${m.id}: data non leggibile (${JSON.stringify(m.date)})`);
      continue;
    }
    if (seen.has(m.id)) {
      issues.push(`partita ${m.id}: compare due volte`);
      continue;
    }
    seen.add(m.id);
    const sa = intOrNull(m.scoreA);
    const sb = intOrNull(m.scoreB);
    // un risultato a metà (solo un punteggio) non ha senso: si tiene vuoto e si segnala
    if ((sa == null) !== (sb == null)) issues.push(`partita ${m.id}: risultato incompleto (${m.scoreA}-${m.scoreB})`);
    rows.push({
      legacy_id: m.id,
      league_id: leagueId,
      date,
      notes: textOrNull(m.notes),
      score_a: sa != null && sb != null ? sa : null,
      score_b: sa != null && sb != null ? sb : null,
      pred: m.pred ?? null,
      pred_rank: m.predRank ?? null,
    });
  }
  return { rows, issues };
}

/**
 * Riga `match_players`: chi ha giocato (squadra e posto) con la sua pagella.
 * `playerIdOf` / `matchIdOf`: dal id della vecchia app all'id nel database.
 */
export function mapMatchPlayers(
  feed: LegacyFeed,
  rosa: LegacyRosa,
  matchIdOf: (legacyId: string) => string | undefined,
  playerIdOf: (legacyId: string) => string | undefined,
): { rows: MatchPlayerInsert[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const byId = new Map(rosa.players.map((p) => [p.id, p]));
  const byName = new Map(rosa.players.map((p) => [p.name, p]));
  const resolve = (e: LegacyTeamEntry) => {
    const id = typeof e === 'string' ? null : e.id;
    const name = typeof e === 'string' ? e : (e.name ?? '');
    return (id ? byId.get(id) : undefined) ?? byName.get(name);
  };

  const rows = new Map<string, MatchPlayerInsert>(); // chiave: partita|giocatore
  const matchesWithRows = new Set<string>();
  for (const m of feed.matches) {
    const matchId = matchIdOf(m.id);
    if (!matchId) continue; // partita scartata (es. data illeggibile): già segnalata
    matchesWithRows.add(m.id);
    const teams: Array<['A' | 'B', LegacyTeamEntry[]]> = [['A', m.teamA ?? []], ['B', m.teamB ?? []]];
    for (const [team, list] of teams) {
      list.forEach((e, position) => {
        const p = resolve(e);
        if (!p) {
          issues.push(`partita ${m.id}: "${typeof e === 'string' ? e : e.name}" non è in rosa`);
          return;
        }
        const playerId = playerIdOf(p.id);
        if (!playerId) {
          issues.push(`partita ${m.id}: giocatore ${p.name} senza id nel database`);
          return;
        }
        const key = matchId + '|' + playerId;
        const prev = rows.get(key);
        if (prev) {
          issues.push(`partita ${m.id}: ${p.name} compare ${prev.team === team ? 'due volte nella stessa squadra' : 'in entrambe le squadre'}`);
          return;
        }
        rows.set(key, {
          match_id: matchId, player_id: playerId, team, position,
          rating: null, goals: 0, assist: 0, autogol: 0, meta: 0, rigori_sbagliati: 0, titolo: null, descrizione: null,
        });
      });
    }
  }

  const ratingSeen = new Set<string>();
  for (const r of feed.ratings) {
    if (!matchesWithRows.has(r.matchId)) {
      issues.push(`pagella di ${r.player ?? r.playerId}: la partita ${r.matchId} non esiste`);
      continue;
    }
    const p = (r.playerId ? byId.get(r.playerId) : undefined) ?? (r.player ? byName.get(r.player) : undefined);
    const matchId = matchIdOf(r.matchId) as string;
    const playerId = p ? playerIdOf(p.id) : undefined;
    const row = playerId ? rows.get(matchId + '|' + playerId) : undefined;
    if (!p || !row) {
      issues.push(`pagella di ${r.player ?? r.playerId} (partita ${r.matchId}): il giocatore non è in nessuna squadra`);
      continue;
    }
    const k = r.matchId + '|' + p.id;
    if (ratingSeen.has(k)) issues.push(`pagella di ${p.name} (partita ${r.matchId}): compare due volte, vale l'ultima`);
    ratingSeen.add(k);
    const v = parseFloat(r.rating as string);
    row.rating = !isNaN(v) && v >= 1 && v <= 10 ? v : null; // 0 o vuoto = senza voto
    row.goals = int(r.goals);
    row.assist = int(r.assist);
    row.autogol = int(r.autogol);
    row.meta = int(r.meta);
    row.rigori_sbagliati = int(r.rigoriSbagliati);
    row.titolo = textOrNull(r.titolo);
    row.descrizione = textOrNull(r.notes);
  }
  return { rows: [...rows.values()], issues };
}

// ── albo d'oro ─────────────────────────────────────────────────────────────
/** Riga `albo`: una per stagione, con tutte le righe dei premi così come sono nel foglio. */
export function mapAlbo(feed: LegacyFeed, leagueId: string): { rows: AlboInsert[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const by = new Map<string, LegacyAlboRow[]>();
  for (const r of feed.albo) {
    if (!r.chiave) continue;
    (by.get(r.chiave) ?? by.set(r.chiave, []).get(r.chiave)!).push(r);
  }
  const rows: AlboInsert[] = [];
  for (const [key, list] of by) {
    // stato della stagione: "in corso" nel foglio = "aperta" nel database
    const stati = new Set(list.map((r) => r.stato));
    if (stati.size > 1) issues.push(`albo ${key}: stati diversi tra le righe (${[...stati].join(', ')})`);
    const s = list[0]?.stato;
    rows.push({
      league_id: leagueId,
      season_key: key,
      status: s === 'in corso' || !s ? 'aperta' : s,
      rows: list as unknown as AlboInsert['rows'],
    });
  }
  return { rows, issues };
}

// ── riepilogo ──────────────────────────────────────────────────────────────
/** Numeri da mostrare prima di scrivere. */
export function summarize(rosa: LegacyRosa, feed: LegacyFeed) {
  return {
    giocatori: rosa.players.length,
    conFoto: rosa.players.filter((p) => parsePhoto(p.photo)).length,
    soprannomi: rosa.players.reduce((n, p) => n + (p.aliases?.length ?? 0), 0),
    partite: feed.matches.length,
    pagelle: feed.ratings.length,
    pagelleConTitolo: feed.ratings.filter((r) => String(r.titolo ?? '').trim()).length,
    pagelleConDescrizione: feed.ratings.filter((r) => String(r.notes ?? '').trim()).length,
    righeAlbo: feed.albo.length,
    gazzette: feed.gazzette.length,
  };
}

/** Controlla i dati senza scrivere: stessi passaggi dell'importazione, con id finti. */
export function check(rosa: LegacyRosa, feed: LegacyFeed): { issues: Issue[]; counts: Record<string, number> } {
  const fakeLeague = 'lega';
  const m = mapMatches(feed, fakeLeague);
  const matchId = new Map(m.rows.map((r) => [r.legacy_id as string, 'm:' + r.legacy_id]));
  const playerId = new Map(rosa.players.map((p) => [p.id, 'p:' + p.id]));
  const mp = mapMatchPlayers(feed, rosa, (id) => matchId.get(id), (id) => playerId.get(id));
  const al = mapAlbo(feed, fakeLeague);
  const gaz = feed.gazzette.filter((g) => !matchId.has(g.matchId)).map((g) => `Gazzetta della partita ${g.matchId}: la partita non esiste`);
  return {
    issues: [...m.issues, ...mp.issues, ...al.issues, ...gaz],
    counts: { partite: m.rows.length, 'squadre+pagelle': mp.rows.length, 'stagioni albo': al.rows.length },
  };
}
