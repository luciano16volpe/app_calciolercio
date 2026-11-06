import { animateWhenVisible } from './visibleAnimation';
// Pioggia leggera sullo sfondo di un riquadro (il genitore deve essere `position: relative`): per la partita persa.
// Sta DIETRO al contenuto, non blocca i tocchi e si ferma da sola quando il riquadro non c'è più.
// Con «meno animazioni» attivo resta solo un'ombra fissa.
import { useEffect, useRef } from 'react';

interface Drop { x: number; y: number; len: number; speed: number; alpha: number }

export function Rain() {
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
    const drops: Drop[] = Array.from({ length: Math.max(24, Math.round(w / 8)) }, () => ({
      x: Math.random() * (w + 40), y: Math.random() * h, len: 8 + Math.random() * 12, speed: 3 + Math.random() * 3.5, alpha: 0.18 + Math.random() * 0.3,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1.3;
      ctx.lineCap = 'round';
      for (const d of drops) {
        ctx.strokeStyle = `rgba(120,150,195,${d.alpha})`;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.len * 0.28, d.y + d.len);
        ctx.stroke();
      }
    };
    return animateWhenVisible(canvas, () => {
      for (const d of drops) {
        d.y += d.speed;
        d.x -= d.speed * 0.28;
        if (d.y > h + 10) { d.y = -10 - Math.random() * 30; d.x = Math.random() * (w + 40); }
      }
    }, draw);
  }, []);

  return <canvas ref={ref} id="rain-fx" aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0, borderRadius: 'inherit' }} />;
}
