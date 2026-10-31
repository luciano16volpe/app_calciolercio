// Le 4 schede in basso: Rosa · Gioca · Partite · Classifiche (icone e stile come legacy).
import type { ReactNode } from 'react';

export type PageName = 'rosa' | 'partita' | 'partite' | 'classifiche' | 'settings';

const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const ITEMS: Array<{ id: Exclude<PageName, 'settings'>; label: string; icon: ReactNode }> = [
  {
    id: 'rosa',
    label: 'Rosa',
    icon: svg(
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>,
    ),
  },
  {
    id: 'partita',
    label: 'Gioca',
    icon: svg(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5l4.3 3.1-1.6 5H9.3l-1.6-5z" />
        <path d="M12 3v4.5M4.5 9.3l3.2 1.3M6.9 18.5l2.4-3.5M17.1 18.5l-2.4-3.5M19.5 9.3l-3.2 1.3" />
      </>,
    ),
  },
  {
    id: 'partite',
    label: 'Partite',
    icon: svg(
      <>
        <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
        <path d="M3 9.5h18" />
        <path d="M8 2.5v4" />
        <path d="M16 2.5v4" />
        <path d="M8 14h3" />
      </>,
    ),
  },
  {
    id: 'classifiche',
    label: 'Classifiche',
    icon: svg(
      <>
        <path d="M8 21h8" />
        <path d="M12 17v4" />
        <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
        <path d="M17 5h3v2a3 3 0 0 1-3 3" />
        <path d="M7 5H4v2a3 3 0 0 0 3 3" />
      </>,
    ),
  },
];

export function BottomNav({ page, onGo }: { page: PageName; onGo: (p: PageName) => void }) {
  return (
    <nav className="bottom-nav">
      {ITEMS.map((it) => (
        <button key={it.id} className={`bnav-item${page === it.id ? ' active' : ''}`} onClick={() => onGo(it.id)}>
          <span className="bni">{it.icon}</span>
          {it.label}
        </button>
      ))}
    </nav>
  );
}
