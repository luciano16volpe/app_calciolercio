// Piccole funzioni di formattazione condivise. Fonte: formatDate, noVS in legacy/index.html.

/** Data ISO (aaaa-mm-gg…) → gg/mm/aaaa. Senza data: "—". */
export function formatDate(d: unknown): string {
  if (!d) return '—';
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return String(d);
}

/** Toglie il selettore di variante U+FE0F dalle emoji (Safari le misura male nei testi centrati su canvas). */
export const noVS = (s: unknown): string => String(s).replace(/️/g, '');
