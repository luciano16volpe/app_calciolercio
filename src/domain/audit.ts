// Registro attività: frasi leggibili, raggruppamento per operazione, azioni delicate, esportazione CSV.
// Logica pura (senza schermo né Supabase). Le righe le scrive il database; qui si leggono soltanto.
import { STATS } from './types';

export type AuditGroup = 'account' | 'leghe' | 'partite' | 'giocatori';

export interface AuditRow {
  id: number;
  at: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  entity_label: string | null;
  league_id: string | null;
  league_name: string | null;
  grp: AuditGroup;
  tx: number;
  changes: Record<string, unknown> | null;
  source: 'app' | 'import' | 'sistema';
  ip: string | null;
  user_agent: string | null;
}

export const GROUP_LABEL: Record<AuditGroup, string> = {
  account: 'Accessi e account',
  leghe: 'Leghe, membri e ruoli',
  partite: 'Partite, pagelle e Gazzette',
  giocatori: 'Giocatori e statistiche',
};

/** Azioni da guardare con più attenzione (⚠️). */
export const DELICATE_ACTIONS = [
  'league_members.role', 'league_admin_requests.approved', 'leagues.owner', 'matches.delete', 'leagues.delete',
  'players.merge', 'players.unlink', 'account.delete',
] as const;
export const isDelicate = (action: string): boolean => (DELICATE_ACTIONS as readonly string[]).includes(action);

const ROLE_NAME: Record<string, string> = { admin: 'amministratore', redazione: 'redazione', member: 'membro' };
const roleName = (v: unknown) => ROLE_NAME[String(v)] ?? String(v);
const SOURCE_LABEL = { app: 'app', import: 'importazione', sistema: 'sistema' } as const;
export const sourceLabel = (s: AuditRow['source']): string => SOURCE_LABEL[s] ?? s;

/** Numero all'italiana (6,5). */
const num = (v: unknown): string => String(v).replace('.', ',');
const isEmpty = (v: unknown) => v === null || v === undefined || v === '' || v === 0;
const q = (v: unknown) => `«${String(v)}»`;

type Pair = [unknown, unknown];
const pair = (c: Record<string, unknown>, k: string): Pair | null => (Array.isArray(c[k]) ? (c[k] as Pair) : null);

/** Gol, assist… di una pagella: nome della cosa e genere (per «ha cambiato i gol / l'autogol»). */
const COUNT_FIELDS: Record<string, string> = { goals: 'i gol', assist: 'gli assist', autogol: 'gli autogol', meta: 'le mete', rigori_sbagliati: 'i rigori sbagliati' };

/** Il giocatore e la partita da un'etichetta come «Peppe · partita del 28/10/2026». */
function splitLabel(label: string | null): { first: string; rest: string } {
  const s = label ?? '';
  const i = s.indexOf(' · ');
  return i < 0 ? { first: s, rest: '' } : { first: s.slice(0, i), rest: s.slice(i + 3) };
}

function playerChanges(name: string, ch: Record<string, unknown>): string[] {
  const out: string[] = [];
  const stats = pair(ch, 'stats');
  if (stats && Array.isArray(stats[0]) && Array.isArray(stats[1])) {
    const [a, b] = stats as [number[], number[]];
    b.forEach((v, i) => {
      if (a[i] !== v) out.push(`ha cambiato ${STATS[i] ?? `statistica ${i + 1}`} di ${name} da ${num(a[i])} a ${num(v)}`);
    });
  }
  const roles = pair(ch, 'roles');
  if (roles) out.push(`ha cambiato i ruoli di ${name} da ${(roles[0] as string[]).join('/') || 'nessuno'} a ${(roles[1] as string[]).join('/') || 'nessuno'}`);
  const nm = pair(ch, 'name');
  if (nm) out.push(`ha cambiato il nome del giocatore da ${q(nm[0])} a ${q(nm[1])}`);
  const ph = pair(ch, 'photo_path');
  if (ph) out.push(ph[1] ? `ha ${ph[0] ? 'cambiato' : 'messo'} la foto di ${name}` : `ha tolto la foto di ${name}`);
  return out;
}

