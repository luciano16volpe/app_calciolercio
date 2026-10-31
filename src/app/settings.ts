// Impostazioni salvate sul telefono (come legacy: localStorage).

/** "Usa la forma" nel bilanciamento: acceso se non è mai stato spento. Legacy: calcio_useform. */
export function readUseForm(): boolean {
  try {
    return localStorage.getItem('calcio_useform') !== '0';
  } catch {
    return true;
  }
}
