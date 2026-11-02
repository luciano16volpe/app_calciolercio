// Aspetto dell'app: automatico (come il telefono), chiaro o scuro. Si ricorda sul telefono.
export type Theme = 'auto' | 'light' | 'dark';
const KEY = 'calciolercio-theme';
const BAR = { light: '#1a4a8f', dark: '#141b28' } as const;

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'auto';
  } catch {
    return 'auto';
  }
}

/** Mette l'aspetto scelto sulla pagina (senza scelta vale quello del telefono). */
export function applyTheme(t: Theme): void {
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
  const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? BAR.dark : BAR.light);
}

export function setTheme(t: Theme): void {
  try {
    if (t === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    /* senza memoria il cambio vale solo finché l'app è aperta */
  }
  applyTheme(t);
}
