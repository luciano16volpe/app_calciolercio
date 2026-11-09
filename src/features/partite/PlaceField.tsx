// Campo «Luogo»: si scrive il nome e, volendo, si cerca su una mappa (OpenStreetMap) per avere la posizione vera,
// da condividere con gli amici. Un luogo scritto a mano resta valido, senza posizione.
import { useRef, useState, type CSSProperties } from 'react';
import { searchPlaces } from '../../data/geocode';
import { hasCoords, type PlaceValue } from '../../domain/place';

const small: CSSProperties = { border: 'none', background: 'none', color: 'var(--blue)', font: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '6px 0' };

export function PlaceField({ value, onChange, inputId, ariaLabel, style, placeholder }: {
  value: PlaceValue;
  onChange: (p: PlaceValue) => void;
  inputId?: string;
  ariaLabel?: string;
  style?: CSSProperties;
  placeholder?: string;
}) {
  const [results, setResults] = useState<PlaceValue[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ctrl = useRef<AbortController | null>(null);

  const search = async () => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setBusy(true);
    setError('');
    try {
      const found = await searchPlaces(value.name, c.signal);
      if (c.signal.aborted) return;
      setResults(found);
      if (!found.length) setError(value.name.trim().length < 3 ? 'Scrivi almeno 3 lettere.' : 'Nessun luogo trovato: prova con il nome e la città.');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError('Ricerca non disponibile: puoi scrivere il luogo a mano.');
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  };

  return (
    <div className="place-field">
      <input type="text" id={inputId} aria-label={ariaLabel} maxLength={80} placeholder={placeholder} value={value.name}
        onChange={(e) => { setResults(null); setError(''); onChange({ name: e.target.value, lat: null, lng: null }); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void search(); } }}
        style={{ ...style, fontSize: 16 }} />
      {hasCoords(value) ? (
        <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 700 }} className="place-ok">
          📍 Posizione su mappa trovata
          <button type="button" style={{ ...small, marginLeft: 8, color: 'var(--text2)' }} onClick={() => onChange({ ...value, lat: null, lng: null })}>Togli posizione</button>
        </div>
      ) : (
        <button type="button" className="place-search" style={small} disabled={busy} onClick={() => void search()}>{busy ? 'Cerco…' : '🔎 Cerca su mappa'}</button>
      )}
      {error ? <div role="status" style={{ fontSize: 12, color: 'var(--text2)' }}>{error}</div> : null}
      {results?.length ? (
        <div className="place-results" role="listbox" aria-label="Luoghi trovati" style={{ display: 'grid', gap: 4, marginTop: 4 }}>
          {results.map((r) => (
            <button type="button" role="option" aria-selected={false} key={r.name + r.lat} className="place-result"
              style={{ textAlign: 'left', border: '1px solid var(--gray3)', borderRadius: 8, background: 'var(--gray)', color: 'var(--text)', font: 'inherit', fontSize: 14, padding: '8px 10px', cursor: 'pointer' }}
              onClick={() => { onChange(r); setResults(null); setError(''); }}>
              📍 {r.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

