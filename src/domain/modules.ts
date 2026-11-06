// Moduli di gioco personalizzati (Impostazioni).
import { DEFAULT_MODULES, makeSlots, type Module, type Slot } from './balancing';

export type Modules = Record<number, Module[]>;
export const MODULE_SIZES = [5, 6, 7] as const;
/** Chiave nel telefono. */
export const MODULES_KEY = 'calc5_modules';

/** Portieri, difensori, centrocampisti e attaccanti di uno schieramento (il portiere è il primo DIF molto arretrato). */
export function moduleComposition(slots: Slot[]): { por: number; def: number; med: number; att: number } {
  return {
    por: slots.filter((s) => s.role === 'DIF' && s.x < 0.15).length,
    def: slots.filter((s) => s.role === 'DIF' && s.x >= 0.15).length,
    med: slots.filter((s) => s.role === 'MED').length,
    att: slots.filter((s) => s.role === 'ATT').length,
  };
}

/** Copia dei moduli predefiniti. */
export const defaultModules = (): Modules => Object.fromEntries(MODULE_SIZES.map((n) => [n, [...(DEFAULT_MODULES[n] as Module[])]]));

/** Aggiunge una formazione. Difensori + centrocampisti + attaccanti devono fare n − 1 (il portiere c'è sempre). */
export function addModule(mods: Modules, n: number, def: number, med: number, att: number, desc: string): { modules: Modules; error: string | null; notation: string } {
  const d = def || 0, m = med || 0, a = att || 0;
  const total = d + m + a;
  if (total !== n - 1) return { modules: mods, notation: '', error: `Difensori+Med+Att devono sommare ${n - 1} (ora: ${total})` };
  const notation = `1-${d}-${m}-${a}`;
  if ((mods[n] ?? []).some((x) => x.notation === notation)) return { modules: mods, notation, error: `Formazione ${notation} già presente` };
  return { modules: { ...mods, [n]: [...(mods[n] ?? []), { notation, desc: desc.trim(), slots: makeSlots(1, d, m, a) }] }, error: null, notation };
}

/** Toglie una formazione (ne resta sempre almeno una). */
export function removeModule(mods: Modules, n: number, idx: number): { modules: Modules; error: string | null } {
  const list = mods[n] ?? [];
  if (list.length <= 1) return { modules: mods, error: 'Almeno una formazione è richiesta' };
  return { modules: { ...mods, [n]: list.filter((_, i) => i !== idx) }, error: null };
}

/** Testo da salvare nel telefono. */
export function serializeModules(mods: Modules): string {
  const out: Record<number, Array<{ notation: string; desc: string; counts: ReturnType<typeof moduleComposition> }>> = {};
  for (const n of MODULE_SIZES) out[n] = (mods[n] ?? []).map((m) => ({ notation: m.notation, desc: m.desc || '', counts: moduleComposition(m.slots) }));
  return JSON.stringify(out);
}

/** Legge il testo salvato; se manca o è rovinato restano i moduli predefiniti. */
export function parseModules(raw: string | null): Modules {
  const mods = defaultModules();
  if (!raw) return mods;
  try {
    const custom = JSON.parse(raw) as Record<number, Array<{ notation: string; desc?: string; counts?: { def: number; med: number; att: number } }>>;
    for (const n of MODULE_SIZES) {
      const list = custom[n];
      if (!list) continue;
      mods[n] = list.map((m) => {
        const { def, med, att } = m.counts ?? { def: 2, med: 2, att: 1 };
        return { notation: m.notation, desc: m.desc || '', slots: makeSlots(1, def, med, att) };
      });
    }
  } catch {
    return defaultModules();
  }
  return mods;
}
