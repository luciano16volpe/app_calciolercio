// Modifica di un giocatore: limiti dei valori.

/** Valore di una statistica scritto a mano: tra 1 e 10 (se non è un numero, 1). */
export const clampStat = (v: unknown): number => Math.min(10, Math.max(1, parseFloat(v as string) || 1));

/** Aggiunge o toglie un ruolo. Almeno un ruolo deve restare: in quel caso restituisce null. */
export function toggleRole(roles: string[], r: string): string[] | null {
  if (roles.includes(r)) return roles.length === 1 ? null : roles.filter((x) => x !== r);
  return [...roles, r];
}

/** Ordine fisso dei ruoli e loro nomi. */
export const ROLES = ['ATT', 'MED', 'DIF'] as const;
export const ROLE_CLS: Record<string, string> = { ATT: 'att', MED: 'mid', DIF: 'def' };
export const ROLE_LABEL: Record<string, string> = { ATT: 'Attacco', MED: 'Centrocampo', DIF: 'Difesa' };
