import { describe, expect, it } from 'vitest';
import { hasCoords, hasPosition, mapsUrl, parseMapsLink, placeFromResult, placeOf, placeShareText } from '../../src/domain/place';

describe('luogo della partita', () => {
  it('le coordinate valgono solo se ci sono tutte e due e sono sensate', () => {
    expect(placeOf({ place: ' Campo Sole ', placeLat: 41.9, placeLng: 12.5 })).toEqual({ name: 'Campo Sole', lat: 41.9, lng: 12.5, url: null });
    expect(placeOf({ place: 'Campo', placeLat: 41.9 })).toEqual({ name: 'Campo', lat: null, lng: null, url: null });
    expect(placeOf({ place: 'Campo', placeLat: 91, placeLng: 12 }).lat).toBeNull();
    expect(placeOf({})).toEqual({ name: '', lat: null, lng: null, url: null });
  });
  it('il link salvato vale solo se è https', () => {
    expect(placeOf({ place: 'Campo', placeUrl: 'https://maps.app.goo.gl/abc' }).url).toBe('https://maps.app.goo.gl/abc');
    expect(placeOf({ place: 'Campo', placeUrl: 'javascript:alert(1)' }).url).toBeNull();
    expect(placeOf({ place: 'Campo', placeUrl: 'http://x.it' }).url).toBeNull();
  });
  it('il link porta esattamente a quel punto su Google Maps', () => {
    expect(mapsUrl(41.9028, 12.4964)).toBe('https://www.google.com/maps/search/?api=1&query=41.902800,12.496400');
  });
  it('il testo da condividere ha nome e link', () => {
    const p = { name: 'Campo Sole', lat: 41.9, lng: 12.5, url: null };
    expect(hasCoords(p)).toBe(true);
    expect(placeShareText(p)).toBe('📍 Campo Sole\nhttps://www.google.com/maps/search/?api=1&query=41.900000,12.500000');
  });
  it('il testo da condividere usa il link incollato, se c\'è', () => {
    const p = { name: 'Campo Sole', lat: null, lng: null, url: 'https://maps.app.goo.gl/abc123' };
    expect(hasPosition(p)).toBe(true);
    expect(placeShareText(p)).toBe('📍 Campo Sole\nhttps://maps.app.goo.gl/abc123');
    expect(hasPosition({ name: 'Campo', lat: null, lng: null, url: null })).toBe(false);
  });
  it('da un risultato di ricerca: nome breve con la città, massimo 80 caratteri', () => {
    expect(placeFromResult({ name: 'Campo Sole', display_name: 'Campo Sole, Via Roma, Latina, Lazio, Italia', lat: '41.46', lon: '12.9', address: { city: 'Latina' } }))
      .toEqual({ name: 'Campo Sole, Latina', lat: 41.46, lng: 12.9, url: null });
    expect(placeFromResult({ display_name: 'Via Roma 1, Latina', lat: 1, lon: 2 })?.name).toBe('Via Roma 1');
    expect(placeFromResult({ name: 'x'.repeat(200), lat: 1, lon: 2 })?.name).toHaveLength(80);
    expect(placeFromResult({ name: 'Boh', lat: 'abc', lon: 2 })).toBeNull();
  });
  it('legge i link di Google Maps, anche dentro un testo copiato', () => {
    expect(parseMapsLink('Campo Sole https://maps.app.goo.gl/AbC123xyz')).toEqual({ url: 'https://maps.app.goo.gl/AbC123xyz', lat: null, lng: null, name: null });
    const long = parseMapsLink('https://www.google.com/maps/place/Centro+Sportivo+Rossi/@41.4640,12.9040,17z/data=!3m1!4b1');
    expect(long).toMatchObject({ lat: 41.464, lng: 12.904, name: 'Centro Sportivo Rossi' });
    expect(parseMapsLink('https://www.google.com/maps/search/?api=1&query=41.5,12.9')).toMatchObject({ lat: 41.5, lng: 12.9 });
    expect(parseMapsLink('http://maps.google.it/maps?q=41.5,12.9')?.url.startsWith('https://')).toBe(true);
  });
  it('rifiuta quello che non è un link di Google Maps', () => {
    expect(parseMapsLink('Via Roma 12 Latina')).toBeNull();
    expect(parseMapsLink('https://example.com/maps/place/x')).toBeNull();
    expect(parseMapsLink('https://www.google.com/search?q=campo')).toBeNull();
    expect(parseMapsLink('https://evil.com/?https://maps.app.goo.gl/x')).toBeNull();
    expect(parseMapsLink('javascript:alert(1)')).toBeNull();
  });
});
