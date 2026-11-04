// Pannello a tutto schermo con intestazione "‹ titolo" (si chiude con ‹ o Esc). Lo usano le voci del menu laterale.
import { useEffect, useRef, type ReactNode } from 'react';

export function Sheet({ title, onClose, children, id, swipeBack = false }: { title: string; onClose: () => void; children: ReactNode; id?: string; swipeBack?: boolean }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={title} id={id}
      onTouchStart={(e) => {
        const t = e.touches[0];
        start.current = swipeBack && e.touches.length === 1 && t && t.clientX <= 32 ? { x: t.clientX, y: t.clientY } : null;
      }}
      onTouchEnd={(e) => {
        const origin = start.current;
        start.current = null;
        const t = e.changedTouches[0];
        if (!origin || !t) return;
        const dx = t.clientX - origin.x;
        const dy = Math.abs(t.clientY - origin.y);
        if (dx >= 80 && dx > dy * 1.5) onClose();
      }}
      onTouchCancel={() => { start.current = null; }}>
      <div className="sheet-h">
        <button type="button" onClick={onClose} aria-label="Indietro">‹</button>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
      </div>
      <div className="sheet-b">{children}</div>
    </div>
  );
}
