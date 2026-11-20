import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../app/auth';
import { supabase } from './supabase';
import type { Json } from './types';

export interface CommunityVoteState {
  enabled: boolean;
  is_open: boolean;
  open_until: string | null;
  can_activate: boolean;
  can_vote: boolean;
  my_player_id: string | null;
  my_votes: Record<string, number>;
}

export interface CommunityVoteDetail {
  voter_name: string;
  target_name: string;
  rating: number;
}

export const communityVoteKey = (matchId: string, userId?: string) => ['community-vote', matchId, userId] as const;

export function useCommunityVoteState(matchId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: communityVoteKey(matchId, user?.id),
    enabled: !!user && !!matchId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('community_vote_state', { p_match: matchId });
      if (error) throw error;
      return data as CommunityVoteState | null;
    },
    staleTime: 0,
    refetchInterval: 60_000,
  });
}

export async function enableCommunityVoting(matchId: string) {
  const { error } = await supabase.rpc('enable_community_voting', { p_match: matchId });
  if (error) throw error;
}

export async function fetchCommunityVoteDetails(matchId: string): Promise<CommunityVoteDetail[]> {
  const { data, error } = await supabase.rpc('community_vote_details', { p_match: matchId });
  if (error) throw error;
  return data as unknown as CommunityVoteDetail[];
}

export async function submitCommunityVotes(matchId: string, votes: { player_id: string; rating: number }[]) {
  const { error } = await supabase.rpc('submit_community_votes', { p_match: matchId, p_votes: votes as Json });
  if (error) throw error;
}
