// Ricerca luoghi con OpenStreetMap (Nominatim): gratis e senza chiave. Una richiesta alla volta, solo su comando
// (niente suggerimenti a ogni lettera: la regola del servizio chiede al massimo una richiesta al secondo).
import { placeFromResult, type PlaceValue } from '../domain/place';

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceValue[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
    q, format: 'jsonv2', addressdetails: '1', limit: '6', 'accept-language': 'it', countrycodes: 'it',
  });
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('ricerca non disponibile');
  const rows = (await res.json()) as Array<Parameters<typeof placeFromResult>[0]>;
  const seen = new Set<string>();
  const out: PlaceValue[] = [];
  for (const r of rows) {
    const p = placeFromResult(r);
    if (!p || seen.has(p.name)) continue;
    seen.add(p.name);
    out.push(p);
  }
  return out;
}
