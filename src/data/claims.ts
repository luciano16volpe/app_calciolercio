// "Questo sono io": collegare il proprio account al proprio giocatore (richiesta → conferma dell'amministratore).
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

/** Frase da mostrare se la migrazione del passo 4.3 non è ancora stata applicata nel database. */
export const CLAIMS_MIGRATION_HINT = 'Serve aggiornare il database: incolla in Supabase (SQL Editor) il file supabase/migrations/20261102000000_questo_sono_io.sql';
const missing = (msg: string) => /could not find the function|schema cache|PGRST202|PGRST205|does not exist/i.test(msg);
const friendly = (msg: string) => new Error(missing(msg) ? CLAIMS_MIGRATION_HINT : msg);

export interface MyPlayerState {
  /** il giocatore a cui sono collegato */
  linked: { id: string; name: string } | null;
  /** richiesta in attesa (giocatore scelto e lega) */
  pending: { playerId: string; playerName: string; leagueId: string } | null;
  /** richiesta rifiutata più di recente */
  rejected: boolean;
}

export const MY_PLAYER_KEY = ['my-player'] as const;

export async function fetchMyPlayer(userId: string): Promise<MyPlayerState> {
  const linked = await supabase.from('players').select('id, name').eq('user_id', userId).maybeSingle();
  if (linked.error) throw new Error(linked.error.message);
  const claims = await supabase.from('player_claims').select('player_id, league_id, status, created_at, players(name)').eq('user_id', userId).order('created_at', { ascending: false });
  if (claims.error) throw friendly(claims.error.message);
  const rows = claims.data ?? [];
  const pend = rows.find((c) => c.status === 'pending');
  return {
    linked: linked.data ? { id: linked.data.id, name: linked.data.name } : null,
    pending: pend ? { playerId: pend.player_id, playerName: pend.players?.name ?? '', leagueId: pend.league_id } : null,
    rejected: !linked.data && !pend && rows[0]?.status === 'rejected',
  };
}

export function useMyPlayer(userId: string | null) {
  return useQuery({ queryKey: [...MY_PLAYER_KEY, userId], queryFn: () => fetchMyPlayer(userId as string), enabled: !!userId, retry: false });
}

export async function requestClaim(leagueId: string, playerId: string): Promise<void> {
  const { error } = await supabase.rpc('request_claim', { l: leagueId, p: playerId });
  if (error) throw friendly(error.message);
}

export async function unlinkMe(): Promise<void> {
  const { error } = await supabase.rpc('unlink_me');
  if (error) throw friendly(error.message);
}

/** Giocatori della lega non ancora collegati a un account (quelli tra cui scegliere in «Questo sono io»). */
export async function fetchUnclaimed(leagueId: string): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await supabase.rpc('players_unclaimed', { l: leagueId });
  if (error) throw friendly(error.message);
  return (data ?? []).map((p) => ({ id: p.player_id, name: p.name }));
}

export const UNCLAIMED_KEY = ['players-unclaimed'] as const;

export function useUnclaimed(leagueId: string | undefined, enabled: boolean) {
  return useQuery({ queryKey: [...UNCLAIMED_KEY, leagueId], queryFn: () => fetchUnclaimed(leagueId as string), enabled: enabled && !!leagueId, retry: false });
}

export interface PendingClaim {
  id: string;
  playerName: string;
  who: string;
}

export async function fetchPendingClaims(leagueId: string): Promise<PendingClaim[]> {
  const { data, error } = await supabase.rpc('claims_pending', { l: leagueId });
  if (error) throw friendly(error.message);
  return (data ?? []).map((c) => ({ id: c.id, playerName: c.player_name, who: c.display_name || c.email || 'Utente' }));
}

export const CLAIMS_KEY = ['claims-pending'] as const;

export function usePendingClaims(leagueId: string | undefined, enabled: boolean) {
  return useQuery({ queryKey: [...CLAIMS_KEY, leagueId], queryFn: () => fetchPendingClaims(leagueId as string), enabled: enabled && !!leagueId, retry: false });
}

export async function reviewClaim(claimId: string, approve: boolean): Promise<void> {
  const { error } = await supabase.rpc('review_claim', { c: claimId, approve });
  if (error) throw friendly(error.message);
}
