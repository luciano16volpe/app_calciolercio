// Scritture su Supabase (solo per chi ha il permesso: lo garantisce il database con le regole RLS, non lo schermo).
import type { RatingRow } from '../domain/matchEdit';
import { plannedSnapshot } from '../domain/plannedMatch';
import type { Match } from '../domain/types';
import { supabase } from './supabase';
import type { FormationOption } from './formationPolls';
import type { Json } from './types';

const fail = (what: string, e: { message: string }) => new Error(`${what}: ${e.message}`);

export async function setMatchBetEnabled(matchId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_match_betting', { p_match: matchId, p_enabled: enabled });
  if (error) throw fail('Bet della partita', error);
}

export async function updatePlannedMatch(original: Match, plan: { date: string; time: string; place: string; lat?: number | null; lng?: number | null; url?: string | null; notes: string; teamA: string[]; teamB: string[] }): Promise<void> {
  const { error } = await supabase.rpc('update_planned_match', {
    p_match: original.id, p_date: plan.date, p_time: plan.time, p_place: plan.place.trim(), p_lat: plan.lat ?? undefined, p_lng: plan.lng ?? undefined, p_url: plan.url ?? undefined, p_notes: plan.notes.trim(),
    p_team_a: plan.teamA, p_team_b: plan.teamB, p_original: plannedSnapshot(original),
  });
  if (error) throw fail('programma partita', error);
}

export interface MatchHeader {
  score_a: number | null;
  score_b: number | null;
  notes: string | null;
  play_time: string | null;
  place: string | null;
  place_lat?: number | null;
  place_lng?: number | null;
  place_url?: string | null;
}

/**
 * Salva voti, gol, assist e testi. Le statistiche possono avere un voto nullo.
 * `untouchedTexts`: giocatori di cui titolo e descrizione non sono stati toccati: non si riscrivono
 * (se nel frattempo la redazione li ha scritti, restano).
 */
export async function saveMatchRatings(matchId: string, rows: RatingRow[], untouchedTexts: Set<string> = new Set(), header?: MatchHeader): Promise<void> {
  const { error } = await supabase.rpc('save_match_ratings', {
    p_match: matchId,
    p_rows: rows.map((r) => ({ player_id: r.playerId, editor_rating: r.editorRating, goals: r.goals, assist: r.assist,
      autogol: r.autogol, meta: r.meta, rigori_sbagliati: r.rigoriSbagliati,
      titolo: r.titolo || null, descrizione: r.notes || null, write_text: !untouchedTexts.has(r.playerId) })),
    ...(header ? { p_header: { ...header } } : {}),
    p_untouched_texts: [...untouchedTexts],
  });
  if (error) throw fail('pagelle', error);
}

/** Redazione: titolo, descrizione e voto goliardico separato da quello ufficiale. */
export async function saveMatchTexts(matchId: string, rows: Array<{ playerId: string; titolo: string; descrizione: string; editorRating: number | null }>): Promise<void> {
  const { error } = await supabase.rpc('save_match_texts', {
    p_match: matchId,
    p_rows: rows.map((r) => ({ player_id: r.playerId, titolo: r.titolo || null, descrizione: r.descrizione || null, editor_rating: r.editorRating })),
  });
  if (error) throw fail('pagelle', error);
}

/** Elimina la partita con tutte le sue pagelle (le righe collegate si cancellano da sole). */
export async function deleteMatch(matchId: string): Promise<void> {
  const { error } = await supabase.from('matches').delete().eq('id', matchId);
  if (error) throw fail('eliminazione', error);
}

export interface NewMatch {
  leagueId: string;
  bettingEnabled: boolean;
  date: string;
  /** ora (hh:mm) e luogo: obbligatori per una partita nuova */
  time: string;
  place: string;
  placeLat?: number | null;
  placeLng?: number | null;
  placeUrl?: string | null;
  notes: string;
  teamA: string[];
  teamB: string[];
  scoreA: number | '';
  scoreB: number | '';
  /** squilibrio previsto alla creazione (Blu − Bianchi) e quale proposta si gioca (0 = squadre cambiate a mano) */
  pred: number;
  predRank: number;
  formationOptions?: Array<Omit<FormationOption, 'option_no'>>;
}

