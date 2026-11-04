// Pannello a tutto schermo con intestazione "‹ titolo" (si chiude con ‹ o Esc). Lo usano le voci del menu laterale.
import { useEffect, useRef, type ReactNode } from 'react';

export function Sheet({ title, onClose, children, id, swipeBack = true }: { title: string; onClose: () => void; children: ReactNode; id?: string; swipeBack?: boolean }) {
  const start = useRef<{ x: number; y: number; time: number } | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const close = useRef(onClose);
  const closing = useRef(false);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('keydown', k); window.clearTimeout(timer.current); };
  }, []);
  const finish = () => {
    if (!closing.current) return;
    closing.current = false;
    window.clearTimeout(timer.current);
    close.current();
  };
  return (
    <div ref={sheet} className="sheet" role="dialog" aria-modal="true" aria-label={title} id={id}
      onTouchStart={(e) => {
        if (closing.current) return;
        const t = e.touches[0];
        start.current = swipeBack && e.touches.length === 1 && t && t.clientX <= 32 ? { x: t.clientX, y: t.clientY, time: performance.now() } : null;
        if (start.current && sheet.current) sheet.current.style.willChange = 'transform';
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
        const el = sheet.current;
        const width = el?.offsetWidth ?? window.innerWidth;
        const success = dx >= 80 && dx > dy * 1.5;
        if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { if (success) close.current(); return; }
        const remaining = success ? Math.max(0, width - dx) : Math.max(0, dx);
        if (!remaining) { el.style.willChange = ''; if (success) close.current(); return; }
        const speed = Math.max(1.5, dx / Math.max(1, performance.now() - origin.time));
        const duration = Math.min(180, Math.max(50, remaining / speed));
        el.style.transition = `transform ${duration}ms ease-out`;
        el.style.transform = success ? 'translateX(100%)' : 'translateX(0)';
        if (success) {
          closing.current = true;
          timer.current = window.setTimeout(finish, duration + 50);
        }
      }}
      onTransitionEnd={(e) => {
        if (e.target !== e.currentTarget || e.propertyName !== 'transform') return;
        if (closing.current) finish();
        else e.currentTarget.style.willChange = '';
      }}
      onTouchCancel={() => { start.current = null; if (sheet.current) { sheet.current.style.transition = 'transform 150ms ease-out'; sheet.current.style.transform = 'translateX(0)'; sheet.current.style.willChange = ''; } }}>
      <div className="sheet-h">
        <button type="button" onClick={onClose} aria-label="Indietro">‹</button>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
      </div>
      <div className="sheet-b">{children}</div>
    </div>
  );
}
