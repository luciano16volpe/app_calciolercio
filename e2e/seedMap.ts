// Dati veri di prova (tests/fixtures/rosa.json e live_feed.json) tradotti nelle righe del database finto delle prove su schermo.
// Solo calcoli, niente rete.
import type { Database } from '../src/data/types';

type Tables = Database['public']['Tables'];
export type PlayerInsert = Tables['players']['Insert'];
export type MatchInsert = Tables['matches']['Insert'];
export type MatchPlayerInsert = Tables['match_players']['Insert'];
export type AlboInsert = Tables['albo']['Insert'];

// ── forma dei dati di prova ─────────────────────────────────────────────────
export interface SeedPlayer {
  id: string;
  name: string;
  roles?: string[];
  stats: number[];
  photo?: string; // "data:image/jpeg;base64,…"
  aliases?: string[];
}
export interface SeedRosa {
  players: SeedPlayer[];
  weights: number[];
}
export type SeedTeamEntry = string | { id?: string | null; name?: string };
export interface SeedMatch {
  id: string;
  date: unknown;
  notes?: string;
  teamA?: SeedTeamEntry[];
  teamB?: SeedTeamEntry[];
  scoreA?: unknown;
  scoreB?: unknown;
  pred?: number | null;
  predRank?: number | null;
}
export interface SeedRating {
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
export interface SeedAlboRow {
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
export interface SeedGazzetta {
  matchId: string;
  data?: string;
  fileId: string;
  url?: string;
  nome?: string;
  caricata?: string;
}
export interface SeedFeed {
  matches: SeedMatch[];
  ratings: SeedRating[];
  albo: SeedAlboRow[];
  gazzette: SeedGazzetta[];
}

/** Cose che non tornano nei dati: . */
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
/** Riga `players` (senza la foto, che si carica a parte). `legacy_id` = id del giocatore nei dati di prova. */
export function mapPlayers(rosa: SeedRosa): PlayerInsert[] {
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
 * Id del giocatore nel database. Gli id dei dati di prova sono "p_" + un UUID: si usa quell'UUID, così
 * l'ordine tra i giocatori resta identico (da quell'ordine dipende, per esempio, come si scrivono i due nomi
 * della Coppia d'oro). Per id di altro formato: nessuno, lo assegna il database.
 */
export function playerUuid(legacyId: string): string | undefined {
  const m = legacyId.match(/^p_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return m ? (m[1] as string).toLowerCase() : undefined;
}

// ── partite e squadre ──────────────────────────────────────────────────────
/** Riga `matches` (senza id: lo assegna il database; si ritrova con `legacy_id`). */
export function mapMatches(feed: SeedFeed, leagueId: string): { rows: MatchInsert[]; issues: Issue[] } {
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
 * `playerIdOf` / `matchIdOf`: dall'id dei dati di prova all'id nel database.
 */
export function mapMatchPlayers(
  feed: SeedFeed,
  rosa: SeedRosa,
  matchIdOf: (legacyId: string) => string | undefined,
  playerIdOf: (legacyId: string) => string | undefined,
): { rows: MatchPlayerInsert[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const byId = new Map(rosa.players.map((p) => [p.id, p]));
  const byName = new Map(rosa.players.map((p) => [p.name, p]));
  const resolve = (e: SeedTeamEntry) => {
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
    const teams: Array<['A' | 'B', SeedTeamEntry[]]> = [['A', m.teamA ?? []], ['B', m.teamB ?? []]];
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
export function mapAlbo(feed: SeedFeed, leagueId: string): { rows: AlboInsert[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const by = new Map<string, SeedAlboRow[]>();
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
