// Luogo di una partita: nome + (se c'è) posizione, per condividerla con gli amici.
// La posizione può essere un link di Google Maps incollato dall'utente, oppure le coordinate di un luogo trovato su una mappa.

export interface PlaceValue {
  name: string;
  lat: number | null;
  lng: number | null;
  /** link di Google Maps (https) incollato dall'utente */
  url: string | null;
}

export const NO_PLACE: PlaceValue = { name: '', lat: null, lng: null, url: null };

const isCoord = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;

/** Legge nome e posizione da una partita (le coordinate valgono solo se ci sono tutte e due). */
export function placeOf(m: Record<string, unknown>): PlaceValue {
  const lat = m.placeLat, lng = m.placeLng;
  const ok = isCoord(lat, 90) && isCoord(lng, 180);
  const url = typeof m.placeUrl === 'string' && /^https:\/\//.test(m.placeUrl) ? m.placeUrl : null;
  return { name: String(m.place ?? '').trim(), lat: ok ? lat : null, lng: ok ? lng : null, url };
}

export const hasCoords = (p: PlaceValue): p is PlaceValue & { lat: number; lng: number } => p.lat !== null && p.lng !== null;

/** C'è qualcosa da condividere: un link o delle coordinate. */
export const hasPosition = (p: PlaceValue): boolean => !!p.url || hasCoords(p);

/** Link a Google Maps che apre esattamente quel punto (non richiede nessuna chiave). */
export function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/** Testo da mandare agli amici: «📍 Campo Sole» + link alla mappa (quello incollato, se c'è). */
export function placeShareText(p: PlaceValue): string {
  const link = p.url ?? (hasCoords(p) ? mapsUrl(p.lat, p.lng) : '');
  return [`📍 ${p.name || 'Luogo della partita'}`, link].filter(Boolean).join('\n');
}

const GOOGLE_HOST = /^(?:maps\.app\.goo\.gl|goo\.gl|(?:www\.)?google\.[a-z.]+|maps\.google\.[a-z.]+)$/i;
const NUM = '(-?\\d{1,3}\\.\\d+)';

/**
 * Legge un link di Google Maps (anche dentro un testo copiato, tipo «Campo Sole https://maps.app.goo.gl/xyz»).
 * Restituisce il link pulito e, se nel link ci sono, coordinate e nome del posto. Altri indirizzi: null.
 */
export function parseMapsLink(text: string): { url: string; lat: number | null; lng: number | null; name: string | null } | null {
  const found = /https?:\/\/[^\s<>"']+/i.exec(text);
  if (!found) return null;
  let u: URL;
  try { u = new URL(found[0].replace(/[).,;]+$/, '').replace(/^http:/i, 'https:')); } catch { return null; }
  if (u.protocol !== 'https:' || !GOOGLE_HOST.test(u.hostname)) return null;
  const host = u.hostname.toLowerCase();
  const isMaps = host === 'maps.app.goo.gl' || host.startsWith('maps.google.') || /^\/maps(\/|$)/i.test(u.pathname);
  if (!isMaps) return null;
  const url = u.toString();
  if (url.length > 500) return null;
  let href = u.pathname + u.search + u.hash;
  try { href = decodeURIComponent(href); } catch { /* resta com'è */ }
  const at = new RegExp('@' + NUM + ',' + NUM).exec(href) ?? new RegExp('!3d' + NUM + '!4d' + NUM).exec(href) ?? new RegExp('[?&](?:q|query|ll|destination)=' + NUM + ',' + NUM).exec(href);
  const lat = at ? Number(at[1]) : null, lng = at ? Number(at[2]) : null;
  const ok = lat !== null && lng !== null && isCoord(lat, 90) && isCoord(lng, 180);
  const place = /\/maps\/place\/([^/@?]+)/.exec(u.pathname);
  let name: string | null = null;
  if (place?.[1]) {
    try { name = decodeURIComponent(place[1].replace(/\+/g, ' ')).trim().slice(0, 80) || null; } catch { name = null; }
  }
  return { url, lat: ok ? lat : null, lng: ok ? lng : null, name };
}

/** Un risultato di ricerca (OpenStreetMap/Nominatim) → luogo con nome breve («Campo Sole, Roma», massimo 80 caratteri). */
export function placeFromResult(r: { name?: string; display_name?: string; lat: string | number; lon: string | number; address?: Record<string, string> }): PlaceValue | null {
  const lat = Number(r.lat), lng = Number(r.lon);
  if (!isCoord(lat, 90) || !isCoord(lng, 180)) return null;
  const a = r.address ?? {};
  const first = (r.name || String(r.display_name ?? '').split(',')[0] || a.road || '').trim();
  const city = (a.city || a.town || a.village || a.municipality || a.hamlet || '').trim();
  const name = [first, city && city !== first ? city : ''].filter(Boolean).join(', ').slice(0, 80).trim();
  return name ? { name, lat, lng, url: null } : null;
}
