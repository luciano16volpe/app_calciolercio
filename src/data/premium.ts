import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

export const premiumDate = (date: string) => new Intl.DateTimeFormat('it-IT', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Rome',
}).format(new Date(date));

export function useMyPremium(userId: string | null) {
  return useQuery({
    queryKey: ['premium', userId], enabled: !!userId, staleTime: 0, refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_premium_status');
      if (error) throw error;
      return data?.[0] ?? { active: false, expires_at: null };
    },
  });
}

export async function fetchPremiumStatuses() {
  const { data, error } = await supabase.rpc('admin_premium_statuses');
  if (error) throw error;
  return data ?? [];
}

export async function extendPremium(userId: string, months: number) {
  const { error } = await supabase.rpc('admin_extend_premium', { p_user: userId, p_months: months });
  if (error) throw error;
}

export async function endPremium(userId: string) {
  const { error } = await supabase.rpc('admin_end_premium', { p_user: userId });
  if (error) throw error;
}
