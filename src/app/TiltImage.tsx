// Figurina "viva": la luce e l'inclinazione seguono il dito oppure (se il telefono lo permette) l'inclinazione del telefono.
// È solo un effetto a schermo: il file che si condivide o si salva resta l'immagine normale.
import { useEffect, useRef, useState, type PointerEvent } from 'react';

const MAX_TILT = 10; // gradi
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

type OrientationCtor = { requestPermission?: () => Promise<'granted' | 'denied'> };
const orientationApi = (): OrientationCtor | null => (typeof DeviceOrientationEvent !== 'undefined' ? (DeviceOrientationEvent as unknown as OrientationCtor) : null);

/** Posizione della luce: x e y da 0 a 1 (0,5 = al centro). */
type Spot = { x: number; y: number };

/** Inclinazione del telefono: su iPhone serve un permesso da chiedere con un tocco; su Android parte da sola. */
export function useGyro(active: boolean) {
  const [needsPermission, setNeedsPermission] = useState(false);
  const [granted, setGranted] = useState(false);
  const listeners = useRef(new Set<(s: Spot) => void>());
  useEffect(() => {
    if (!active || reducedMotion() || !orientationApi()) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dipende dal telefono: si sa solo a schermata aperta
    if (typeof orientationApi()?.requestPermission === 'function') setNeedsPermission(true);
    else setGranted(true);
  }, [active]);
  useEffect(() => {
    if (!granted) return;
    let base: { b: number; g: number } | null = null;
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      base ??= { b: e.beta, g: e.gamma };
      const clamp = (v: number) => Math.max(0, Math.min(1, v));
      const spot = { x: clamp(0.5 + (e.gamma - base.g) / 50), y: clamp(0.5 + (e.beta - base.b) / 50) };
      listeners.current.forEach((fn) => fn(spot));
    };
    window.addEventListener('deviceorientation', onTilt);
    return () => window.removeEventListener('deviceorientation', onTilt);
  }, [granted]);
  const enable = async () => {
    try {
      const result = await orientationApi()?.requestPermission?.();
      if (result === 'granted') setGranted(true);
    } catch {
      /* permesso negato: resta il dito */
    }
    setNeedsPermission(false);
  };
  const subscribe = (fn: (s: Spot) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  };
  return { needsPermission, enable, subscribe };
}

export function TiltImage({ url, alt, holo, subscribe }: { url: string; alt: string; holo: boolean; subscribe: (fn: (s: Spot) => void) => () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const touching = useRef(false);
  const moved = useRef(false);
  const start = useRef({ x: 0, y: 0 });

  const apply = (s: Spot, live: boolean) => {
    const el = box.current;
    if (!el) return;
    el.classList.toggle('live', live);
    el.style.setProperty('--rx', `${(0.5 - s.y) * 2 * MAX_TILT}deg`);
    el.style.setProperty('--ry', `${(s.x - 0.5) * 2 * MAX_TILT}deg`);
    el.style.setProperty('--mx', `${s.x * 100}%`);
    el.style.setProperty('--my', `${s.y * 100}%`);
  };
  useEffect(() => subscribe((s) => { if (!touching.current) apply(s, true); }), [subscribe]);

  const spotOf = (e: PointerEvent<HTMLDivElement>): Spot => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
  };
  if (reducedMotion()) return <img src={url} alt={alt} decoding="async" />;
  return (
    <div ref={box} className={`tilt-card${holo ? ' holo' : ''}`}
      onPointerDown={(e) => {
        touching.current = true;
        moved.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
        apply(spotOf(e), true);
      }}
      onPointerMove={(e) => {
        if (!touching.current) return;
        if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 6) moved.current = true;
        apply(spotOf(e), true);
      }}
      onPointerUp={() => { touching.current = false; apply({ x: 0.5, y: 0.5 }, false); }}
      onPointerCancel={() => { touching.current = false; apply({ x: 0.5, y: 0.5 }, false); }}
      // dopo un trascinamento il «tocco» non deve ingrandire l'immagine
      onClickCapture={(e) => { if (moved.current) { moved.current = false; e.stopPropagation(); } }}
    >
      <img src={url} alt={alt} decoding="async" draggable={false} />
      <div className="tilt-shine" style={{ WebkitMaskImage: `url(${url})`, maskImage: `url(${url})` }} />
    </div>
  );
}
