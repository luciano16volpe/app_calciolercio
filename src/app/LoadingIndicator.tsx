import { createContext, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from 'react';

const LoadingContext = createContext<(() => () => void) | null>(null);
/** Multiple pending components share one viewport-centred indicator. */
export function LoadingProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState(0);
  const register = useCallback(() => {
    setPending((n) => n + 1);
    return () => setPending((n) => Math.max(0, n - 1));
  }, []);
  return <LoadingContext.Provider value={register}>
    {children}
    {pending > 0 ? <div className="app-loading" role="status" aria-label="Caricamento" id="app-loading"><span className="app-spinner" aria-hidden="true" /></div> : null}
  </LoadingContext.Provider>;
}
export function LoadingIndicator() {
  const register = useContext(LoadingContext);
  useLayoutEffect(() => register?.(), [register]);
  return null;
}
