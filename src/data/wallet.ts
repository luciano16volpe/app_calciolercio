import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../app/auth';
import { supabase } from './supabase';

export interface WalletState {
  balance: number;
  /** quanto è stato aggiunto con la ricarica settimanale in questa lettura (0 se nulla) */
  topped_up: number;
  first_time: boolean;
  next_topup: string;
}

export interface WalletReceiptEntry {
  element_key: string;
  outcome: 'WON' | 'LOST' | 'VOID';
  weight: number;
  payout: number;
}
export interface WalletMatchReceipt {
  staked: number;
  returned: number;
  paid: number;
  remainder: number;
  settled_at: string;
  mine: WalletReceiptEntry[];
  boldest: { name: string; description: string; weight: number } | null;
  best: { name: string; net: number } | null;
}
export interface WalletStanding {
  position: number;
  user_id: string;
  name: string;
  net: number;
  staked: number;
  won: number;
}

export const walletKey = (leagueId: string, userId?: string) => ['wallet', leagueId, userId] as const;

/** Il conto in dollalerci: al primo accesso 50, poi la ricarica settimanale a 20 per chi ne ha meno. */
export function useWallet(leagueId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: walletKey(leagueId, user?.id),
    enabled: !!user && !!leagueId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('wallet_state', { p_league: leagueId });
      if (error) throw error;
      return data as unknown as WalletState;
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function useWalletMatchReceipt(matchId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['wallet-receipt', user?.id, matchId], enabled: !!user && !!matchId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('wallet_match_receipt', { p_match: matchId });
      if (error) throw error;
      return data as unknown as WalletMatchReceipt | null;
    }, staleTime: 30_000, refetchInterval: 30_000,
  });
}

export function useWalletLeaderboard(leagueId: string, season: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['wallet-leaderboard', user?.id, leagueId, season], enabled: !!user && !!leagueId && !!season,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('wallet_leaderboard', { p_league: leagueId, p_season: season });
      if (error) throw error;
      return (data ?? []) as unknown as WalletStanding[];
    }, staleTime: 30_000, refetchInterval: 30_000,
  });
}
