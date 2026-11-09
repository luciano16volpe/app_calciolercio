// Luogo di una partita: nome + (se trovato su una mappa) coordinate, per condividere la posizione.

/** Nome scritto dall'utente o scelto dalla ricerca; coordinate presenti solo per un luogo trovato su mappa. */
export interface PlaceValue {
  name: string;
  lat: number | null;
  lng: number | null;
}

export const NO_PLACE: PlaceValue = { name: '', lat: null, lng: null };

const isCoord = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;

/** Legge nome e coordinate da una partita (le coordinate valgono solo se ci sono tutte e due). */
export function placeOf(m: Record<string, unknown>): PlaceValue {
  const lat = m.placeLat, lng = m.placeLng;
  const ok = isCoord(lat, 90) && isCoord(lng, 180);
  return { name: String(m.place ?? '').trim(), lat: ok ? lat : null, lng: ok ? lng : null };
}

export const hasCoords = (p: PlaceValue): p is PlaceValue & { lat: number; lng: number } => p.lat !== null && p.lng !== null;

/** Link a Google Maps che apre esattamente quel punto (non richiede nessuna chiave). */
export function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/** Testo da mandare agli amici: «📍 Campo Sole» + link alla mappa. */
export function placeShareText(p: PlaceValue & { lat: number; lng: number }): string {
  return `📍 ${p.name || 'Luogo della partita'}\n${mapsUrl(p.lat, p.lng)}`;
}

/** Un risultato di ricerca (OpenStreetMap/Nominatim) → luogo con nome breve («Campo Sole, Roma», massimo 80 caratteri). */
export function placeFromResult(r: { name?: string; display_name?: string; lat: string | number; lon: string | number; address?: Record<string, string> }): PlaceValue | null {
  const lat = Number(r.lat), lng = Number(r.lon);
  if (!isCoord(lat, 90) || !isCoord(lng, 180)) return null;
  const a = r.address ?? {};
  const first = (r.name || String(r.display_name ?? '').split(',')[0] || a.road || '').trim();
  const city = (a.city || a.town || a.village || a.municipality || a.hamlet || '').trim();
  const name = [first, city && city !== first ? city : ''].filter(Boolean).join(', ').slice(0, 80).trim();
  return name ? { name, lat, lng } : null;
}
