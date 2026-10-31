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
