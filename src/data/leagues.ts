// Leghe: le mie leghe, creare, entrare con il codice, uscire, membri e ruoli, proposte di amministratore, cessione,
// impostazioni della lega, funzioni per l'amministratore supremo. I permessi li decide il database (RLS e controlli).
import { useQuery } from '@tanstack/react-query';
import type { Role } from '../app/auth';
import type { Json } from './types';
import { supabase } from './supabase';

export interface MyLeague {
  id: string;
  name: string;
  slug: string;
  isPublic: boolean;
  role: Role;
  inviteCode: string;
  ownerId: string | null;
}

export interface LeagueSettings {
  /** formato abituale: 5, 6 o 7 contro */
  format?: 5 | 6 | 7;
  /** giorno della partita: 1 = lunedì … 5 = venerdì */
  day?: number;
}

const fail = (what: string, e: { message: string }) => new Error(`${what}: ${e.message}`);
const plain = (e: { message: string }) => new Error(e.message);

/** La lega pubblica e quelle di cui faccio parte (senza accesso: solo la pubblica). */
export async function fetchMyLeagues(userId: string | null): Promise<MyLeague[]> {
  const cols = 'id, name, slug, is_public, invite_code, owner_id';
  const pub = await supabase.from('leagues').select(cols).eq('is_public', true).order('created_at');
  if (pub.error) throw fail('leghe', pub.error);
  const mk = (l: { id: string; name: string; slug: string; is_public: boolean; invite_code: string; owner_id: string | null }, role: Role): MyLeague => ({
    id: l.id, name: l.name, slug: l.slug, isPublic: l.is_public, role, inviteCode: l.invite_code, ownerId: l.owner_id,
  });
  const out = new Map<string, MyLeague>((pub.data ?? []).map((l) => [l.id, mk(l, null)]));
  if (userId) {
    const mine = await supabase.from('league_members').select(`role, leagues(${cols})`).eq('user_id', userId);
    if (mine.error) throw fail('mie leghe', mine.error);
    for (const m of mine.data ?? []) if (m.leagues) out.set(m.leagues.id, mk(m.leagues, m.role));
  }
  return [...out.values()].sort((a, b) => Number(b.isPublic) - Number(a.isPublic) || a.name.localeCompare(b.name));
}

export const MY_LEAGUES_KEY = ['my-leagues'] as const;

export function useMyLeagues(userId: string | null) {
  return useQuery({ queryKey: [...MY_LEAGUES_KEY, userId], queryFn: () => fetchMyLeagues(userId), staleTime: 60_000 });
}

/** Crea una lega: chi la crea ne diventa amministratore e creatore. L'id si sceglie qui, così non serve rileggere la riga appena creata. */
export async function createLeague(input: { name: string; isPublic: boolean; settings: LeagueSettings }): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  const { error } = await supabase.from('leagues').insert({ id, name: input.name, is_public: input.isPublic, settings: input.settings as Json });
  if (error) throw fail('lega', error);
  return { id };
}

/** Entra in una lega con il codice d'invito (come membro). Se hai già un giocatore collegato, entra con te. */
export async function joinLeague(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_league', { code: code.trim() });
  if (error) throw plain(error);
  return data as string;
}

/** Esce da una lega (il creatore deve prima cedere la proprietà; non si lascia la lega senza amministratori). */
export async function leaveLeague(leagueId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('league_members').delete().eq('league_id', leagueId).eq('user_id', userId);
  if (error) throw plain(error);
}

export async function deleteLeague(leagueId: string): Promise<void> {
  const { error } = await supabase.from('leagues').delete().eq('id', leagueId);
  if (error) throw fail('eliminazione', error);
}

export async function updateLeague(leagueId: string, patch: { name?: string; isPublic?: boolean; settings?: LeagueSettings }): Promise<void> {
  const row: { name?: string; is_public?: boolean; settings?: Json } = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.isPublic !== undefined) row.is_public = patch.isPublic;
  if (patch.settings !== undefined) row.settings = patch.settings as Json;
  const { error } = await supabase.from('leagues').update(row).eq('id', leagueId);
  if (error) throw fail('lega', error);
}

export async function readLeagueSettings(leagueId: string): Promise<LeagueSettings> {
  const { data, error } = await supabase.from('leagues').select('settings').eq('id', leagueId).maybeSingle();
  if (error) throw fail('lega', error);
  return (data?.settings ?? {}) as LeagueSettings;
}

export async function regenerateInviteCode(leagueId: string): Promise<string> {
  const { data, error } = await supabase.rpc('regenerate_invite_code', { l: leagueId });
  if (error) throw plain(error);
  return data as string;
}

// ── Membri e ruoli ─────────────────────────────────────────────────────────
export interface Member {
  userId: string;
  role: 'admin' | 'redazione' | 'member';
  name: string;
  email: string;
  isOwner: boolean;
  /** proposta di amministratore in attesa per questa persona */
  adminRequestId: string | null;
}

/** Membri della lega, con nome ed email (solo per l'amministratore). */
export async function fetchMembers(leagueId: string): Promise<Member[]> {
  const { data, error } = await supabase.rpc('league_member_list', { l: leagueId });
  if (error) throw plain(error);
  return (data ?? []).map((m) => ({
    userId: m.user_id, role: m.role, name: m.display_name ?? '', email: m.email ?? '', isOwner: m.is_owner, adminRequestId: m.admin_request_id,
  }));
}

export const MEMBERS_KEY = ['league-members'] as const;

