// Turnazione delle squadre: due giocatori non restano nella stessa squadra per più di tre partite di fila.
import { hasScore } from './matches';
import { myTeam, todayRome } from './profile';
import type { Dataset } from './types';

/** Numero massimo di partite di fila (della lega) in cui due giocatori possono stare nella stessa squadra. */
export const MAX_TOGETHER_STREAK = 3;

/**
 * Coppie di convocati (indici nella rosa) che hanno giocato INSIEME nella stessa squadra in ciascuna delle ultime
 * `max` partite giocate della lega (con risultato, fino a oggi): rimetterle insieme farebbe una serie più lunga di `max`.
 * Basta che uno dei due manchi, o che siano in squadre diverse, in una di quelle partite e la serie si interrompe.
 */
export function blockedPairs(data: Dataset, selected: number[], max = MAX_TOGETHER_STREAK, today = todayRome()): Array<[number, number]> {
  const recent = data.matches
    .filter((m) => hasScore(m) && String(m.date ?? '') <= today)
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')) || String(b.id).localeCompare(String(a.id)))
    .slice(0, max);
  if (recent.length < max) return [];
  const teams = selected.map((i) => {
    const p = data.players[i];
    return p ? recent.map((m) => myTeam(m, p.id, p.name)) : [];
  });
  const out: Array<[number, number]> = [];
  for (let a = 0; a < selected.length; a++) {
    for (let b = a + 1; b < selected.length; b++) {
      const ta = teams[a] ?? [], tb = teams[b] ?? [];
      if (ta.length === max && ta.every((t, k) => t !== null && t === tb[k])) out.push([selected[a] as number, selected[b] as number]);
    }
  }
  return out;
}
