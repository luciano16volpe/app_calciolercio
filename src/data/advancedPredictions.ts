import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../app/auth';
import { supabase } from './supabase';
import type { Difficulty, Evaluation } from '../domain/advancedPredictions';

export interface AdvancedAssignment {
  id: string; template_id: number; template_code: string; category: string; description: string;
  difficulty: Difficulty; weight: number; estimated_probability: number | null; historical_sample_size: number;
  estimation_method: 'INDIVIDUAL' | 'LEAGUE' | 'DEFAULT'; status: 'AVAILABLE' | 'SELECTED' | 'PENDING' | 'WON' | 'LOST' | 'VOID' | 'EXPIRED';
  selected_at: string | null; target_player_id: string; parameters_snapshot: Record<string, number>;
  target_name?: string; photo_path?: string | null; result?: { outcome: Evaluation; points_units: number; reason: string; observed_values: Record<string, number | null> } | null;
}
export interface AdvancedBoard { matchId: string; assignments: AdvancedAssignment[]; replacedCount?:number; summary?: {
  selected_count: number; won_count: number; lost_count: number; void_count: number;
  positive_units: number; negative_units: number; base_units: number; multiplier_basis_points: number;
  bonus_units: number; final_units: number;
} | null; isOpen?: boolean; ready?: boolean }

export function useAdvancedEnabled(leagueId: string) {
  const { user } = useAuth();
  return useQuery({ queryKey: ['advanced-predictions-enabled',user?.id,leagueId],enabled:!!user&&!!leagueId,
    queryFn:async()=>{const {data,error}=await supabase.rpc('advanced_prediction_enabled',{p_league:leagueId});if(error)throw error;return !!data;},
    staleTime:60_000,retry:false });
}
export async function setAdvancedEnabled(leagueId:string,enabled:boolean){
  const {error}=await supabase.rpc('advanced_prediction_set_enabled',{p_league:leagueId,p_enabled:enabled});
  if(error)throw error;
}
export const advancedBoardKey=(userId:string|undefined,matchId:string)=>['advanced-predictions-board',userId,matchId] as const;
export function useAdvancedBoard(matchId:string,enabled=true) {
  const { user } = useAuth();
  return useQuery({queryKey:advancedBoardKey(user?.id,matchId),enabled:enabled&&!!user&&!!matchId,
    queryFn:async()=>{const {data,error}=await supabase.functions.invoke<AdvancedBoard>('advanced-predictions',{body:{action:'board',matchId}});
      if(error)throw error;if(!data)throw new Error('Nessun pronostico disponibile');return data;},
    staleTime:30_000,retry:false});
}
export async function selectAdvancedPrediction(assignmentId:string,selected:boolean){
  const {error}=await supabase.rpc('advanced_prediction_select',{p_assignment:assignmentId,p_selected:selected});
  if(error)throw error;
}
export async function confirmAdvancedStats(matchId:string){
  const {error}=await supabase.rpc('advanced_prediction_confirm_stats',{p_match:matchId});
  if(error)throw error;
}
export interface AdvancedStanding {
  position:number;player_id:string;name:string;photo_path:string|null;selected_count:number;won_count:number;
  lost_count:number;void_count:number;positive_units:number;negative_units:number;base_units:number;
  bonus_units:number;final_units:number;played_matches:number;best_match_units:number;last_match_units:number;
  average_difficulty:number|null;accuracy:number;oracle_wins:number;strong_matches:number;received_count:number;
}
export interface AdvancedStats {
  received:number;selected:number;won:number;lost:number;void:number;weighted_accuracy:number|null;
  average_difficulty:number|null;categories:Record<string,{validated:number;won:number;net_units:number}>;
  difficulties:Record<string,{validated:number;won:number;net_units:number}>;
  matches:Array<{selected:number;won:number;lost:number;final_units:number;multiplier_basis_points:number}>;
}
export function useAdvancedLeaderboard(leagueId:string,season:string,kind:string,enabled=true){
  const {user}=useAuth();
  return useQuery({queryKey:['advanced-leaderboard',user?.id,leagueId,season,kind],enabled:enabled&&!!user&&!!leagueId&&!!season,
    queryFn:async()=>{const {data,error}=await supabase.rpc('advanced_prediction_leaderboard',
      {p_league:leagueId,p_season:season,p_kind:kind,p_limit:50,p_offset:0});
      if(error)throw error;return (data??[]) as unknown as AdvancedStanding[];},staleTime:30_000,retry:false});
}
export function useAdvancedStats(leagueId:string,season:string,enabled=true){
  const {user}=useAuth();
  return useQuery({queryKey:['advanced-stats',user?.id,leagueId,season],enabled:enabled&&!!user&&!!leagueId&&!!season,
    queryFn:async()=>{const {data,error}=await supabase.rpc('advanced_prediction_my_stats',{p_league:leagueId,p_season:season});
      if(error)throw error;return (data??{}) as unknown as AdvancedStats;},staleTime:30_000,retry:false});
}
export interface AdminPredictionResult { predictor:string;target:string;description:string;difficulty:Difficulty;outcome:Evaluation|null;points_units:number|null }
export function useAdvancedAdminResults(matchId:string,enabled=true){
  const {user}=useAuth();
  return useQuery({queryKey:['advanced-admin-results',user?.id,matchId],enabled:enabled&&!!user&&!!matchId,
    queryFn:async()=>{const {data,error}=await supabase.rpc('advanced_prediction_admin_results',{p_match:matchId});
      if(error)throw error;return (data??[]) as unknown as AdminPredictionResult[];},staleTime:30_000,retry:false});
}
export interface AdvancedParticipation { count:number; players:Array<{player_id:string;name:string}> }
export function useAdvancedParticipation(matchId:string,enabled=true){
  const {user}=useAuth();
  return useQuery({queryKey:['advanced-admin-participation',user?.id,matchId],enabled:enabled&&!!user&&!!matchId,
    queryFn:async()=>{const {data,error}=await supabase.rpc('advanced_prediction_admin_participation',{p_match:matchId});
      if(error)throw error;return data as unknown as AdvancedParticipation;},staleTime:30_000,retry:false});
}
export interface AdvancedBalance { by_difficulty:Array<{difficulty:Difficulty;assigned:number;selected:number;won:number;lost:number;void:number}>;
  by_template:Array<{template_id:number;template_code:string;assigned:number;selected:number;won:number}>;
  default_estimates:number;average_final_units:number|null;multiplied_matches:number }
