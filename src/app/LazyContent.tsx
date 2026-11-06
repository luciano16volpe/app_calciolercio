import { scrollPageToTop } from './scroll';
import { LoadingIndicator } from './LoadingIndicator';
import { Component, Suspense, useLayoutEffect, useState, type ReactNode } from 'react';

class SectionError extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="card" role="alert">Non riesco ad aprire questa sezione. Controlla la connessione.
      <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>Ricarica</button>
    </div>;
    return this.props.children;
  }
}
export function LazyContent({ children }: { children: ReactNode }) {
  return <SectionError><Suspense fallback={<LoadingIndicator />}>{children}</Suspense></SectionError>;
}
function PageStart({ active, children }: { active: boolean; children: ReactNode }) {
  useLayoutEffect(() => { if (active) scrollPageToTop(); }, [active]);
  return children;
}
/** Mount on first visit, then retain local selections and drafts between tabs. */
export function DeferredPage({ active, children }: { active: boolean; children: ReactNode }) {
  const [visited, setVisited] = useState(active);
  if (active && !visited) setVisited(true);
  return visited || active ? <LazyContent><PageStart active={active}>{children}</PageStart></LazyContent> : null;
}
