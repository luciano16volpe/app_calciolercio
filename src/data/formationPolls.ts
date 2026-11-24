import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../app/auth';
import type { Combo, ComboMetrics, Module } from '../domain/balancing';
import { statAverages } from '../domain/matches';
import type { Player } from '../domain/types';
import { supabase } from './supabase';

export interface FormationOption {
  option_no: number;
  team_a: string[];
  team_b: string[];
  metrics: ComboMetrics;
  stats: Array<{ label: string; a: number; b: number }>;
  module_a: Module | null;
  module_b: Module | null;
  rank: number;
}
export interface FormationPollState {
  match_id: string;
  opened_at: string;
  closes_at: string;
  is_open: boolean;
  is_admin: boolean;
  /** solo l'admin della lega, finché il sondaggio è aperto */
  can_close: boolean;
  closed_early_at: string | null;
  closed_early_by_name: string | null;
  finalized_at: string | null;
  winning_option: number | null;
  has_premium: boolean;
  my_vote: number | null;
  options: FormationOption[];
}
export interface FormationPollListItem { match_id: string; date: string; closes_at: string }
export interface FormationPollVotes {
  total: number;
  options: Array<{ option_no: number; voters: Array<{ user_id: string; name: string; updated_at: string }> }>;
}

export function snapshotFormation(c: Combo, players: Player[], rank: number): Omit<FormationOption, 'option_no'> {
  const { tA, tB, modA, modB, custom: _custom, ...metrics } = c;
  void _custom;
  return {
    team_a: tA.map((i) => players[i]!.id), team_b: tB.map((i) => players[i]!.id),
    metrics, stats: statAverages(players, tA, tB), module_a: modA ?? null, module_b: modB ?? null, rank,
  };
}

export const formationPollListKey = (leagueId: string, userId?: string) => ['formation-polls', leagueId, userId] as const;
export const formationPollStateKey = (matchId: string, userId?: string) => ['formation-poll', matchId, userId] as const;
export const formationPollVotesKey = (matchId: string, userId?: string) => ['formation-poll-votes', matchId, userId] as const;

export function useFormationPollVotes(matchId: string, enabled: boolean) {
  const { user } = useAuth();
  return useQuery({ queryKey: formationPollVotesKey(matchId, user?.id), enabled: !!user && !!matchId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('formation_poll_votes', { p_match: matchId });
      if (error) throw error;
      return data as unknown as FormationPollVotes;
    }, staleTime: 0, refetchInterval: enabled ? 15_000 : false });
}

export function useFormationPolls(leagueId: string) {
  const { user } = useAuth();
  return useQuery({ queryKey: formationPollListKey(leagueId, user?.id), enabled: !!user && !!leagueId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('formation_poll_list', { p_league: leagueId });
      if (error) throw error;
      return data as unknown as FormationPollListItem[];
    }, staleTime: 0, refetchInterval: 30_000 });
}

export function useFormationPollState(matchId: string, enabled = true) {
  const { user } = useAuth();
  return useQuery({ queryKey: formationPollStateKey(matchId, user?.id), enabled: !!user && !!matchId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('formation_poll_state', { p_match: matchId });
      if (error) throw error;
      return data as FormationPollState | null;
    }, staleTime: 0, refetchInterval: 30_000 });
}

/** Chiude subito il sondaggio e salva la formazione definitiva (solo admin). Un secondo tocco non fa nulla. */
export async function closeFormationPoll(matchId: string): Promise<void> {
  const { error } = await supabase.rpc('close_formation_poll', { p_match: matchId });
  if (error) throw error;
}

export async function submitFormationVote(matchId: string, option: number): Promise<void> {
  const { error } = await supabase.rpc('submit_formation_vote', { p_match: matchId, p_option: option });
  if (error) throw error;
}
