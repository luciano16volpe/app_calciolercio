// Pannello a tutto schermo con intestazione "‹ titolo" (si chiude con ‹ o Esc). Lo usano le voci del menu laterale.
import { useEffect, type ReactNode } from 'react';

export function Sheet({ title, onClose, children, id }: { title: string; onClose: () => void; children: ReactNode; id?: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={title} id={id}>
      <div className="sheet-h">
        <button type="button" onClick={onClose} aria-label="Indietro">‹</button>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
      </div>
      <div className="sheet-b">{children}</div>
    </div>
  );
}
