// Ricarica i dati tirando la pagina verso il basso (telefono). Sul computer si ricarica con F5.
// Parte solo se la pagina è in cima, il gesto è verticale e non c'è una finestra aperta sopra.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useToast } from './Toast';

const TRIGGER = 70; // quanto tirare (px) perché si ricarichi
const MAX = 110;
const BLOCKED = '#menu-drawer, .sheet, #match-modal, #app-modal, #img-viewer, .pchip, input, textarea, select';

type Phase = 'idle' | 'pull' | 'ready' | 'loading';

export function PullToRefresh() {
  const qc = useQueryClient();
  const toast = useToast();
  const [dist, setDist] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const state = useRef<{ x: number; y: number; on: boolean; d: number }>({ x: 0, y: 0, on: false, d: 0 });
  const busy = useRef(false);

  useEffect(() => {
    const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      const target = e.target as Element | null;
      if (busy.current || e.touches.length !== 1 || !t || !atTop() || target?.closest?.(BLOCKED)) {
        state.current.on = false;
        return;
      }
      state.current = { x: t.clientX, y: t.clientY, on: true, d: 0 };
    };
    const move = (e: TouchEvent) => {
      const s = state.current;
      const t = e.touches[0];
      if (!s.on || !t) return;
      const dy = t.clientY - s.y;
      const dx = t.clientX - s.x;
      if (s.d === 0) {
        // gesto non ancora riconosciuto: verso l'alto o di lato è una scorsa normale
        if (dy < 0 || Math.abs(dx) > Math.abs(dy)) {
          s.on = false;
          return;
        }
        if (dy < 10) return;
      }
      if (!atTop() && s.d === 0) {
        s.on = false;
        return;
      }
      const d = Math.min(MAX, dy * 0.5);
      s.d = d;
      if (e.cancelable) e.preventDefault(); // niente rimbalzo del browser mentre si tira
      setDist(d);
      setPhase(d >= TRIGGER ? 'ready' : 'pull');
    };
    const end = () => {
      const s = state.current;
      if (!s.on) return;
      s.on = false;
      const was = s.d;
      s.d = 0;
      if (was >= TRIGGER && !busy.current) {
        busy.current = true;
        setPhase('loading');
        setDist(48);
        const t0 = Date.now();
        void qc.invalidateQueries().finally(() => {
          window.setTimeout(() => {
            busy.current = false;
            setPhase('idle');
            setDist(0);
            toast('✓ Aggiornato');
          }, Math.max(0, 600 - (Date.now() - t0)));
        });
      } else {
        setPhase('idle');
        setDist(0);
      }
    };
    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', end);
    return () => {
      document.removeEventListener('touchstart', start);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', end);
    };
  }, [qc, toast]);

  if (phase === 'idle') return null;
  return (
    <div
      id="ptr"
      aria-live="polite"
      style={{
        position: 'fixed', top: 'env(safe-area-inset-top, 0px)', left: 0, right: 0, zIndex: 300, display: 'flex', justifyContent: 'center',
        pointerEvents: 'none', transform: `translateY(${dist - 44}px)`, transition: phase === 'loading' ? 'transform .2s' : 'none',
      }}
    >
      <div className="card" style={{ margin: 0, padding: '7px 14px', fontSize: 12, fontWeight: 800, color: 'var(--text2)', boxShadow: 'var(--shadow)' }}>
        {phase === 'loading' ? '⏳ Aggiorno…' : phase === 'ready' ? '⬆︎ Rilascia per aggiornare' : '⬇︎ Tira per aggiornare'}
      </div>
    </div>
  );
}
