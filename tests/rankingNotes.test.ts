import { describe, expect, it } from 'vitest';
import { rankingNote } from '../src/domain/rankingNotes';

describe('note delle classifiche', () => {
  it('descrive la vetta, i pari merito e il distacco con la metrica selezionata', () => {
    expect(rankingNote(5, 5, 'gol', true)).toBe('In testa alla classifica');
    expect(rankingNote(5, 5, 'gol', false)).toBe('Stessi gol della vetta');
    expect(rankingNote(4, 5, 'gol', false)).toBe('A 1 gol dalla vetta');
    expect(rankingNote(2, 5, 'assist', false)).toBe('A 3 assist dalla vetta');
  });
});
