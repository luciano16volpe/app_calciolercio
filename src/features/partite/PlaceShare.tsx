// «📍 Condividi posizione»: manda agli amici il nome del luogo e il link a Google Maps.
import { useToast } from '../../app/Toast';
import { hasPosition, placeShareText, type PlaceValue } from '../../domain/place';
import { shareText } from '../menu/LeagueSheets';

/** `compact`: nella fila dei pulsanti sotto una partita (stesso stile degli altri, senza id). */
export function PlaceShare({ place, noMargin = false, compact = false }: { place: PlaceValue; noMargin?: boolean; compact?: boolean }) {
  const toast = useToast();
  if (!hasPosition(place)) return null;
  return (
    <button type="button" id={compact ? undefined : 'share-place'} className={compact ? 'btn btn-secondary btn-sm mbar-btn place-share' : 'btn btn-secondary'} style={compact ? undefined : { fontSize: 13, padding: '6px 12px', marginLeft: noMargin ? 0 : 8 }}
      onClick={() => void shareText(placeShareText(place), (m) => toast(m === 'Messaggio copiato' ? 'Posizione copiata' : m), 'Luogo della partita')}>
      📍 Condividi posizione
    </button>
  );
}
