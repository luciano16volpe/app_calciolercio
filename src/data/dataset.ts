// Dal database ai dati che usa la logica (src/domain): rosa, partite con le squadre, pagelle.
// Funzione pura: non parla con Supabase, riceve le righe già lette.
import type { Dataset, Match, Player, Rating } from '../domain/types';
import type { Database } from './types';

type Tables = Database['public']['Tables'];

export interface DbRows {
  players: Pick<Tables['players']['Row'], 'id' | 'name' | 'roles' | 'stats'>[];
  matches: Pick<Tables['matches']['Row'], 'id' | 'date' | 'notes' | 'score_a' | 'score_b' | 'pred' | 'pred_rank'>[];
  matchPlayers: Pick<
    Tables['match_players']['Row'],
    'match_id' | 'player_id' | 'team' | 'position' | 'rating' | 'goals' | 'assist' | 'autogol' | 'meta' | 'rigori_sbagliati' | 'titolo' | 'descrizione'
  >[];
}

/**
 * Righe del database → `Dataset`. Le squadre sono in ordine di posto; le pagelle sono quelle dei giocatori
 * che hanno almeno un voto, un gol/assist/… o un titolo/descrizione (come nel foglio Google, dove una pagella
 * esiste solo se è stata compilata); i risultati vuoti restano `null`.
 */
export function dbToDataset(rows: DbRows): Dataset {
  const players: Player[] = rows.players.map((p) => ({
    id: p.id,
    name: p.name,
    roles: p.roles,
    stats: p.stats,
  }));
  const nameOf = new Map(players.map((p) => [p.id, p.name]));

  const mpByMatch = new Map<string, DbRows['matchPlayers']>();
  for (const mp of rows.matchPlayers) (mpByMatch.get(mp.match_id) ?? mpByMatch.set(mp.match_id, []).get(mp.match_id)!).push(mp);

  const matches: Match[] = [];
  const ratings: Rating[] = [];
  // ordine stabile: per data, poi per id
  const sorted = [...rows.matches].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  for (const m of sorted) {
    const list = (mpByMatch.get(m.id) ?? []).slice().sort((a, b) => a.position - b.position);
    const team = (t: string) => list.filter((x) => x.team === t).map((x) => ({ id: x.player_id, name: nameOf.get(x.player_id) ?? '' }));
    matches.push({
      id: m.id,
      date: m.date,
      notes: m.notes ?? '',
      teamA: team('A'),
      teamB: team('B'),
      scoreA: m.score_a,
      scoreB: m.score_b,
      pred: m.pred,
      predRank: m.pred_rank,
    });
    for (const x of list) {
      const hasData = x.rating != null || x.goals || x.assist || x.autogol || x.meta || x.rigori_sbagliati || x.titolo || x.descrizione;
      if (!hasData) continue;
      ratings.push({
        matchId: m.id,
        player: nameOf.get(x.player_id) ?? '',
        playerId: x.player_id,
        rating: x.rating,
        notes: x.descrizione ?? '',
        goals: x.goals,
        autogol: x.autogol,
        meta: x.meta,
        assist: x.assist,
        rigoriSbagliati: x.rigori_sbagliati,
        titolo: x.titolo ?? '',
      });
    }
  }
  return { players, matches, ratings };
}
