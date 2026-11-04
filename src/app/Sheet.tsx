// Pannello a tutto schermo con intestazione "‹ titolo" (si chiude con ‹ o Esc). Lo usano le voci del menu laterale.
import { useEffect, useRef, type ReactNode } from 'react';

export function Sheet({ title, onClose, children, id, swipeBack = true }: { title: string; onClose: () => void; children: ReactNode; id?: string; swipeBack?: boolean }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('keydown', k); window.clearTimeout(timer.current); };
  }, [onClose]);
  return (
    <div ref={sheet} className="sheet" role="dialog" aria-modal="true" aria-label={title} id={id}
      onTouchStart={(e) => {
        const t = e.touches[0];
        start.current = swipeBack && e.touches.length === 1 && t && t.clientX <= 32 ? { x: t.clientX, y: t.clientY } : null;
      }}
      onTouchMove={(e) => {
        const origin = start.current;
        const t = e.touches[0];
        if (!origin || !t || !sheet.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const dx = t.clientX - origin.x;
        const dy = Math.abs(t.clientY - origin.y);
        if (dx > 0 && dx > dy * 1.5) {
          sheet.current.style.transition = 'none';
          sheet.current.style.transform = `translateX(${dx}px)`;
        }
      }}
      onTouchEnd={(e) => {
        const origin = start.current;
        start.current = null;
        const t = e.changedTouches[0];
        if (!origin || !t) return;
        const dx = t.clientX - origin.x;
        const dy = Math.abs(t.clientY - origin.y);
        const success = dx >= 80 && dx > dy * 1.5;
        const el = sheet.current;
        if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { if (success) onClose(); return; }
        el.style.transition = 'transform 200ms ease-out';
        el.style.transform = success ? 'translateX(100%)' : 'translateX(0)';
        if (success) timer.current = window.setTimeout(onClose, 200);
      }}
      onTouchCancel={() => { start.current = null; if (sheet.current) { sheet.current.style.transition = 'transform 200ms ease-out'; sheet.current.style.transform = 'translateX(0)'; } }}>
      <div className="sheet-h">
        <button type="button" onClick={onClose} aria-label="Indietro">‹</button>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
      </div>
      <div className="sheet-b">{children}</div>
    </div>
  );
}