/** Crea partita e squadre in una sola transazione. */
export async function createMatch(m: NewMatch): Promise<string> {
  const header = { league_id: m.leagueId, date: m.date, play_time: m.time || null,
      betting_enabled: m.bettingEnabled,
      place: m.place.trim() || null, place_lat: m.placeLat ?? null, place_lng: m.placeLng ?? null, place_url: m.placeUrl ?? null, notes: m.notes || null,
      score_a: m.scoreA === '' ? null : m.scoreA, score_b: m.scoreB === '' ? null : m.scoreB,
      pred: m.pred, pred_rank: m.predRank };
  const { data, error } = m.formationOptions?.length
    ? await supabase.rpc('create_match_with_formation_poll', { p_match: header, p_options: m.formationOptions as unknown as Json })
    : await supabase.rpc('create_match_with_teams', { p_match: header, p_team_a: m.teamA, p_team_b: m.teamB });
  if (error || !data) throw fail('partita', error ?? { message: 'nessuna risposta' });
  return data;
}

/** Ricorda i soprannomi dei giocatori nella lega (id giocatore → elenco completo dei soprannomi). */
export async function saveAliases(leagueId: string, byPlayer: Map<string, string[]>): Promise<void> {
  const results = await Promise.all([...byPlayer].map(([playerId, aliases]) => supabase.from('league_players').update({ aliases }).eq('league_id', leagueId).eq('player_id', playerId)));
  const bad = results.find((r) => r.error);
  if (bad?.error) throw fail('soprannomi', bad.error);
}

/** Cambia statistiche e/o ruoli di un giocatore (le statistiche nel database sono numeri interi da 0 a 10). */
export async function updatePlayer(id: string, patch: { stats?: number[]; roles?: string[] }): Promise<void> {
  const row: { stats?: number[]; roles?: string[] } = {};
  if (patch.stats) row.stats = patch.stats.map((v) => Math.round(v));
  if (patch.roles) row.roles = patch.roles;
  const { error } = await supabase.from('players').update(row).eq('id', id);
  if (error) throw fail('giocatore', error);
}

export async function adminRenamePlayer(id: string, name: string): Promise<string> {
  const { data, error } = await supabase.rpc('admin_rename_player', { p_player: id, p_name: name });
  if (error) throw fail('nome giocatore', error);
  return data;
}

/** Nuovo giocatore nella lega: centrocampista con tutte le statistiche a 5. */
export async function createPlayer(leagueId: string, name: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_player_in_league', { p_league: leagueId, p_name: name });
  if (error || !data) throw fail('giocatore', error ?? { message: 'nessuna risposta' });
  return data;
}

/**
 * Carica (o sostituisce) la Gazzetta di una partita: file completo + miniatura. Il nome cambia a ogni caricamento
 * (niente immagine vecchia in memoria); i file della Gazzetta precedente vengono tolti. Restituisce il nuovo percorso.
 */
export async function setGazzetta(leagueId: string, matchId: string, full: Blob, thumb: Blob, oldPath: string | null): Promise<string> {
  const path = `${leagueId}/${matchId}-${Date.now()}.jpg`;
  const bucket = supabase.storage.from('gazzette');
  const up = await bucket.upload(path, full, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (up.error) throw fail('Gazzetta', up.error);
  const th = await bucket.upload(path.replace(/\.jpg$/, '-t.jpg'), thumb, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (th.error) console.warn('miniatura Gazzetta non salvata', th.error.message); // non grave: si usa il file completo
  const { error } = await supabase.rpc('publish_gazzetta', { p_match: matchId, p_path: path });
  if (error) {
    await bucket.remove([path, path.replace(/\.jpg$/, '-t.jpg')]);
    throw fail('Gazzetta', error);
  }
  if (oldPath) await bucket.remove([oldPath, oldPath.replace(/\.jpg$/, '-t.jpg')]); // pulizia: se fallisce non è grave
  return path;
}

/** Toglie la Gazzetta di una partita (riga e file). */
export async function removeGazzetta(matchId: string, path: string): Promise<void> {
  const { error } = await supabase.from('gazzette').delete().eq('match_id', matchId);
  if (error) throw fail('Gazzetta', error);
  await supabase.storage.from('gazzette').remove([path, path.replace(/\.jpg$/, '-t.jpg')]);
}

/** Salta (o rimette) le pagelle di una partita: esce dall'elenco «Pagelle da scrivere». Lo fanno amministratore e redazione. */
export async function setRatingsSkipped(matchId: string, skip: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_ratings_skipped', { p_match: matchId, p_skip: skip });
  if (error) throw fail('pagelle saltate', error);
}

/** Salta (o rimette) le pagelle di molte partite in una volta. Restituisce quante partite sono cambiate. */
export async function setRatingsSkippedMany(matchIds: string[], skip: boolean): Promise<number> {
  if (!matchIds.length) return 0;
  const { data, error } = await supabase.rpc('set_ratings_skipped_many', { p_matches: matchIds, p_skip: skip });
  if (error) throw fail('pagelle saltate', error);
  return Number(data ?? 0);
}
