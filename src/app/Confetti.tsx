// Coriandoli sullo sfondo di un riquadro (il genitore deve essere `position: relative`): per la partita vinta.
// Come la pioggia: stanno DIETRO al contenuto, restano nel riquadro, cadono in continuazione, non bloccano i tocchi
// e si fermano da soli quando il riquadro non c'è più. Con «meno animazioni» restano fermi.
import { useEffect, useRef } from 'react';

const COLORS = ['#3a8fef', '#ffffff', '#f5c542', '#3aad5e', '#e05c4e', '#b794f6'];

interface Piece { x: number; y: number; vy: number; sway: number; phase: number; w: number; h: number; r: number; vr: number; color: string }

export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.scale(dpr, dpr);
    const make = (y: number): Piece => ({
      x: Math.random() * w, y, vy: 0.8 + Math.random() * 1.4, sway: 0.4 + Math.random() * 0.8, phase: Math.random() * Math.PI * 2,
      w: 5 + Math.random() * 5, h: 3 + Math.random() * 4, r: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.12,
      color: COLORS[Math.floor(Math.random() * COLORS.length)] as string,
    });
    const pieces: Piece[] = Array.from({ length: Math.max(28, Math.round(w / 7)) }, () => make(Math.random() * h));
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of pieces) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
    };
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      draw();
      return;
    }
    let raf = 0;
    const frame = () => {
      for (const p of pieces) {
        p.y += p.vy;
        p.phase += 0.04;
        p.x += Math.sin(p.phase) * p.sway;
        p.r += p.vr;
        if (p.y > h + 10) Object.assign(p, make(-10 - Math.random() * 30));
      }
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} id="profile-confetti" aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0, borderRadius: 'inherit' }} />;
}
