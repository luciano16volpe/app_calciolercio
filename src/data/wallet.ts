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
  });
}
