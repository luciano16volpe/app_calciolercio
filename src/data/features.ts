import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

export type Feature = 'compare' | 'couples' | 'records' | 'statistics' | 'history' | 'albo';
export type FeatureMode = 'standard' | 'premium' | 'beta';
export const FEATURE_LABELS: Record<Feature, string> = {
  compare: 'Confronto', couples: 'Coppie', records: 'Record', statistics: 'Statistiche dettagliate', history: 'Stagioni precedenti', albo: "Albo d'oro",
};
export function useFeatures(userId: string | null) {
  return useQuery({ queryKey: ['feature-modes', userId], enabled: !!userId, staleTime: 0, refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_feature_modes');
      if (error) throw error;
      return data ?? [];
    },
  });
}
export async function setFeatureMode(feature: Feature, mode: FeatureMode) {
  const { error } = await supabase.rpc('admin_set_feature_mode', { p_feature: feature, p_mode: mode });
  if (error) throw error;
}
