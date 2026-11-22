import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../app/auth';
import { supabase } from './supabase';
import type { Json } from './types';

export interface CommunityVoteState {
  enabled: boolean;
  is_open: boolean;
  finalized: boolean;
  open_until: string | null;
  can_activate: boolean;
  can_vote: boolean;
  /** solo l'admin della lega, finché la votazione è aperta */
  can_close: boolean;
  closed_early_at: string | null;
  closed_early_by_name: string | null;
  has_premium: boolean;
  my_player_id: string | null;
  my_votes: Record<string, number>;
}

export interface CommunityVoteDetail {
  voter_name: string;
  target_name: string;
  rating: number;
}

export interface CommunityVoteProgress {
  eligible: number;
  voted: number;
  remaining: number;
}

export const communityVoteKey = (matchId: string, userId?: string) => ['community-vote', matchId, userId] as const;
export const communityVoteProgressKey = (matchId: string, userId?: string) => ['community-vote-progress', matchId, userId] as const;

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

export function useCommunityVoteProgress(matchId: string, isOpen: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: communityVoteProgressKey(matchId, user?.id),
    enabled: !!user && !!matchId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('community_vote_progress', { p_match: matchId });
      if (error) throw error;
      return data as unknown as CommunityVoteProgress;
    },
    staleTime: 0,
    refetchInterval: isOpen ? 15_000 : false,
  });
}

export async function enableCommunityVoting(matchId: string) {
  const { error } = await supabase.rpc('enable_community_voting', { p_match: matchId });
  if (error) throw error;
}

/** Chiude subito la votazione e pubblica le medie (solo admin). Un secondo tocco non fa nulla. */
export async function closeCommunityVoting(matchId: string) {
  const { error } = await supabase.rpc('close_community_voting', { p_match: matchId });
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
