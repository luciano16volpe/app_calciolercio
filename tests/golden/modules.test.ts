// Test golden (passo 3.8): moduli di gioco — composizione e formazioni predefinite come legacy; aggiunta, rimozione e salvataggio sul telefono.
import { describe, expect, it } from 'vitest';
import { DEFAULT_MODULES, makeSlots } from '../../src/domain/balancing';
import { addModule, defaultModules, moduleComposition, parseModules, removeModule, serializeModules } from '../../src/domain/modules';
import { real } from './data';
import { loadLegacy, type LegacyData } from './legacy';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...a: any[]) => any;
interface L extends Record<string, unknown> {
  moduleComposition: Fn; makeSlots: Fn; MODULES: Record<number, Array<{ notation: string; desc: string; slots: unknown[] }>>;
}

describe('moduli come legacy', () => {
  const legacy = loadLegacy<L>(['makeSlots', 'moduleComposition'], ['MODULES'], real as unknown as LegacyData);
  it('formazioni predefinite e composizione', () => {
    for (const n of [5, 6, 7]) {
      const mine = DEFAULT_MODULES[n] ?? [];
      const theirs = legacy.MODULES[n] ?? [];
      expect(mine.map((m) => m.notation)).toEqual(theirs.map((m) => m.notation));
      expect(mine.map((m) => m.desc)).toEqual(theirs.map((m) => m.desc));
      mine.forEach((m, i) => {
        expect(m.slots).toEqual(JSON.parse(JSON.stringify(theirs[i]?.slots)));
        expect(moduleComposition(m.slots)).toEqual(legacy.moduleComposition(theirs[i]?.slots));
      });
    }
  });
  it('schieramenti nuovi uguali a makeSlots di legacy', () => {
    for (const [d, m, a] of [[0, 4, 0], [2, 2, 1], [3, 1, 2], [1, 0, 5]]) {
      expect(makeSlots(1, d as number, m as number, a as number)).toEqual(JSON.parse(JSON.stringify(legacy.makeSlots(1, d, m, a))));
    }
  });
});

describe('aggiungi e togli formazioni', () => {
  it('la somma deve fare n − 1', () => {
    const r = addModule(defaultModules(), 5, 2, 2, 1, '');
    expect(r.error).toBe('Difensori+Med+Att devono sommare 4 (ora: 5)');
  });
  it('doppione rifiutato', () => {
    expect(addModule(defaultModules(), 5, 1, 2, 1, '').error).toBe('Formazione 1-1-2-1 già presente');
  });
  it('aggiunta valida, con campi vuoti letti come 0', () => {
    const r = addModule(defaultModules(), 5, 0, 4, NaN, '  solo centrocampo ');
    expect(r.error).toBeNull();
    expect(r.notation).toBe('1-0-4-0');
    const added = r.modules[5]?.at(-1);
    expect(added?.desc).toBe('solo centrocampo');
    expect(added?.slots).toEqual(makeSlots(1, 0, 4, 0));
    expect(DEFAULT_MODULES[5]?.length).toBe(3); // i predefiniti non si toccano
  });
  it('ne resta sempre almeno una', () => {
    let mods = defaultModules();
    mods = removeModule(mods, 5, 0).modules;
    mods = removeModule(mods, 5, 0).modules;
    expect(mods[5]?.length).toBe(1);
    expect(removeModule(mods, 5, 0).error).toBe('Almeno una formazione è richiesta');
  });
  it('salvataggio e lettura (stesso formato di legacy)', () => {
    const mods = addModule(defaultModules(), 6, 1, 2, 2, 'x').modules;
    const raw = serializeModules(mods);
    expect(JSON.parse(raw)[6].at(-1)).toEqual({ notation: '1-1-2-2', desc: 'x', counts: { por: 1, def: 1, med: 2, att: 2 } });
    expect(parseModules(raw)).toEqual(mods);
    expect(parseModules(null)).toEqual(defaultModules());
    expect(parseModules('{rotto')).toEqual(defaultModules());
  });
});
