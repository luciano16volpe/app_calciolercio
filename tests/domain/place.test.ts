import { describe, expect, it } from 'vitest';
import { hasCoords, mapsUrl, placeFromResult, placeOf, placeShareText } from '../../src/domain/place';

describe('luogo della partita', () => {
  it('le coordinate valgono solo se ci sono tutte e due e sono sensate', () => {
    expect(placeOf({ place: ' Campo Sole ', placeLat: 41.9, placeLng: 12.5 })).toEqual({ name: 'Campo Sole', lat: 41.9, lng: 12.5 });
    expect(placeOf({ place: 'Campo', placeLat: 41.9 })).toEqual({ name: 'Campo', lat: null, lng: null });
    expect(placeOf({ place: 'Campo', placeLat: 91, placeLng: 12 }).lat).toBeNull();
    expect(placeOf({})).toEqual({ name: '', lat: null, lng: null });
  });
  it('il link porta esattamente a quel punto su Google Maps', () => {
    expect(mapsUrl(41.9028, 12.4964)).toBe('https://www.google.com/maps/search/?api=1&query=41.902800,12.496400');
  });
  it('il testo da condividere ha nome e link', () => {
    const p = { name: 'Campo Sole', lat: 41.9, lng: 12.5 };
    expect(hasCoords(p)).toBe(true);
    expect(placeShareText(p)).toBe('📍 Campo Sole\nhttps://www.google.com/maps/search/?api=1&query=41.900000,12.500000');
  });
  it('da un risultato di ricerca: nome breve con la città, massimo 80 caratteri', () => {
    expect(placeFromResult({ name: 'Campo Sole', display_name: 'Campo Sole, Via Roma, Latina, Lazio, Italia', lat: '41.46', lon: '12.9', address: { city: 'Latina' } }))
      .toEqual({ name: 'Campo Sole, Latina', lat: 41.46, lng: 12.9 });
    expect(placeFromResult({ display_name: 'Via Roma 1, Latina', lat: 1, lon: 2 })?.name).toBe('Via Roma 1');
    expect(placeFromResult({ name: 'x'.repeat(200), lat: 1, lon: 2 })?.name).toHaveLength(80);
    expect(placeFromResult({ name: 'Boh', lat: 'abc', lon: 2 })).toBeNull();
  });
});
