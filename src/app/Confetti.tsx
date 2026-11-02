// Coriandoli che esplodono dal centro del riquadro in cui sono messi. Sono disegnati su un velo fisso a tutto schermo
// (non allarga mai la pagina), durano meno di 3 secondi, non bloccano i tocchi e non partono se chi usa il telefono ha chiesto meno animazioni.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const COLORS = ['#3a8fef', '#ffffff', '#f5c542', '#3aad5e', '#e05c4e', '#b794f6'];
const DURATION = 2800;

interface Piece { x: number; y: number; vx: number; vy: number; w: number; h: number; r: number; vr: number; color: string }

export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  const anchor = useRef<HTMLSpanElement>(null); // sta dentro il riquadro: da qui si sa da dove far partire i coriandoli

  useEffect(() => {
    const canvas = ref.current;
    const parent = anchor.current?.parentElement;
    if (!canvas || !parent) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      canvas.style.display = 'none';
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.scale(dpr, dpr);

    // un'esplosione dal centro del riquadro: verso l'alto e di lato, poi cadono
    const r0 = parent.getBoundingClientRect();
    const cx = r0.left + r0.width / 2;
    const cy = r0.top + r0.height * 0.45;
    const pieces: Piece[] = Array.from({ length: 130 }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.35;
      const speed = 5 + Math.random() * 9;
      return {
        x: cx + (Math.random() - 0.5) * 30, y: cy,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        w: 5 + Math.random() * 5, h: 3 + Math.random() * 4,
        r: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.4,
        color: COLORS[Math.floor(Math.random() * COLORS.length)] as string,
      };
    });
    const start = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      const fade = t < DURATION - 700 ? 1 : Math.max(0, (DURATION - t) / 700);
      for (const p of pieces) {
        p.vy += 0.3;
        p.vx *= 0.992;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (t < DURATION) raf = requestAnimationFrame(frame);
      else canvas.style.visibility = 'hidden';
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // il velo sta nel corpo della pagina (non dentro il riquadro: i riquadri sfocano lo sfondo e così il velo non coprirebbe tutto lo schermo)
  return (
    <>
      <span ref={anchor} style={{ display: 'none' }} />
      {createPortal(<canvas ref={ref} id="profile-confetti" aria-hidden="true" style={{ position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 120 }} />, document.body)}
    </>
  );
}
