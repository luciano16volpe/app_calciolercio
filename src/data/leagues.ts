// Leghe: le mie leghe, creare una lega, entrare con il codice, uscire. I permessi li decide il database (RLS).
import { useQuery } from '@tanstack/react-query';
import type { Role } from '../app/auth';
import { supabase } from './supabase';

export interface MyLeague {
  id: string;
  name: string;
  isPublic: boolean;
  role: Role;
  inviteCode: string;
}

const fail = (what: string, e: { message: string }) => new Error(`${what}: ${e.message}`);

/** La lega pubblica e quelle di cui faccio parte (senza accesso: solo la pubblica). */
export async function fetchMyLeagues(userId: string | null): Promise<MyLeague[]> {
  const pub = await supabase.from('leagues').select('id, name, is_public, invite_code').eq('is_public', true).order('created_at');
  if (pub.error) throw fail('leghe', pub.error);
  const out = new Map<string, MyLeague>((pub.data ?? []).map((l) => [l.id, { id: l.id, name: l.name, isPublic: true, role: null, inviteCode: l.invite_code }]));
  if (userId) {
    const mine = await supabase.from('league_members').select('role, leagues(id, name, is_public, invite_code)').eq('user_id', userId);
    if (mine.error) throw fail('mie leghe', mine.error);
    for (const m of mine.data ?? []) {
      const l = m.leagues;
      if (l) out.set(l.id, { id: l.id, name: l.name, isPublic: l.is_public, role: m.role, inviteCode: l.invite_code });
    }
  }
  return [...out.values()].sort((a, b) => Number(b.isPublic) - Number(a.isPublic) || a.name.localeCompare(b.name));
}

export const MY_LEAGUES_KEY = ['my-leagues'] as const;

export function useMyLeagues(userId: string | null) {
  return useQuery({ queryKey: [...MY_LEAGUES_KEY, userId], queryFn: () => fetchMyLeagues(userId), staleTime: 60_000 });
}

/** Crea una lega (privata): chi la crea ne diventa amministratore. L'id si sceglie qui, così non serve rileggere la riga appena creata. */
export async function createLeague(name: string): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await supabase.from('leagues').insert({ id, name });
  if (error) throw fail('lega', error);
  return id;
}

/** Entra in una lega con il codice d'invito (come membro). */
export async function joinLeague(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_league', { code: code.trim() });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Esce da una lega. */
export async function leaveLeague(leagueId: string, userId: string): Promise<void> {
  const admins = await supabase.from('league_members').select('user_id').eq('league_id', leagueId).eq('role', 'admin');
  if (admins.error) throw fail('uscita', admins.error);
  if ((admins.data ?? []).length === 1 && admins.data?.[0]?.user_id === userId) {
    throw new Error("Sei l'unico amministratore: prima nomina un altro amministratore (oppure elimina la lega)");
  }
  const { error } = await supabase.from('league_members').delete().eq('league_id', leagueId).eq('user_id', userId);
  if (error) throw fail('uscita', error);
}

export interface Member {
  userId: string;
  role: 'admin' | 'redazione' | 'member';
  name: string;
  email: string;
}

/** Frase da mostrare se la migrazione del passo 4.2 non è ancora stata applicata nel database. */
export const MEMBERS_MIGRATION_HINT = 'Per gestire i membri serve aggiornare il database: incolla in Supabase (SQL Editor) il file supabase/migrations/20261101000000_membri.sql';
const missingFn = (msg: string) => /could not find the function|schema cache|PGRST202|does not exist/i.test(msg);

/** Membri della lega, con nome ed email (solo per l'amministratore). */
export async function fetchMembers(leagueId: string): Promise<Member[]> {
  const { data, error } = await supabase.rpc('league_member_list', { l: leagueId });
  if (error) throw new Error(missingFn(error.message) ? MEMBERS_MIGRATION_HINT : error.message);
  return ((data ?? []) as Array<{ user_id: string; role: Member['role']; display_name: string | null; email: string | null }>).map((m) => ({
    userId: m.user_id, role: m.role, name: m.display_name ?? '', email: m.email ?? '',
  }));
}

export const MEMBERS_KEY = ['league-members'] as const;

export function useMembers(leagueId: string | undefined, enabled: boolean) {
  return useQuery({ queryKey: [...MEMBERS_KEY, leagueId], queryFn: () => fetchMembers(leagueId as string), enabled: enabled && !!leagueId, retry: false });
}

export async function setMemberRole(leagueId: string, userId: string, role: Member['role']): Promise<void> {
  const { error } = await supabase.rpc('set_member_role', { l: leagueId, u: userId, r: role });
  if (error) throw new Error(missingFn(error.message) ? MEMBERS_MIGRATION_HINT : error.message);
}

export async function removeMember(leagueId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_member', { l: leagueId, u: userId });
  if (error) throw new Error(missingFn(error.message) ? MEMBERS_MIGRATION_HINT : error.message);
}
