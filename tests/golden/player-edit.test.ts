// Test golden (passo 3.7d): modifica di un giocatore — statistiche scritte a mano e ruoli, come legacy (upStat, toggleRole).
import { describe, expect, it } from 'vitest';
import { clampStat, toggleRole } from '../../src/domain/playerEdit';
import { real } from './data';
import { loadLegacy, type LegacyData } from './legacy';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...a: any[]) => any;
interface L extends Record<string, unknown> {
  upStat: Fn; toggleRole: Fn;
  __multiOn: (b: boolean) => void;
  __players: () => Array<{ stats: number[]; roles: string[] }>;
  __cap: () => { toasts: string[] };
  __reset: () => void;
}

describe('modifica giocatore come legacy', () => {
  const clone = () => JSON.parse(JSON.stringify(real)) as typeof real;
  it('statistica scritta a mano: stesso valore tra 1 e 10', () => {
    const d = clone();
    const legacy = loadLegacy<L>(['upStat', 'calcOvr', 'toggleRole'], [], d as unknown as LegacyData);
    legacy.__multiOn(true);
    for (const v of ['', '0', '1', '5', '7.5', '10', '11', '-3', 'abc', '9.99', '0.2']) {
      legacy.upStat(0, 3, v);
      expect(clampStat(v)).toBe(legacy.__players()[0]?.stats[3]);
    }
  });
  it('ruoli: si aggiunge, si toglie, ma non si toglie l\'ultimo', () => {
    const d = clone();
    const legacy = loadLegacy<L>(['upStat', 'calcOvr', 'toggleRole'], [], d as unknown as LegacyData);
    legacy.__multiOn(true);
    let mine: string[] = [...(legacy.__players()[0]?.roles ?? [])];
    const ev = { stopPropagation() { /* come l'evento del tocco */ } };
    for (const r of ['ATT', 'MED', 'DIF', 'ATT', 'MED', 'DIF', 'DIF', 'ATT', 'MED']) {
      legacy.__reset();
      legacy.toggleRole(0, r, ev);
      const next = toggleRole(mine, r);
      if (next) mine = next;
      else expect(legacy.__cap().toasts).toEqual(['Almeno un ruolo è richiesto']);
      expect([...mine].sort()).toEqual([...(legacy.__players()[0]?.roles ?? [])].sort());
      expect(mine.length).toBeGreaterThan(0);
    }
  });
});
