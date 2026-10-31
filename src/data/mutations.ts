// Scritture su Supabase (solo per chi ha il permesso: lo garantisce il database con le regole RLS, non lo schermo).
import type { RatingRow } from '../domain/matchEdit';
import { supabase } from './supabase';

const fail = (what: string, e: { message: string }) => new Error(`${what}: ${e.message}`);

/** Salva voti, gol, assist e pagelle di una partita. Chi non ha un voto torna senza pagella. */
export async function saveMatchRatings(matchId: string, rows: RatingRow[]): Promise<void> {
  const byPlayer = new Map(rows.map((r) => [r.playerId, r]));
  const { data: current, error } = await supabase.from('match_players').select('player_id').eq('match_id', matchId);
  if (error) throw fail('squadre', error);
  const results = await Promise.all(
    (current ?? []).map((c) => {
      const r = byPlayer.get(c.player_id);
      return supabase
        .from('match_players')
        .update(
          r
            ? { rating: r.rating, goals: r.goals, assist: r.assist, autogol: r.autogol, meta: r.meta, rigori_sbagliati: r.rigoriSbagliati, titolo: r.titolo || null, descrizione: r.notes || null }
            : { rating: null, goals: 0, assist: 0, autogol: 0, meta: 0, rigori_sbagliati: 0, titolo: null, descrizione: null },
        )
        .eq('match_id', matchId)
        .eq('player_id', c.player_id);
    }),
  );
  const bad = results.find((x) => x.error);
  if (bad?.error) throw fail('pagelle', bad.error);
}

/** Risultato e descrizione di una partita ('' = non inserito). */
export async function updateMatchHeader(matchId: string, scoreA: number | '', scoreB: number | '', notes: string): Promise<void> {
  const { error } = await supabase.from('matches').update({ score_a: scoreA === '' ? null : scoreA, score_b: scoreB === '' ? null : scoreB, notes: notes || null }).eq('id', matchId);
  if (error) throw fail('risultato', error);
}

/** Elimina la partita con tutte le sue pagelle (le righe collegate si cancellano da sole). */
export async function deleteMatch(matchId: string): Promise<void> {
  const { error } = await supabase.from('matches').delete().eq('id', matchId);
  if (error) throw fail('eliminazione', error);
}

export interface NewMatch {
  leagueId: string;
  date: string;
  notes: string;
  teamA: string[];
  teamB: string[];
  scoreA: number | '';
  scoreB: number | '';
  /** squilibrio previsto alla creazione (Blu − Bianchi) e quale proposta si gioca (0 = squadre cambiate a mano) */
  pred: number;
  predRank: number;
}

/** Crea la partita con le squadre. Se le squadre non si salvano, la partita appena creata si toglie. */
export async function createMatch(m: NewMatch): Promise<string> {
  const { data, error } = await supabase
    .from('matches')
    .insert({
      league_id: m.leagueId, date: m.date, notes: m.notes || null,
      score_a: m.scoreA === '' ? null : m.scoreA, score_b: m.scoreB === '' ? null : m.scoreB, pred: m.pred, pred_rank: m.predRank,
    })
    .select('id')
    .single();
  if (error || !data) throw fail('partita', error ?? { message: 'nessuna risposta' });
  const rows = [
    ...m.teamA.map((id, i) => ({ match_id: data.id, player_id: id, team: 'A', position: i })),
    ...m.teamB.map((id, i) => ({ match_id: data.id, player_id: id, team: 'B', position: i })),
  ];
  const r = await supabase.from('match_players').insert(rows);
  if (r.error) {
    await supabase.from('matches').delete().eq('id', data.id);
    throw fail('squadre', r.error);
  }
  return data.id;
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

/** Nuovo giocatore nella lega: centrocampista con tutte le statistiche a 5. */
export async function createPlayer(leagueId: string, name: string): Promise<string> {
  const { data, error } = await supabase.from('players').insert({ name, roles: ['MED'], stats: Array(11).fill(5) }).select('id').single();
  if (error || !data) throw fail('giocatore', error ?? { message: 'nessuna risposta' });
  const r = await supabase.from('league_players').insert({ league_id: leagueId, player_id: data.id });
  if (r.error) {
    await supabase.from('players').delete().eq('id', data.id);
    throw fail('rosa', r.error);
  }
  return data.id;
}

/**
 * Cambia o toglie la foto (null = toglie). Il nome del file cambia a ogni foto, così nessuno vede quella vecchia rimasta in memoria.
 * Restituisce il nuovo percorso (o null).
 */
export async function setPlayerPhoto(playerId: string, blob: Blob | null, oldPath: string | null): Promise<string | null> {
  let path: string | null = null;
  if (blob) {
    path = `${playerId}-${Date.now()}.jpg`;
    const up = await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' });
    if (up.error) throw fail('foto', up.error);
  }
  const { error } = await supabase.from('players').update({ photo_path: path }).eq('id', playerId);
  if (error) throw fail('foto', error);
  if (oldPath) await supabase.storage.from('photos').remove([oldPath]); // pulizia: se fallisce non è grave
  return path;
}

/**
 * Carica (o sostituisce) la Gazzetta di una partita: file completo + miniatura. Il nome cambia a ogni caricamento
 * (niente immagine vecchia in memoria); i file della Gazzetta precedente vengono tolti. Restituisce il nuovo percorso.
 */
export async function setGazzetta(leagueId: string, matchId: string, full: Blob, thumb: Blob, oldPath: string | null): Promise<string> {
  const path = `${leagueId}/${matchId}-${Date.now()}.jpg`;
  const bucket = supabase.storage.from('gazzette');
  const up = await bucket.upload(path, full, { contentType: 'image/jpeg' });
  if (up.error) throw fail('Gazzetta', up.error);
  const th = await bucket.upload(path.replace(/\.jpg$/, '-t.jpg'), thumb, { contentType: 'image/jpeg' });
  if (th.error) console.warn('miniatura Gazzetta non salvata', th.error.message); // non grave: si usa il file completo
  const { error } = await supabase.from('gazzette').upsert({ match_id: matchId, file_path: path });
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
