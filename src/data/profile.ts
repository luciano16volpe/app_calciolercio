// Profilo personale: le partite del mio giocatore in tutte le leghe che posso vedere, e lo storico delle sue statistiche.
import { useQuery } from '@tanstack/react-query';
import type { HistoryEntry, ProfileRow } from '../domain/profile';
import { supabase } from './supabase';

export interface ProfileData {
  rows: ProfileRow[];
  history: HistoryEntry[];
}

const PAGE = 1000;

export async function fetchProfile(playerId: string): Promise<ProfileData> {
  const rows: ProfileRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('match_players')
      .select('match_id, team, rating, goals, assist, matches(date, score_a, score_b, league_id, leagues(name))')
      .eq('player_id', playerId)
      .order('match_id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`partite: ${error.message}`);
    for (const r of data ?? []) {
      const m = r.matches;
      if (!m) continue; // partita di una lega che non vedo
      rows.push({
        matchId: r.match_id, date: m.date, leagueId: m.league_id, leagueName: m.leagues?.name ?? '',
        team: r.team as 'A' | 'B', rating: r.rating, goals: r.goals, assist: r.assist, scoreA: m.score_a, scoreB: m.score_b,
      });
    }
    if (!data || data.length < PAGE) break;
  }
  const h = await supabase
    .from('player_stats_history')
    .select('changed_at, old_stats, new_stats, old_roles, new_roles')
    .eq('player_id', playerId)
    .order('changed_at', { ascending: false })
    .limit(30);
  if (h.error) throw new Error(`storico: ${h.error.message}`);
  const history = (h.data ?? []).map((x): HistoryEntry => ({ at: x.changed_at, oldStats: x.old_stats, newStats: x.new_stats, oldRoles: x.old_roles, newRoles: x.new_roles }));
  return { rows, history };
}

export function useProfile(playerId: string | undefined) {
  return useQuery({ queryKey: ['profile', playerId], queryFn: () => fetchProfile(playerId as string), enabled: !!playerId, staleTime: 60_000 });
}
