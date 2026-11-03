// Panchina: i giocatori rimossi dalla lega selezionata, visibili solo ai suoi amministratori.
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from '../app/auth';

export interface BenchPlayer {
  id: string;
  name: string;
  roles: string[];
  photoPath: string | null;
  /** ha un account collegato (il collegamento resta anche in Panchina) */
  linked: boolean;
  /** partite giocate nelle leghe: chi ne ha non si può cancellare */
  matchesPlayed: number;
}

export const BENCH_KEY = ['bench'] as const;

export async function fetchBench(leagueId: string): Promise<BenchPlayer[]> {
  const { data, error } = await supabase.rpc('bench_players', { p_league: leagueId });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.player_id, name: r.name, roles: r.roles ?? [], photoPath: r.photo_path, linked: r.linked, matchesPlayed: Number(r.matches_played),
  }));
}

export function useBench(leagueId: string, enabled: boolean) {
  const { user } = useAuth();
  return useQuery({ queryKey: [...BENCH_KEY, user?.id, leagueId], queryFn: () => fetchBench(leagueId), enabled: enabled && !!user, retry: false, staleTime: 15_000 });
}

/** Toglie il giocatore dalla Rosa e lo archivia nella Panchina della lega. */
export async function removeFromLeague(leagueId: string, playerId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('remove_player_from_league', { p_league: leagueId, p_player: playerId });
  if (error) throw new Error(error.message);
  return data === true;
}

/** Porta in Rosa un giocatore della Panchina. */
export async function addToLeague(leagueId: string, playerId: string): Promise<void> {
  const { error } = await supabase.rpc('add_player_to_league', { p_league: leagueId, p_player: playerId });
  if (error) throw new Error(error.message);
}

/** Cancella per sempre (solo amministratore supremo, solo chi è in Panchina e non ha mai giocato). */
export async function deleteBenchPlayer(playerId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_bench_player', { p_player: playerId });
  if (error) throw new Error(error.message);
}
