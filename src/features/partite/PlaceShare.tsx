// «📍 Condividi posizione»: manda agli amici il nome del luogo e il link a Google Maps.
import { useToast } from '../../app/Toast';
import { hasPosition, placeShareText, type PlaceValue } from '../../domain/place';
import { shareText } from '../menu/LeagueSheets';

export function PlaceShare({ place, noMargin = false }: { place: PlaceValue; noMargin?: boolean }) {
  const toast = useToast();
  if (!hasPosition(place)) return null;
  return (
    <button type="button" id="share-place" className="btn btn-secondary" style={{ fontSize: 13, padding: '6px 12px', marginLeft: noMargin ? 0 : 8 }}
      onClick={() => void shareText(placeShareText(place), (m) => toast(m === 'Messaggio copiato' ? 'Posizione copiata' : m), 'Luogo della partita')}>
      📍 Condividi posizione
    </button>
  );
}
