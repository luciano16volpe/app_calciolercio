import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../app/auth';
import { supabase } from './supabase';

export type Outcome = '1' | 'X' | '2';
export interface Prediction { outcome: Outcome; score_a: number | null; score_b: number | null }
export interface BettingEntry extends Prediction { user_id: string; name: string }
export interface BettingMatch {
  match_id: string; date: string; play_time: string | null;
  score_a: number | null; score_b: number | null; is_open: boolean;
  my_prediction: Prediction | null; total: number; entries: BettingEntry[] | null;
}
export interface BettingAdminParticipant { user_id: string; name: string }
export const bettingKey = (leagueId: string, userId?: string) => ['betting', leagueId, userId] as const;
export function useBettingBoard(leagueId: string) {
  const { user } = useAuth();
  return useQuery({ queryKey: bettingKey(leagueId, user?.id), enabled: !!user && !!leagueId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('betting_board', { p_league: leagueId });
      if (error) throw error;
      return data as unknown as BettingMatch[];
    }, staleTime: 0, refetchInterval: 30_000 });
}
export function useBettingAdminParticipation(matchId:string,enabled=true){
  const {user}=useAuth();
  return useQuery({queryKey:['betting-admin-participation',user?.id,matchId],enabled:enabled&&!!user&&!!matchId,
    queryFn:async()=>{const {data,error}=await supabase.rpc('betting_admin_participation',{p_match:matchId});
      if(error)throw error;return (data??[]) as unknown as BettingAdminParticipant[];},staleTime:30_000,retry:false});
}
export async function savePrediction(matchId: string, outcome: Outcome | null, scoreA: number | null, scoreB: number | null) {
  const { error } = await supabase.rpc('save_match_prediction', { p_match: matchId, p_outcome: outcome, p_score_a: scoreA, p_score_b: scoreB });
  if (error) throw error;
}
