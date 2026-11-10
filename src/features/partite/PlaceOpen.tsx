// «📍 Apri posizione»: apre il luogo nell'app delle mappe del telefono (Google Maps o Mappe), senza condividere nulla.
import { hasPosition, mapsUrl, hasCoords, type PlaceValue } from '../../domain/place';

export function PlaceOpen({ place }: { place: PlaceValue }) {
  if (!hasPosition(place)) return null;
  const href = place.url ?? (hasCoords(place) ? mapsUrl(place.lat, place.lng) : '');
  if (!href) return null;
  return (
    <a id="open-place" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none', display: 'inline-block' }}
      href={href} target="_blank" rel="noopener noreferrer">
      📍 Apri posizione
    </a>
  );
}