export function useAdvancedBalance(leagueId:string,season:string,enabled=true){
  const {user}=useAuth();
  return useQuery({queryKey:['advanced-balance',user?.id,leagueId,season],enabled:enabled&&!!user&&!!leagueId&&!!season,
    queryFn:async()=>{const {data,error}=await supabase.rpc('advanced_prediction_balance',{p_league:leagueId,p_season:season});
      if(error)throw error;return data as unknown as AdvancedBalance;},staleTime:30_000,retry:false});
}
export interface AdvancedHistoryRow { assignment_id:string;match_id:string;date:string;season_key:string;category:string;
  difficulty:Difficulty;target_player_id:string;target_name:string;description:string;status:string;
  outcome:Evaluation|null;points_units:number|null;reason:string|null }
export interface AdvancedHistoryFilters { season:string|null;match:string|null;category:string|null;target:string|null;difficulty:string|null;outcome:string|null }
export function useAdvancedHistory(leagueId:string,filters:AdvancedHistoryFilters,offset:number,enabled=true){
  const {user}=useAuth();
  return useQuery({queryKey:['advanced-history',user?.id,leagueId,filters,offset],enabled:enabled&&!!user&&!!leagueId,
    queryFn:async()=>{const {data,error}=await supabase.rpc('advanced_prediction_my_history',
      {p_league:leagueId,p_season:filters.season,p_match:filters.match,p_category:filters.category,
        p_target:filters.target,p_difficulty:filters.difficulty,p_outcome:filters.outcome,p_limit:50,p_offset:offset});
      if(error)throw error;return (data??[]) as unknown as AdvancedHistoryRow[];},staleTime:30_000,retry:false});
}
