export type AdminIconName = 'shield' | 'plus' | 'settings' | 'audit' | 'leagues' | 'users' | 'premium' | 'link' | 'hand' | 'bench' | 'merge';
const paths: Record<AdminIconName, string> = {
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
  hand: 'M8 13V5a2 2 0 0 1 4 0v7 M12 10V4a2 2 0 0 1 4 0v8 M16 10V7a2 2 0 0 1 4 0v9a6 6 0 0 1-6 6h-2c-2 0-3-1-4-3l-4-6a2 2 0 0 1 3-2l1 2',
  bench: 'M3 5h18v7H3V5Z M2 16h20 M5 12v9 M19 12v9',
  merge: 'M5 3v4c0 5 7 4 7 9v5 M19 3v4c0 5-7 4-7 9 M8 17l4 4 4-4',
  shield: 'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Z M8 12l3 3 5-6',
  plus: 'M12 4v16 M4 12h16',
  settings: 'M4 6h6 M14 6h6 M4 12h10 M18 12h2 M4 18h2 M10 18h10 M10 3v6 M14 9v6 M6 15v6',
  audit: 'M8 4H5v17h14V4h-3 M8 3h8v4H8V3Z M8 12h8 M8 16h5',
  leagues: 'M3 5h18v14H3V5Z M12 5v14 M3 9h4v6H3 M21 9h-4v6h4 M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  users: 'M15 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M20 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75 M12 7a4 4 0 1 0-8 0 4 4 0 0 0 8 0',
  premium: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z',
};
export function AdminIcon({ name }: { name: AdminIconName }) {
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}
