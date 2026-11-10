// Campo «Luogo»: si scrive il nome e, per poterlo condividere, si aggiunge la posizione:
//  · incollando il link di Google Maps (Condividi → Copia link), che funziona per qualsiasi luogo;
//  · oppure cercandolo su OpenStreetMap (gratis, ma conosce meno campetti e numeri civici).
// Un luogo scritto a mano resta valido, senza posizione.
import { useRef, useState, type CSSProperties } from 'react';
import { searchPlaces } from '../../data/geocode';
import { hasPosition, parseMapsLink, type PlaceValue } from '../../domain/place';

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
  const [pasting, setPasting] = useState(false);
  const [linkError, setLinkError] = useState('');
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
      if (!found.length) setError(value.name.trim().length < 3 ? 'Scrivi almeno 3 lettere.' : 'Nessun luogo trovato: cerca il campo su Google Maps e incolla il link.');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError('Ricerca non disponibile: incolla il link di Google Maps o scrivi il luogo a mano.');
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  };

  const takeLink = (text: string) => {
    const link = parseMapsLink(text);
    if (!link) {
      setLinkError(text.trim() ? 'Questo non sembra un link di Google Maps.' : '');
      return;
    }
    setLinkError('');
    setPasting(false);
    setResults(null);
    setError('');
    onChange({ name: value.name.trim() ? value.name : (link.name ?? ''), lat: link.lat, lng: link.lng, url: link.url });
  };

  return (
    <div className="place-field">
      <input type="text" id={inputId} aria-label={ariaLabel} maxLength={80} placeholder={placeholder} value={value.name}
        onChange={(e) => {
          setResults(null);
          setError('');
          // il link incollato resta; le coordinate di una ricerca valgono per quel nome, non per un testo cambiato
          onChange(value.url ? { ...value, name: e.target.value } : { name: e.target.value, lat: null, lng: null, url: null });
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void search(); } }}
        style={{ ...style, fontSize: 16 }} />
      {hasPosition(value) ? (
        <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 700 }} className="place-ok">
          📍 Posizione salvata
          <button type="button" style={{ ...small, marginLeft: 8, color: 'var(--text2)' }} onClick={() => onChange({ ...value, lat: null, lng: null, url: null })}>Togli posizione</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <button type="button" className="place-paste" style={small} onClick={() => { setPasting((v) => !v); setLinkError(''); }}>🔗 Incolla link di Google Maps</button>
          <button type="button" className="place-search" style={{ ...small, color: 'var(--text2)' }} disabled={busy} onClick={() => void search()}>{busy ? 'Cerco…' : '🔎 Cerca su mappa'}</button>
        </div>
      )}
      {pasting && !hasPosition(value) ? (
        <div className="place-link" style={{ display: 'grid', gap: 4 }}>
          <input type="text" aria-label="Link di Google Maps" placeholder="Incolla qui il link" autoComplete="off" autoCapitalize="off" spellCheck={false}
            onChange={(e) => takeLink(e.target.value)} style={{ ...style, fontSize: 16 }} />
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>In Google Maps cerca il campo, tocca <b>Condividi</b> e poi <b>Copia link</b>.</div>
          {linkError ? <div role="status" style={{ fontSize: 12, color: 'var(--red)' }}>{linkError}</div> : null}
        </div>
      ) : null}
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
