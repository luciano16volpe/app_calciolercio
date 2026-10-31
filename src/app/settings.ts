// Impostazioni salvate sul telefono (come legacy: localStorage).
import { MODULES_KEY, parseModules, serializeModules, type Modules } from '../domain/modules';

/** "Usa la forma" nel bilanciamento: acceso se non è mai stato spento. Legacy: calcio_useform. */
export function readUseForm(): boolean {
  try {
    return localStorage.getItem('calcio_useform') !== '0';
  } catch {
    return true;
  }
}

export function writeUseForm(on: boolean): void {
  try {
    localStorage.setItem('calcio_useform', on ? '1' : '0');
  } catch {
    /* memoria piena o bloccata: l'impostazione vale solo per questa sessione */
  }
}

/** Formazioni (predefinite o personalizzate su questo telefono). Legacy: loadModules. */
export function readModules(): Modules {
  try {
    return parseModules(localStorage.getItem(MODULES_KEY));
  } catch {
    return parseModules(null);
  }
}

export function writeModules(mods: Modules): void {
  try {
    localStorage.setItem(MODULES_KEY, serializeModules(mods));
  } catch {
    /* vedi sopra */
  }
}
