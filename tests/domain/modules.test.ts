import { describe, expect, it } from 'vitest';
import { DEFAULT_MODULES, makeSlots } from '../../src/domain/balancing';
import { addModule, defaultModules, parseModules, removeModule, serializeModules } from '../../src/domain/modules';
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
  it('salvataggio e lettura', () => {
    const mods = addModule(defaultModules(), 6, 1, 2, 2, 'x').modules;
    const raw = serializeModules(mods);
    expect(JSON.parse(raw)[6].at(-1)).toEqual({ notation: '1-1-2-2', desc: 'x', counts: { por: 1, def: 1, med: 2, att: 2 } });
    expect(parseModules(raw)).toEqual(mods);
    expect(parseModules(null)).toEqual(defaultModules());
    expect(parseModules('{rotto')).toEqual(defaultModules());
  });
});