export function useMembers(leagueId: string | undefined, enabled: boolean) {
  return useQuery({ queryKey: [...MEMBERS_KEY, leagueId], queryFn: () => fetchMembers(leagueId as string), enabled: enabled && !!leagueId, retry: false });
}

export async function setMemberRole(leagueId: string, userId: string, role: Member['role']): Promise<void> {
  const { error } = await supabase.rpc('set_member_role', { l: leagueId, u: userId, r: role });
  if (error) throw plain(error);
}

export async function removeMember(leagueId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_member', { l: leagueId, u: userId });
  if (error) throw plain(error);
}

// ── Proposte di amministratore e proprietà ─────────────────────────────────
export interface AdminRequest {
  id: string;
  userId: string;
  name: string;
  requestedBy: string;
}

export async function fetchAdminRequests(leagueId: string): Promise<AdminRequest[]> {
  const { data, error } = await supabase.rpc('admin_requests_list', { l: leagueId });
  if (error) throw plain(error);
  return (data ?? []).map((r) => ({ id: r.id, userId: r.user_id, name: r.display_name || r.email || 'Utente', requestedBy: r.requested_by_name ?? '' }));
}

export const ADMIN_REQUESTS_KEY = ['admin-requests'] as const;

export function useAdminRequests(leagueId: string | undefined, enabled: boolean) {
  return useQuery({ queryKey: [...ADMIN_REQUESTS_KEY, leagueId], queryFn: () => fetchAdminRequests(leagueId as string), enabled: enabled && !!leagueId, retry: false });
}

export async function proposeAdmin(leagueId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('propose_admin', { l: leagueId, u: userId });
  if (error) throw plain(error);
}

export async function decideAdminRequest(id: string, approve: boolean): Promise<void> {
  const { error } = await supabase.rpc('decide_admin_request', { c: id, approve });
  if (error) throw plain(error);
}

export async function cancelAdminRequest(id: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_admin_request', { c: id });
  if (error) throw plain(error);
}

export async function transferOwnership(leagueId: string, newOwner: string): Promise<void> {
  const { error } = await supabase.rpc('transfer_league_ownership', { l: leagueId, new_owner: newOwner });
  if (error) throw plain(error);
}

// ── Amministratore supremo ─────────────────────────────────────────────────
export interface PlatformLeague {
  id: string; name: string; slug: string; isPublic: boolean; owner: string; ownerMissing: boolean;
  admins: string; members: number; matches: number; createdAt: string; lastActivity: string;
}
export interface PlatformUser { id: string; name: string; email: string; lastSignIn: string | null; createdAt: string; leagues: string }

export async function fetchIsSuperAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_super_admin');
  return !error && data === true;
}

export function useIsSuperAdmin(userId: string | null) {
  return useQuery({ queryKey: ['super-admin', userId], queryFn: fetchIsSuperAdmin, enabled: !!userId, staleTime: 5 * 60_000, retry: false });
}

export async function fetchPlatformLeagues(): Promise<PlatformLeague[]> {
  const { data, error } = await supabase.rpc('admin_list_leagues');
  if (error) throw plain(error);
  return (data ?? []).map((l) => ({
    id: l.id, name: l.name, slug: l.slug, isPublic: l.is_public, owner: l.owner_name ?? '', ownerMissing: l.owner_missing, admins: l.admins ?? '',
    members: Number(l.members), matches: Number(l.matches), createdAt: l.created_at, lastActivity: l.last_activity,
  }));
}

export async function fetchPlatformUsers(): Promise<PlatformUser[]> {
  const { data, error } = await supabase.rpc('admin_list_users');
  if (error) throw plain(error);
  return (data ?? []).map((u) => ({ id: u.id, name: u.display_name ?? '', email: u.email ?? '', lastSignIn: u.last_sign_in_at, createdAt: u.created_at, leagues: u.leagues ?? '' }));
}

/** Amministratori di una lega (per assegnarle un creatore). */
export async function fetchLeagueAdmins(leagueId: string): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await supabase.rpc('admin_league_admins', { l: leagueId });
  if (error) throw plain(error);
  return (data ?? []).map((a) => ({ id: a.user_id, name: a.name }));
}

export async function assignOwner(leagueId: string, newOwner: string): Promise<void> {
  const { error } = await supabase.rpc('admin_assign_owner', { l: leagueId, new_owner: newOwner });
  if (error) throw plain(error);
}

/** Aggiunge alla lega i giocatori che ho nelle altre leghe di cui sono amministratore (niente doppioni). Restituisce quanti ne ha aggiunti. */
export async function addPlayersFromMyLeagues(targetLeagueId: string, fromLeagueIds: string[]): Promise<number> {
  if (!fromLeagueIds.length) return 0;
  const src = await supabase.from('league_players').select('player_id').in('league_id', fromLeagueIds);
  if (src.error) throw fail('giocatori', src.error);
  const have = await supabase.from('league_players').select('player_id').eq('league_id', targetLeagueId);
  if (have.error) throw fail('giocatori', have.error);
  const present = new Set((have.data ?? []).map((x) => x.player_id));
  const ids = [...new Set((src.data ?? []).map((x) => x.player_id))].filter((id) => !present.has(id));
  if (!ids.length) return 0;
  const { error } = await supabase.from('league_players').insert(ids.map((player_id) => ({ league_id: targetLeagueId, player_id })));
  if (error) throw fail('giocatori', error);
  return ids.length;
}
