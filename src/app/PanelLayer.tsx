import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Keep the back destination painted beneath a sliding panel, without making it interactive. */
export function PanelLayer({ active, children }: { active: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (active) ref.current?.querySelector('.sheet-b')?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [active]);
  return <div ref={ref} inert={!active} aria-hidden={!active || undefined}>{children}</div>;
}
