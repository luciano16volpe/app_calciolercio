import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../app/Toast';
import { managePlayerPhoto, uploadPlayerPhoto } from '../../data/playerPhotos';
import { LEAGUE_QUERY_KEY, photoUrl, type LeagueData } from '../../data/queries';

export function PlayerPhotoGallery({ data, playerId, name, canManage, onClose }: {
  data: LeagueData; playerId: string; name: string; canManage: boolean; onClose: () => void;
}) {
  const active = data.photos[playerId] ?? null;
  const gallery = data.photoGalleries?.[playerId] ?? (active ? [active] : []);
  const [selected, setSelected] = useState<string | null>(active ?? gallery[0] ?? null);
  const current = selected && gallery.includes(selected) ? selected : active ?? gallery[0] ?? null;
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const action = useRef<'add' | 'replace'>('add');
  const qc = useQueryClient();
  const toast = useToast();
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopImmediatePropagation(); onClose(); }
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, [onClose]);
  const refresh = () => qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY });
  const mutate = async (operation: 'select' | 'remove') => {
    if (!current || busy) return;
    setBusy(true);
    try {
      await managePlayerPhoto(playerId, operation, current);
      await refresh();
      if (operation === 'remove') setSelected(gallery.find((path) => path !== current) ?? null);
      toast(operation === 'select' ? 'Foto principale aggiornata' : 'Foto rimossa');
    } catch (error) { toast('Errore: ' + (error as Error).message); }
    finally { setBusy(false); }
  };
  const onFile = async (input: File | undefined) => {
    if (!input || busy) return;
    setBusy(true);
    try {
      const path = await uploadPlayerPhoto(playerId, input, action.current, action.current === 'replace' ? current ?? undefined : undefined);
      await refresh();
      setSelected(path);
      toast(action.current === 'add' ? 'Foto aggiunta' : 'Foto sostituita');
    } catch (error) { toast('Errore: ' + (error as Error).message); }
    finally { setBusy(false); }
  };
  const chooseFile = (next: 'add' | 'replace') => { action.current = next; file.current?.click(); };
  return <div role="dialog" aria-modal="true" aria-label={`Foto di ${name}`} style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div style={{ width: '100%', maxWidth: 440, maxHeight: '95dvh', overflowY: 'auto', background: 'var(--gray)', borderRadius: 'var(--radius)', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><strong>{name} · Foto {gallery.length}/3</strong><button type="button" className="btn btn-secondary btn-sm" onClick={onClose} aria-label="Chiudi foto">✕</button></div>
      {current ? <img src={photoUrl(current) ?? undefined} alt={`Foto di ${name}`} style={{ width: '100%', maxHeight: '55dvh', aspectRatio: '1', objectFit: 'contain', background: '#111', borderRadius: 12 }} />
        : <p style={{ textAlign: 'center', padding: 30 }}>Nessuna foto caricata</p>}
      {gallery.length > 0 ? <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
        {gallery.map((path, index) => <button type="button" key={path} aria-label={`Mostra foto ${index + 1}${path === active ? ', principale' : ''}`} aria-pressed={path === current} onClick={() => setSelected(path)} style={{ border: path === current ? '3px solid var(--amber)' : '2px solid transparent', borderRadius: 10, padding: 0, background: 'none', cursor: 'pointer' }}>
          <img src={photoUrl(path) ?? undefined} alt="" style={{ display: 'block', width: 66, height: 66, objectFit: 'cover', borderRadius: 7 }} />
        </button>)}
      </div> : null}
      {canManage ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 16 }}>
        {gallery.length < 3 ? <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => chooseFile('add')}>＋ Aggiungi foto</button> : null}
        {current ? <>
          {current !== active ? <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void mutate('select')}>Usa come principale</button> : <span style={{ alignSelf: 'center', fontSize: 12 }}>Foto principale</span>}
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => chooseFile('replace')}>Cambia</button>
          <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => void mutate('remove')}>Rimuovi</button>
        </> : null}
        <input ref={file} type="file" accept="image/*" style={{ display: 'none' }} onChange={(event) => { const input = event.target.files?.[0]; event.target.value = ''; void onFile(input); }} />
      </div> : null}
      {canManage && gallery.length === 3 ? <small style={{ display: 'block', marginTop: 10, textAlign: 'center' }}>Limite raggiunto: sostituisci o rimuovi una foto per aggiungerne un'altra.</small> : null}
    </div>
  </div>;
}
