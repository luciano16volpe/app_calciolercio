import { useEffect, useRef, useState } from 'react';

/** Visibility includes scroll containers, hidden pages and the browser background state. */
export function observeElementVisibility(element: Element, onChange: (visible: boolean) => void, { rootMargin = '0px', once = false }: { rootMargin?: string; once?: boolean } = {}) {
  let inView = false;
  let stopped = false;
  let observer: IntersectionObserver | undefined;
  const emit = () => {
    if (stopped) return;
    const active = inView && document.visibilityState !== 'hidden';
    onChange(active);
    if (active && once) stop();
  };
  function stop() {
    if (stopped) return;
    stopped = true;
    observer?.disconnect();
    document.removeEventListener('visibilitychange', emit);
  }
  document.addEventListener('visibilitychange', emit);
  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver((entries) => {
      const entry = entries.find((entry) => entry.target === element);
      if (!entry) return;
      inView = entry.isIntersecting;
      emit();
    }, { rootMargin });
    observer.observe(element);
  } else {
    // Older browsers keep the existing eager behavior.
    inView = true;
    emit();
  }
  return stop;
}

export function useElementVisibility<T extends Element>({ rootMargin = '0px', once = false, enabled = true }: { rootMargin?: string; once?: boolean; enabled?: boolean } = {}) {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!enabled || !ref.current) return;
    return observeElementVisibility(ref.current, setVisible, { rootMargin, once });
  }, [enabled, rootMargin, once]);
  return { ref, visible: enabled && visible };
}
