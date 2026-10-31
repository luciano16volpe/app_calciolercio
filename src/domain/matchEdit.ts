// Modifica di una partita: cosa si salva, quali controlli si fanno prima. Solo calcoli (niente schermo, niente database).
// Fonte: saveRatings, saveNewMatch, clampInt in legacy/index.html.
import { clampRating } from './stats';

/** Numero intero tra min e max; se non è un numero, `fallback`. */
export function clampInt(value: unknown, min: number, max: number, fallback = 0): number {
  const n = parseInt(value as string);
  if (isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Quello che c'è scritto nei campi di un giocatore (testo, come nei campi dello schermo). */
export interface PlayerFields {
  id: string | null;
  name: string;
  rating: string;
  goals: string;
  assist: string;
  autogol: string;
  rigori: string;
  meta: string;
  tit: string;
  desc: string;
}

/** Una pagella pronta da salvare. */
export interface RatingRow {
  playerId: string;
  player: string;
  rating: number;
  notes: string;
  titolo: string;
  goals: number;
  autogol: number;
  meta: number;
  assist: number;
  rigoriSbagliati: number;
}

export interface SavePlan {
  /** pagelle da salvare (solo chi ha un voto valido) */
  rows: RatingRow[];
  /** chi ha gol, assist, autogol, rigori o pagella ma non il voto: così non si salva */
  missingRating: string[];
  scoreA: number | '';
  scoreB: number | '';
  /** squadre con più assist che gol (da confermare) */
  overAssist: string[];
}

/** Prepara il salvataggio della scheda partita, con le stesse regole di legacy. */
export function planSave(teamA: PlayerFields[], teamB: PlayerFields[], scA: string, scB: string): SavePlan {
  const rows: RatingRow[] = [];
  const missingRating: string[] = [];
  const tot = { A: { goals: 0, assist: 0 }, B: { goals: 0, assist: 0 } };
  const all: Array<[PlayerFields, 'A' | 'B']> = [...teamA.map((p) => [p, 'A'] as [PlayerFields, 'A']), ...teamB.map((p) => [p, 'B'] as [PlayerFields, 'B'])];
  all.forEach(([p, side]) => {
    const tit = (p.tit || '').trim().slice(0, 60);
    const desc = (p.desc || '').trim().slice(0, 2000);
    const v = clampRating(p.rating); // vuoto o non valido → niente voto; altrimenti 1–10 a passi di 0,5
    const g = clampInt(p.goals, 0, 20, 0);
    const asv = clampInt(p.assist, 0, 20, 0);
    const rsv = clampInt(p.rigori, 0, 10, 0);
    const ag = clampInt(p.autogol, 0, 20, 0);
    const mt = clampInt(p.meta, 0, 50, 0);
    const hasRating = v !== null;
    // REGOLA: chi ha gol, assist, autogol, rigori sbagliati o pagella deve avere un voto (ha per forza giocato)
    if ((g > 0 || asv > 0 || ag > 0 || rsv > 0 || tit || desc) && !hasRating) {
      missingRating.push(p.name);
      return;
    }
    tot[side].goals += g;
    tot[side].assist += asv;
    if (hasRating) rows.push({ playerId: p.id || '', player: p.name, rating: v, notes: desc, titolo: tit, goals: g, autogol: ag, meta: mt, assist: asv, rigoriSbagliati: rsv });
  });
  const scoreA = scA !== '' ? clampInt(scA, 0, 99, 0) : '';
  const scoreB = scB !== '' ? clampInt(scB, 0, 99, 0) : '';
  // controllo morbido: una squadra non può avere più assist che gol (limite = risultato se c'è, altrimenti i gol dei giocatori)
  const overAssist: string[] = [];
  ([['A', '🔵 Blu', scoreA], ['B', '⚪ Bianchi', scoreB]] as const).forEach(([k, label, sc]) => {
    const bound = sc !== '' ? sc : tot[k].goals;
    if (tot[k].assist > bound) overAssist.push(`${label}: ${tot[k].assist} assist ma ${bound} gol`);
  });
  return { rows, missingRating, scoreA, scoreB, overAssist };
}

/** Pulsanti − e + dei campi: stesso comportamento di legacy (scoreStep, rateStep, goalStep). */
export function stepScore(cur: string, delta: number): string {
  let v = parseInt(cur);
  if (isNaN(v)) v = delta > 0 ? 1 : 0;
  else v += delta;
  return String(Math.max(0, Math.min(99, v)));
}
export function stepRating(cur: string, delta: number): string {
  let v = parseFloat(cur);
  if (isNaN(v)) v = 6; // si parte da 6 se è vuoto
  else v += delta * 0.5;
  return String(Math.max(1, Math.min(10, v)));
}
export function stepCount(cur: string, delta: number, max: number): string {
  let v = parseInt(cur);
  if (isNaN(v)) v = delta > 0 ? 1 : 0;
  else v += delta;
  v = Math.max(0, Math.min(max, v));
  return v === 0 ? '' : String(v); // a zero il campo torna vuoto
}
