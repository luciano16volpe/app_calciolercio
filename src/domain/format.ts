// Piccole funzioni di formattazione condivise.

/** Data ISO (aaaa-mm-gg…) → gg/mm/aaaa. Senza data: "—". */
export function formatDate(d: unknown): string {
  if (!d) return '—';
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return String(d);
}

/** Toglie il selettore di variante U+FE0F dalle emoji (Safari le misura male nei testi centrati su canvas). */
export const noVS = (s: unknown): string => String(s).replace(/\ufe0f/g, '');

/** Iniziali del nome: prima lettera delle prime due parole (CamelCase conta come parole); una parola sola → prime due lettere. */
export function initials(n: unknown): string {
  const s = String(n || '?').trim().replace(/([a-zà-ÿ])([A-ZÀ-Þ])/g, '$1 $2');
  const w = s.split(/\s+/).filter(Boolean);
  return (w.length >= 2 ? (w[0] as string).charAt(0) + (w[1] as string).charAt(0) : s.substring(0, 2)).toUpperCase();
}

/** Classe del colore dell'avatar secondo i ruoli: nessuno, più di uno, oppure attacco / difesa / centrocampo. */
export function avatarClass(roles: string[] | undefined | null): string {
  if (!roles || roles.length === 0) return 'av-none';
  if (roles.length > 1) return 'av-multi';
  return roles[0] === 'ATT' ? 'av-att' : roles[0] === 'DIF' ? 'av-def' : 'av-mid';
}

/** Mette in sicurezza il testo per l'HTML (& < > " '). */
export const esc = (v: unknown): string =>
  String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

/** Ora del database (hh:mm:ss) → hh:mm. Senza ora: "". */
export function formatTime(t: unknown): string {
  const m = String(t ?? '').match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1]?.padStart(2, '0')}:${m[2]}` : '';
}

/** «alle 21:00 · Campo Sole» (le parti mancanti si saltano; senza niente: ""). */
export function whenWhere(m: Record<string, unknown>): string {
  const t = formatTime(m.time);
  const p = String(m.place ?? '').trim();
  return [t ? `alle ${t}` : '', p].filter(Boolean).join(' · ');
}
