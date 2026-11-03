// Palloni di calcio che cadono piano dall'alto verso il basso sullo sfondo di un riquadro (il genitore deve essere `position: relative`).
// Come la pioggia e i coriandoli: stanno DIETRO al contenuto, restano nel riquadro, non bloccano i tocchi e si fermano da soli
// quando il riquadro non c'è più. Con «meno animazioni» attivo restano fermi. Sono disegnati (non emoji): uguali su iPhone e Android.
import { useEffect, useRef } from 'react';

interface Ball { x: number; y: number; r: number; vy: number; sway: number; phase: number; rot: number; vr: number; alpha: number }

/** Un pallone bianco con contorno scuro e i classici pentagoni neri, centrato in (0,0). */
function drawBall(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.09);
  ctx.strokeStyle = 'rgba(38,48,70,0.9)';
  ctx.stroke();
  // pentagono centrale
  const poly = (cx: number, cy: number, rad: number, a0: number) => {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = a0 + (i * 2 * Math.PI) / 5;
      const px = cx + Math.cos(a) * rad;
      const py = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  };
  ctx.fillStyle = 'rgba(30,38,55,0.95)';
  poly(0, 0, r * 0.38, -Math.PI / 2);
  ctx.fill();
  // cuciture dal pentagono al bordo e cinque macchie sul bordo
  ctx.lineWidth = Math.max(0.8, r * 0.07);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.38, Math.sin(a) * r * 0.38);
    ctx.lineTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72);
    ctx.stroke();
    const b = a + Math.PI / 5;
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();
    poly(Math.cos(b) * r * 1.0, Math.sin(b) * r * 1.0, r * 0.3, b + Math.PI);
    ctx.fill();
    ctx.restore();
  }
}

/** Tema scuro attivo? Vale la scelta nelle Impostazioni (data-theme), altrimenti quella del telefono. */
function isDark(): boolean {
  const t = document.documentElement.getAttribute('data-theme');
  return t === 'dark' || (t !== 'light' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches);
}

export function Palloni() {
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
    const make = (y: number): Ball => ({
      x: Math.random() * w, y, r: 7 + Math.random() * 7, vy: 0.45 + Math.random() * 0.9, sway: 0.12 + Math.random() * 0.25,
      phase: Math.random() * Math.PI * 2, rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.05, alpha: 0.32 + Math.random() * 0.2,
    });
    // pochi palloni, sparsi: lo sfondo resta leggero e il testo leggibile
    const balls: Ball[] = Array.from({ length: Math.max(5, Math.min(12, Math.round(w / 40))) }, () => make(Math.random() * h));
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      // nel tema chiaro il bianco e il contorno scuro si vedono molto di più: palloni più trasparenti e un po' più piccoli
      const light = !isDark();
      for (const b of balls) {
        ctx.save();
        ctx.globalAlpha = b.alpha * (light ? 0.55 : 1);
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        drawBall(ctx, b.r * (light ? 0.82 : 1));
        ctx.restore();
      }
    };
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      draw();
      return;
    }
    let raf = 0;
    const frame = () => {
      for (const b of balls) {
        b.y += b.vy;
        b.phase += 0.02;
        b.x += Math.sin(b.phase) * b.sway;
        b.rot += b.vr;
        if (b.y - b.r > h) Object.assign(b, make(-b.r - Math.random() * 40)); // uscito in basso: riparte dall'alto in un punto nuovo
      }
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} id="recent-balls-fx" aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0, borderRadius: 'inherit' }} />;
}
