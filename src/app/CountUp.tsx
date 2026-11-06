// Numero che sale contando fino al valore (una volta, quando compare). Senza animazione se il telefono la riduce.
import { useEffect, useRef } from 'react';

export function CountUp({ value, duration = 650 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = ref.current?.firstChild;
    if (!node || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t0 = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      node.nodeValue = String(Math.round(value * (1 - (1 - k) ** 3))); // rallenta verso la fine
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      node.nodeValue = String(value);
    };
  }, [value, duration]);
  return <span ref={ref}>{value}</span>;
}
