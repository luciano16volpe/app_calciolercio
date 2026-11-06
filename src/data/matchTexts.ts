import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuth } from '../app/auth';
import { supabase } from './supabase';
import { LEAGUE_QUERY_KEY, type LeagueData } from './queries';
import { withMatchTexts } from '../domain/matchTexts';
export { withMatchTexts } from '../domain/matchTexts';

export function useMatchTexts(data: LeagueData, matchId: string, playerId?: string) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: [...LEAGUE_QUERY_KEY, 'match-texts', user?.id, data.league.id, data.textVersion, matchId, playerId ?? 'all'],
    placeholderData: (previous, previousQuery) => {
      const key = previousQuery?.queryKey;
      return key?.[2] === user?.id && key?.[3] === data.league.id && key?.[5] === matchId && key?.[6] === (playerId ?? 'all') ? previous : undefined;
    },
    enabled: !!user && !!data.textsDeferred && !!matchId,
    queryFn: async () => {
      let request = supabase.from('match_players').select('match_id, player_id, titolo, descrizione').eq('match_id', matchId);
      if (playerId) request = request.eq('player_id', playerId);
      const { data: rows, error } = await request;
      if (error) throw new Error(error.message);
      return rows ?? [];
    }, staleTime: Infinity, gcTime: 10 * 60_000, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const detailed = useMemo(() => query.data ? { ...data, dataset: withMatchTexts(data.dataset, query.data) } : data, [data, query.data]);
  return { ...query, detailed, ready: !data.textsDeferred || query.isSuccess };
}