function pagellaChanges(player: string, ch: Record<string, unknown>): string[] {
  const out: string[] = [];
  const r = pair(ch, 'rating');
  if (r) out.push(isEmpty(r[0]) ? `ha messo il voto ${num(r[1])} a ${player}` : r[1] === null ? `ha tolto il voto di ${player} (era ${num(r[0])})` : `ha cambiato il voto di ${player} da ${num(r[0])} a ${num(r[1])}`);
  for (const [k, what] of Object.entries(COUNT_FIELDS)) {
    const p = pair(ch, k);
    if (p) out.push(`ha cambiato ${what} di ${player} da ${num(p[0] ?? 0)} a ${num(p[1] ?? 0)}`);
  }
  const t = pair(ch, 'titolo');
  if (t) out.push(isEmpty(t[1]) ? `ha tolto il titolo ${q(t[0])} a ${player}` : isEmpty(t[0]) ? `ha aggiunto il titolo ${q(t[1])} a ${player}` : `ha cambiato il titolo di ${player} da ${q(t[0])} a ${q(t[1])}`);
  const d = pair(ch, 'descrizione');
  if (d) out.push(isEmpty(d[1]) ? `ha tolto la descrizione di ${player}` : isEmpty(d[0]) ? `ha scritto la descrizione di ${player}` : `ha modificato la descrizione di ${player}`);
  const team = pair(ch, 'team');
  if (team) out.push(`ha spostato ${player} da ${team[0] === 'A' ? 'Blu' : 'Bianchi'} a ${team[1] === 'A' ? 'Blu' : 'Bianchi'}`);
  return out;
}

