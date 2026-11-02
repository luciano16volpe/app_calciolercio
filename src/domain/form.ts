// Peso dei voti, valore di bilanciamento e stato di forma.
// Fonte: formWeight, effectiveScore, formState, onFire, inCrisi in legacy/index.html.
import { calcOvr } from './ovr';
import { playerSeason, seasonStats, type PlayerSeason } from './stats';
import type { Dataset, Player } from './types';

export const FORM_MAX_WEIGHT = 0.25;
export const FORM_MIN_RATINGS = 2;
export const FORM_FULL_RATINGS = 18;
export const FORM_DELTA = 0.2; // ± margine sulla media di sempre
export const FORM_WINDOW = 2; // quante ultime pagelle (consecutive) si confrontano con la media di sempre

/** Peso della media pagelle: 0 fino a 2 pagelle, poi cresce in linea retta fino al 25% con 18 o più. */
export function formWeight(count: number): number {
  if (!count || count <= FORM_MIN_RATINGS) return 0;
  return FORM_MAX_WEIGHT * Math.min(1, (count - FORM_MIN_RATINGS) / (FORM_FULL_RATINGS - FORM_MIN_RATINGS));
}

/** Media e numero di tutti i voti validi di un giocatore. */
export function playerRatingAvg(a: PlayerSeason | null): { avg: number | null; count: number } {
  return a && a.votes.length ? { avg: a.voteAvg, count: a.votes.length } : { avg: null, count: 0 };
}

/**
 * Valore di bilanciamento: OVR spostato un po' verso la media pagelle di sempre.
 * `useForm` = opzione "usa la forma" (predefinita attiva). `all` = seasonStats(data), da passare
 * quando si calcolano molti giocatori di fila (evita di ricalcolarlo ogni volta).
 */
export function effectiveScore(
  data: Dataset,
  weights: number[],
  p: Player,
  useForm = true,
  all = seasonStats(data),
): number {
  const ovr = calcOvr(p.stats, weights);
  if (!useForm) return ovr;
  const info = playerRatingAvg(playerSeason(data, p, all));
  const w = formWeight(info.count);
  if (info.avg == null || w === 0) return ovr; // pochi dati → solo OVR
  return ovr * (1 - w) + info.avg * w;
}

/** Oggi (ora italiana) come AAAA-MM-GG. */
export const todayRome = (): string => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

/** La data di un mese prima (AAAA-MM-GG). */
export function oneMonthBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().substring(0, 10);
}

export type FormState = 'up' | 'flat' | 'down';

/**
 * Stato di forma: media delle ultime 2 pagelle (le più recenti, consecutive) contro la media di sempre.
 * ≥ +0,2 → 'up' (In forma) · ≤ −0,2 → 'down' (In calo) · altrimenti 'flat' (Costante).
 * Servono almeno 4 pagelle, l'ultima deve essere tra le 5 partite più recenti del gruppo
 * e non può essere più vecchia di un mese rispetto a `today` (novembre 2026: dopo una lunga pausa la forma non vale).
 */
export function formState(data: Dataset, p: Player, all = seasonStats(data), today = todayRome()): FormState | null {
  const a = playerSeason(data, p, all);
  if (!a || a.votes.length < 4) return null;
  const since = data.matches.map((m) => m.date).filter(Boolean).sort().slice(-5)[0];
  const last = a.votes[a.votes.length - 1] as { date: string };
  if (since && last.date < since) return null;
  if (last.date < oneMonthBefore(today)) return null;
  const d = a.votes.slice(-FORM_WINDOW).reduce((s, x) => s + x.v, 0) / FORM_WINDOW - (a.voteAvg as number);
  return d >= FORM_DELTA - 1e-9 ? 'up' : d <= -FORM_DELTA + 1e-9 ? 'down' : 'flat';
}

/** 🔥 ON FIRE = "In forma". */
export const onFire = (data: Dataset, p: Player, all = seasonStats(data)): boolean => formState(data, p, all) === 'up';
/** 🌧️ IN CRISI = "In calo". */
export const inCrisi = (data: Dataset, p: Player, all = seasonStats(data)): boolean => formState(data, p, all) === 'down';
/** Badge PAG: media di tutti i voti. ≥ 6,5 verde · < 5,5 rosso · altrimenti giallo · senza voti "PAG —". */
export function pagInfo(avg: number | null): { label: string; cls: 'pag-none' | 'pag-good' | 'pag-mid' | 'pag-bad'; avg: number | null } {
  if (avg == null) return { label: 'PAG —', cls: 'pag-none', avg: null };
  const cls = avg >= 6.5 ? 'pag-good' : avg < 5.5 ? 'pag-bad' : 'pag-mid';
  return { label: `PAG ${avg.toFixed(1)}`, cls, avg };
}
