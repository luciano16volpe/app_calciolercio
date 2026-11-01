// Registro attività: lettura (solo amministratore supremo; il database lo garantisce con le regole RLS).
import { DELICATE_ACTIONS, type AuditGroup, type AuditRow } from '../domain/audit';
import { supabase } from './supabase';

export interface AuditFilter {
  /** inizio del periodo (ISO); fine (ISO, esclusa) per il periodo personalizzato */
  from?: string;
  to?: string;
  leagueId?: string;
  actorId?: string;
  group?: AuditGroup;
  delicateOnly?: boolean;
}

export const AUDIT_PAGE = 50;

function build(f: AuditFilter) {
  let q = supabase.from('audit_log').select('*');
  if (f.from) q = q.gte('at', f.from);
  if (f.to) q = q.lt('at', f.to);
  if (f.leagueId) q = q.eq('league_id', f.leagueId);
  if (f.actorId) q = q.eq('actor_id', f.actorId);
  if (f.group) q = q.eq('grp', f.group);
  if (f.delicateOnly) q = q.in('action', [...DELICATE_ACTIONS]);
  return q.order('at', { ascending: false }).order('id', { ascending: false });
}

const asRows = (d: unknown): AuditRow[] => (d ?? []) as AuditRow[];

/** Una pagina del registro (50 righe), dalla più recente. */
export async function fetchAuditPage(f: AuditFilter, offset: number): Promise<AuditRow[]> {
  const { data, error } = await build(f).range(offset, offset + AUDIT_PAGE - 1);
  if (error) throw new Error(error.message);
  return asRows(data);
}

/** Tutte le righe dei filtri scelti (per il CSV), fino a un massimo. */
export async function fetchAuditAll(f: AuditFilter, max = 5000): Promise<AuditRow[]> {
  const out: AuditRow[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await build(f).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...asRows(data));
    if (!data || data.length < 1000) break;
  }
  return out.slice(0, max);
}

/** Persone e leghe presenti nel registro (per i menu dei filtri). */
export async function fetchAuditFacets(): Promise<{ actors: Array<{ id: string; name: string }>; leagues: Array<{ id: string; name: string }> }> {
  const { data, error } = await supabase.from('audit_log').select('actor_id, actor_name, league_id, league_name').order('at', { ascending: false }).limit(3000);
  if (error) throw new Error(error.message);
  const actors = new Map<string, string>();
  const leagues = new Map<string, string>();
  for (const r of data ?? []) {
    if (r.actor_id && r.actor_name && !actors.has(r.actor_id)) actors.set(r.actor_id, r.actor_name);
    if (r.league_id && r.league_name && !leagues.has(r.league_id)) leagues.set(r.league_id, r.league_name);
  }
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  return {
    actors: [...actors].map(([id, name]) => ({ id, name })).sort(byName),
    leagues: [...leagues].map(([id, name]) => ({ id, name })).sort(byName),
  };
}

/** Avvisa il registro di un evento dell'app (accesso, uscita, registrazione, password). Mai un errore per chi usa l'app. */
export async function logEvent(action: 'auth.login' | 'auth.logout' | 'auth.signup' | 'auth.password_changed' | 'auth.password_reset', email?: string): Promise<void> {
  try {
    await supabase.rpc('log_event', { p_action: action, ...(email ? { p_email: email } : {}) });
  } catch {
    /* il registro non deve mai bloccare l'app */
  }
}