/** Le frasi che raccontano una riga ("ha cambiato il voto di Peppe da 6 a 6,5"). Sempre almeno una. */
export function describeRow(row: AuditRow): string[] {
  const ch = (row.changes ?? {}) as Record<string, unknown>;
  const label = row.entity_label ?? '';
  const actor = row.actor_name ?? '';
  const self = actor !== '' && actor === label; // la persona dell'azione è la stessa dell'oggetto
  const list = (a: string[]) => (a.length ? a : [`${row.action} ${label}`.trim()]);
  switch (row.action) {
    case 'auth.login': return ['ha fatto l’accesso'];
    case 'auth.logout': return ['è uscito'];
    case 'auth.signup': return ['si è registrato'];
    case 'auth.password_changed': return ['ha cambiato la password'];
    case 'auth.password_reset': return ['ha chiesto una nuova password'];
    case 'account.delete': return ['ha cancellato il suo account'];
    case 'platform_admins.insert': return [`${label} è stato nominato amministratore supremo`];
    case 'platform_admins.delete': return [`${label} non è più amministratore supremo`];

    case 'leagues.insert': return [`ha creato la lega ${q(label)}`];
    case 'leagues.delete': return [`ha eliminato la lega ${q(label)}`];
    case 'leagues.owner': return [`ha cambiato il creatore della lega ${q(label)}`];
    case 'leagues.invite_code': return ['ha rigenerato il codice d’invito'];
    case 'leagues.update': {
      const out: string[] = [];
      const nm = pair(ch, 'name');
      if (nm) out.push(`ha cambiato il nome della lega da ${q(nm[0])} a ${q(nm[1])}`);
      const pub = pair(ch, 'is_public');
      if (pub) out.push(pub[1] ? 'ha reso pubblica la lega' : 'ha reso privata la lega');
      if (pair(ch, 'settings')) out.push('ha cambiato le impostazioni della lega');
      return list(out);
    }
    case 'league_members.insert': return [self ? 'è entrato nella lega' : `ha aggiunto ${label} alla lega`];
    case 'league_members.delete': return [self ? 'è uscito dalla lega' : `ha tolto ${label} dalla lega`];
    case 'league_members.role': {
      const r = pair(ch, 'role');
      return [r ? `ha cambiato il ruolo di ${label} da ${roleName(r[0])} a ${roleName(r[1])}` : `ha cambiato il ruolo di ${label}`];
    }
    case 'league_admin_requests.propose': return [`ha proposto ${label} come amministratore`];
    case 'league_admin_requests.approved': return [`ha approvato ${label} come amministratore`];
    case 'league_admin_requests.rejected': return [`ha rifiutato la proposta di ${label} come amministratore`];
    case 'league_admin_requests.cancelled': return [`ha annullato la proposta di ${label} come amministratore`];

    case 'league_players.insert': return [`ha aggiunto ${label} alla lega`];
    case 'league_players.delete': return [`ha tolto ${label} dalla lega`];
    case 'league_players.update': {
      const out: string[] = [];
      const ar = pair(ch, 'archived');
      if (ar) out.push(ar[1] ? `ha archiviato ${label}` : `ha ripristinato ${label}`);
      if (pair(ch, 'aliases')) out.push(`ha aggiornato i soprannomi di ${label}`);
      if (pair(ch, 'nickname')) out.push(`ha cambiato il soprannome di ${label}`);
      return list(out);
    }
    case 'players.insert': return [`ha creato il giocatore ${label}`];
    case 'players.delete': return [`ha eliminato il giocatore ${label}`];
    case 'players.update': return list(playerChanges(label, ch));
    case 'players.link': return [`${label} è stato collegato a un account`];
    case 'players.unlink': return [`${label} è stato scollegato dal suo account`];
    case 'players.merge': return [`ha unito i giocatori ${label}`];

    case 'matches.insert': return [`ha creato la ${label}`];
    case 'matches.delete': return [`ha eliminato la ${label}`];
    case 'matches.update': {
      const out: string[] = [];
      const a = pair(ch, 'score_a');
      const b = pair(ch, 'score_b');
      if (a || b) {
        const was = `${a ? (a[0] ?? '–') : '?'}-${b ? (b[0] ?? '–') : '?'}`;
        out.push(`ha cambiato il risultato della ${label}${a && b ? ` da ${was} a ${a[1] ?? '–'}-${b[1] ?? '–'}` : ''}`);
      }
      if (pair(ch, 'notes')) out.push(`ha cambiato la descrizione della ${label}`);
      const dt = pair(ch, 'date');
      if (dt) out.push(`ha cambiato la data della partita da ${String(dt[0])} a ${String(dt[1])}`);
      return list(out);
    }
    case 'match_players.insert': { const s = splitLabel(label); return [`ha aggiunto ${s.first} alla ${s.rest}`]; }
    case 'match_players.delete': { const s = splitLabel(label); return [`ha tolto ${s.first} dalla ${s.rest}`]; }
    case 'match_players.update': return list(pagellaChanges(splitLabel(label).first, ch));
    case 'gazzette.insert': return [`ha caricato la ${label.replace(/^Gazzetta · /, 'Gazzetta della ')}`];
    case 'gazzette.update': return [`ha sostituito la ${label.replace(/^Gazzetta · /, 'Gazzetta della ')}`];
    case 'gazzette.delete': return [`ha rimosso la ${label.replace(/^Gazzetta · /, 'Gazzetta della ')}`];
    case 'albo.insert': return [`ha creato l’albo d’oro della ${label}`];
    case 'albo.delete': return [`ha eliminato l’albo d’oro della ${label}`];
    case 'albo.update': { const s = pair(ch, 'status'); return [s ? `ha cambiato lo stato della ${label} da ${String(s[0])} a ${String(s[1])}` : `ha cambiato la ${label}`]; }

    case 'player_invites.create': return [`ha creato il link d’invito per ${label}`];
    case 'player_invites.revoke': return [`ha annullato il link d’invito di ${label}`];
    case 'player_invites.used': return [`${label} ha usato il suo link d’invito`];
    case 'player_claims.request': return [`ha chiesto di essere ${splitArrow(label).player}`];
    case 'player_claims.approved': return [`ha confermato che ${splitArrow(label).who} è ${splitArrow(label).player}`];
    case 'player_claims.rejected': return [`ha rifiutato che ${splitArrow(label).who} sia ${splitArrow(label).player}`];
    default: return [`${row.action}${label ? ` · ${label}` : ''}`];
  }
}

/** «Marco ← Marchino» (giocatore ← persona) */
function splitArrow(label: string): { player: string; who: string } {
  const i = label.indexOf(' ← ');
  return i < 0 ? { player: label, who: label } : { player: label.slice(0, i), who: label.slice(i + 3) };
}


const FIELD_NAME: Record<string, string> = {
  rating: 'voto', goals: 'gol', assist: 'assist', autogol: 'autogol', meta: 'meta', rigori_sbagliati: 'rigori sbagliati', titolo: 'titolo',
  descrizione: 'descrizione', team: 'squadra', position: 'posizione', name: 'nome', roles: 'ruoli', stats: 'statistiche', photo_path: 'foto',
  score_a: 'gol Blu', score_b: 'gol Bianchi', notes: 'descrizione', date: 'data', is_public: 'pubblica', invite_code: 'codice d’invito',
  owner_id: 'creatore', role: 'ruolo', status: 'stato', archived: 'archiviato', aliases: 'soprannomi', nickname: 'soprannome', user_id: 'account',
  settings: 'impostazioni', season_key: 'stagione', file_path: 'file', slug: 'indirizzo',
};
const show = (v: unknown): string => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** Dettaglio di una riga: «voto: 6 → 6,5» per le modifiche, «campo: valore» per creazioni e cancellazioni. */
export function changeLines(row: AuditRow): string[] {
  const ch = row.changes;
  if (!ch) return [];
  const upd = !/\.(insert|delete)$/.test(row.action) && Object.values(ch).every((v) => Array.isArray(v) && v.length === 2);
  return Object.entries(ch).map(([k, v]) => {
    const name = FIELD_NAME[k] ?? k;
    if (upd) {
      const [a, b] = v as Pair;
      return `${name}: ${show(a)} → ${show(b)}`;
    }
    return `${name}: ${show(v)}`;
  });
}

