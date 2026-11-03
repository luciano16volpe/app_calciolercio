// Collegamento giocatori ↔ account: inviti personali, scollega, unisci giocatori, elenco per l'amministratore.
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

const plain = (e: { message: string }) => new Error(e.message);

export interface PlayerStatus {
  playerId: string;
  name: string;
  linked: boolean;
  linkedName: string;
  inviteToken: string | null;
  inviteCreated: string | null;
  inviteExpires: string | null;
}

export async function fetchPlayersStatus(leagueId: string): Promise<PlayerStatus[]> {
  const { data, error } = await supabase.rpc('league_players_status', { l: leagueId });
  if (error) throw plain(error);
  return (data ?? []).map((r) => ({
    playerId: r.player_id, name: r.name, linked: r.linked, linkedName: r.linked_name ?? '',
    inviteToken: r.invite_token, inviteCreated: r.invite_created, inviteExpires: r.invite_expires,
  }));
}

export const PLAYERS_STATUS_KEY = ['players-status'] as const;

export function usePlayersStatus(leagueId: string | undefined, enabled: boolean) {
  return useQuery({ queryKey: [...PLAYERS_STATUS_KEY, leagueId], queryFn: () => fetchPlayersStatus(leagueId as string), enabled: enabled && !!leagueId, retry: false });
}

/** Crea (o rigenera: il vecchio link smette di funzionare) l'invito personale. Restituisce il codice del link. */
export async function createInvite(playerId: string, leagueId: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_player_invite', { p: playerId, l: leagueId });
  if (error) throw plain(error);
  return data as string;
}

/** Indirizzo da mandare all'amico. */
export const inviteUrl = (token: string): string => `${window.location.origin}/invito/${token}`;

export interface InvitePreview {
  status: 'valid' | 'used' | 'revoked' | 'expired' | 'invalid';
  playerName: string;
  leagueName: string;
}

export async function previewInvite(token: string): Promise<InvitePreview> {
  const { data, error } = await supabase.rpc('invite_preview', { tok: token });
  if (error) throw plain(error);
  const r = data?.[0];
  return { status: (r?.status ?? 'invalid') as InvitePreview['status'], playerName: r?.player_name ?? '', leagueName: r?.league_name ?? '' };
}

export interface Accepted { playerId: string; playerName: string; leagueId: string; leagueName: string; leagueSlug: string }

export async function acceptInvite(token: string): Promise<Accepted> {
  const { data, error } = await supabase.rpc('accept_player_invite', { tok: token });
  if (error) throw plain(error);
  const r = data?.[0];
  if (!r) throw new Error('Link non valido: chiedi un nuovo invito');
  return { playerId: r.player_id, playerName: r.player_name, leagueId: r.league_id, leagueName: r.league_name, leagueSlug: r.league_slug };
}

export async function unlinkPlayer(playerId: string): Promise<void> {
  const { error } = await supabase.rpc('unlink_player', { p: playerId });
  if (error) throw plain(error);
}

export async function mergePlayers(keep: string, drop: string): Promise<void> {
  const { error } = await supabase.rpc('merge_players', { keep, drop_id: drop });
  if (error) throw plain(error);
}

// ── Invito libero: link personale creato con un indirizzo email (nessuna email viene inviata: TODO) ──
export interface LeagueInvite {
  token: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  status: 'valid' | 'used' | 'revoked' | 'expired';
}

export const LEAGUE_INVITES_KEY = ['league-invites'] as const;

export async function fetchLeagueInvites(leagueId: string): Promise<LeagueInvite[]> {
  const { data, error } = await supabase
    .from('league_invites').select('token, email, created_at, expires_at, revoked, used_at')
    .eq('league_id', leagueId).order('created_at', { ascending: false }).limit(30);
  if (error) throw plain(error);
  const now = Date.now();
  return (data ?? []).map((r) => ({
    token: r.token, email: r.email, createdAt: r.created_at, expiresAt: r.expires_at,
    status: r.used_at ? 'used' : r.revoked ? 'revoked' : new Date(r.expires_at).getTime() < now ? 'expired' : 'valid',
  }));
}

export function useLeagueInvites(leagueId: string | undefined, enabled: boolean) {
  return useQuery({ queryKey: [...LEAGUE_INVITES_KEY, leagueId], queryFn: () => fetchLeagueInvites(leagueId as string), enabled: enabled && !!leagueId, retry: false });
}

/** Crea (o rigenera: il vecchio link per lo stesso indirizzo smette di funzionare) il link d'invito. Restituisce il codice. */
export async function createLeagueInvite(leagueId: string, email: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_league_invite', { l: leagueId, p_email: email });
  if (error) throw plain(error);
  return data as string;
}

/** Indirizzo da mandare all'amico (WhatsApp, social…). */
export const leagueInviteUrl = (token: string): string => `${window.location.origin}/unisciti/${token}`;

export async function previewLeagueInvite(token: string): Promise<{ status: InvitePreview['status']; leagueName: string }> {
  const { data, error } = await supabase.rpc('league_invite_preview', { tok: token });
  if (error) throw plain(error);
  const r = data?.[0];
  return { status: (r?.status ?? 'invalid') as InvitePreview['status'], leagueName: r?.league_name ?? '' };
}

/** Giocatori della lega ancora senza account (per «Sono già in Rosa»). */
export async function leagueInvitePlayers(token: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.rpc('league_invite_players', { tok: token });
  if (error) throw plain(error);
  return (data ?? []).map((r) => ({ id: r.player_id, name: r.name }));
}

export interface LeagueJoin extends Accepted { outcome: 'has_player' | 'claim_sent' | 'created' | 'joined' }

/** Entra nella lega; se non si ha un giocatore: o si sceglie uno libero (`player`), o se ne crea uno nuovo (`newPlayer`). */
export async function acceptLeagueInvite(
  token: string, opts: { player?: string; newPlayer?: { name: string; roles: string[]; stats: number[] } } = {},
): Promise<LeagueJoin> {
  const { data, error } = await supabase.rpc('accept_league_invite', {
    tok: token, p_player: opts.player, p_name: opts.newPlayer?.name, p_roles: opts.newPlayer?.roles, p_stats: opts.newPlayer?.stats,
  });
  if (error) throw plain(error);
  const r = data?.[0];
  if (!r) throw new Error('Link non valido: chiedi un nuovo invito');
  return {
    playerId: r.player_id, playerName: r.player_name ?? '', leagueId: r.league_id, leagueName: r.league_name, leagueSlug: r.league_slug,
    outcome: r.outcome as LeagueJoin['outcome'],
  };
}
