export function FireChip({ state }: { state: 'up' | 'flat' | 'down' | null }) {
  if (state === 'up') return <span className="fire-chip" title="In forma: le ultime pagelle sono sopra la sua media">🔥</span>;
  if (state === 'down') return <span className="fire-chip crisi-chip" title="In crisi: le ultime pagelle sono sotto la sua media">🌧️</span>;
  return null;
}