/** Un'operazione: tutte le righe scritte nella stessa transazione. */
export interface AuditGroupItem {
  tx: number;
  rows: AuditRow[];
  at: string;
  actor: string;
  league: string;
  delicate: boolean;
  /** frase riassuntiva: «Salvataggio partita del 28/10/2026 (10 modifiche)» */
  headline: string;
}

/** Raggruppa le righe (già ordinate dalla più recente) per operazione, mantenendo l'ordine. */
export function groupOperations(rows: AuditRow[]): AuditGroupItem[] {
  const map = new Map<string, AuditRow[]>();
  for (const r of rows) {
    const k = `${r.tx}|${r.actor_id ?? r.actor_name ?? ''}`;
    const g = map.get(k);
    if (g) g.push(r);
    else map.set(k, [r]);
  }
  return [...map.values()].map((rs) => {
    const first = rs[0] as AuditRow;
    const n = rs.length;
    const pag = rs.filter((r) => r.entity === 'match_players');
    let headline: string;
    if (n === 1) headline = describeRow(first)[0] as string;
    else if (pag.length === n && new Set(pag.map((r) => splitLabel(r.entity_label).rest)).size === 1) headline = `Salvataggio ${splitLabel(first.entity_label).rest} (${n} modifiche)`;
    else if (new Set(rs.map((r) => r.action)).size === 1) headline = `${describeRow(first)[0]}${n > 1 ? ` (+${n - 1})` : ''}`;
    else headline = `${n} modifiche: ${describeRow(first)[0]}…`;
    return {
      tx: first.tx,
      rows: rs,
      at: first.at,
      actor: first.actor_name ?? (first.source === 'sistema' ? 'Sistema' : first.source === 'import' ? 'Importazione' : '—'),
      league: first.league_name ?? '',
      delicate: rs.some((r) => isDelicate(r.action)),
      headline,
    };
  });
}

/** Unisce nuove righe a quelle già mostrate senza ripetere (una pagina può spezzare un'operazione a metà). */
export function mergeRows(old: AuditRow[], next: AuditRow[]): AuditRow[] {
  const seen = new Set(old.map((r) => r.id));
  return [...old, ...next.filter((r) => !seen.has(r.id))].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.id - a.id));
}

// ── Esportazione CSV ────────────────────────────────────────────────────────
const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Data e ora per il registro: 28/10/2026 14:32 (ora italiana). */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('day')}/${g('month')}/${g('year')} ${g('hour')}:${g('minute')}`;
}

/** Righe → testo CSV (separatore «;», adatto a Excel in italiano). */
export function toCsv(rows: AuditRow[]): string {
  const head = ['Data e ora', 'Persona', 'Lega', 'Gruppo', 'Azione', 'Oggetto', 'Cosa è successo', 'Delicata', 'Prima → dopo', 'IP', 'Dispositivo', 'Origine', 'Operazione'];
  const lines = rows.map((r) => [
    formatDateTime(r.at), r.actor_name ?? '', r.league_name ?? '', GROUP_LABEL[r.grp] ?? r.grp, r.action, r.entity_label ?? '',
    describeRow(r).join(' | '), isDelicate(r.action) ? 'sì' : '', r.changes ? JSON.stringify(r.changes) : '', r.ip ?? '', r.user_agent ?? '', sourceLabel(r.source), r.tx,
  ]);
  return '﻿' + [head, ...lines].map((l) => l.map(csvCell).join(';')).join('\r\n');
}

/** Dispositivo in due parole dalla stringa dello user agent («iPhone · Safari»). */
export function deviceName(ua: string | null): string {
  if (!ua) return '';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\/|CriOS\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return [os, br].filter(Boolean).join(' · ') || ua.slice(0, 40);
}
