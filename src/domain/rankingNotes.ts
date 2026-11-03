/** Descrive il distacco dal primo senza attribuire cambiamenti di posizione non verificati. */
export function rankingNote(value: number, leader: number, unit: 'gol' | 'assist', isFirst: boolean): string {
  if (isFirst) return 'In testa alla classifica';
  const gap = leader - value;
  if (gap === 0) return `Stessi ${unit} della vetta`;
  return `A ${gap} ${unit} dalla vetta`;
}
