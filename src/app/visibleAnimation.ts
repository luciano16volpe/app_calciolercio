import { observeElementVisibility } from './visibility';

/** One RAF loop, running only while the element is visible and motion is enabled. */
export function animateWhenVisible(element: Element, advance: () => void, draw: () => void) {
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let visible = false;
  let disposed = false;
  let frameId: number | undefined;
  const tick = () => {
    frameId = undefined;
    if (disposed || !visible || motion?.matches) return;
    advance();
    draw();
    frameId = requestAnimationFrame(tick);
  };
  const update = () => {
    if (frameId !== undefined) cancelAnimationFrame(frameId);
    frameId = undefined;
    if (!visible || disposed) return;
    draw();
    if (!motion?.matches) frameId = requestAnimationFrame(tick);
  };
  const stopObserving = observeElementVisibility(element, (next) => { visible = next; update(); });
  motion?.addEventListener('change', update);
  return () => {
    disposed = true;
    stopObserving();
    motion?.removeEventListener('change', update);
    if (frameId !== undefined) cancelAnimationFrame(frameId);
  };
}
