// Stagioni a mesi interi.
import type { Match } from './types';

/** Giorni dopo la fine di una stagione in cui l'albo si aggiorna ancora (pagelle in ritardo). */
export const ALBO_GRACE_DAYS = 14;

export interface Season {
  key: string; // AAAA-PRI | EST | AUT | INV
  label: string;
  start: string; // ISO
  end: string; // ISO
  ord: number;
}

export type SeasonStatus = 'in corso' | 'in chiusura' | 'chiusa';

/** Stagione di una data ISO (YYYY-MM-DD…), oppure null se la data non è valida. */
/** Anno a due cifre: 2026 → «26». */
const yy = (y: number): string => String(y).slice(2);

export function seasonOf(date: unknown): Season | null {
  const m = String(date ?? '').match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const y = +(m[1] as string);
  const mo = +(m[2] as string);
  if (mo >= 3 && mo <= 5) return { key: y + '-PRI', label: 'Primavera ' + yy(y), start: y + '-03-01', end: y + '-05-31', ord: y * 4 + 1 };
  if (mo >= 6 && mo <= 8) return { key: y + '-EST', label: 'Estate ' + yy(y), start: y + '-06-01', end: y + '-08-31', ord: y * 4 + 2 };
  if (mo >= 9 && mo <= 11) return { key: y + '-AUT', label: 'Autunno ' + yy(y), start: y + '-09-01', end: y + '-11-30', ord: y * 4 + 3 };
  // l'inverno attraversa due anni: dicembre (anno y) – febbraio (anno y+1)
  const sy = mo === 12 ? y : y - 1;
  const feb = new Date(sy + 1, 2, 0).getDate();
  return {
    key: sy + '-INV',
    label: `Inverno ${yy(sy)}`,
    start: sy + '-12-01',
    end: `${sy + 1}-02-${feb}`,
    ord: sy * 4 + 4,
  };
}

/** La stagione immediatamente precedente, anche a cavallo d'anno. */
export function previousSeason(season: Season): Season | null {
  const date = new Date(`${season.start}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return seasonOf(date.toISOString().slice(0, 10));
}

/** in corso fino alla fine; in chiusura per 14 giorni; poi chiusa. `today` = data ISO di oggi. */
export function seasonStatus(s: Season, today: string = new Date().toISOString().slice(0, 10)): SeasonStatus {
  if (today <= s.end) return 'in corso';
  const f = new Date(s.end + 'T12:00:00');
  f.setDate(f.getDate() + ALBO_GRACE_DAYS);
  return today <= f.toISOString().slice(0, 10) ? 'in chiusura' : 'chiusa';
}

/**
 * Stagioni con almeno una partita salvata (o un albo salvato), dalla più vecchia.
 * `albo`: righe dell'albo già salvato, con `chiave` e `dal`.
 */
export function seasonsList(
  matches: Pick<Match, 'date'>[],
  albo: Array<{ chiave?: string; dal?: unknown }> = [],
  today?: string,
): Array<Season & { status: SeasonStatus }> {
  const by: Record<string, Season> = {};
  matches.forEach((m) => {
    const s = seasonOf(m.date);
    if (s) by[s.key] = s;
  });
  albo.forEach((r) => {
    if (r.chiave && !by[r.chiave]) {
      const s = seasonOf(String(r.dal ?? ''));
      if (s) by[s.key] = s;
    }
  });
  return Object.values(by)
    .sort((a, b) => a.ord - b.ord)
    .map((s) => ({ ...s, status: seasonStatus(s, today) }));
}
