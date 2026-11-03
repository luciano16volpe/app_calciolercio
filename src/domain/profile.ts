// Partite e periodo statistico del giocatore nella lega selezionata.
import { hasScore } from './matches';
import { seasonOf } from './seasons';
import { getPlayerMatchResult, normalizeTeam } from './stats';
import type { Dataset, Match } from './types';

/** Oggi, ora italiana (aaaa-mm-gg). */
export const todayRome = (): string => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

/** In quale squadra gioco in questa partita: 'A' (Blu), 'B' (Bianchi) o null se non ci sono. */
export function myTeam(m: Match, playerId: string, playerName: string): 'A' | 'B' | null {
  const is = (p: { id: string | null; name: string }) => p.id === playerId || p.name === playerName;
  if (normalizeTeam(m.teamA).some(is)) return 'A';
  if (normalizeTeam(m.teamB).some(is)) return 'B';
  return null;
}

/** La mia prossima partita: la più vicina, di oggi o futura, senza risultato, in cui sono in squadra. */
export function myNextMatch(data: Dataset, playerId: string, playerName: string, today = todayRome()): { m: Match; team: 'A' | 'B' } | null {
  const list = data.matches
    .filter((m) => !hasScore(m) && String(m.date ?? '') >= today && myTeam(m, playerId, playerName))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
  const m = list[0];
  return m ? { m, team: myTeam(m, playerId, playerName) as 'A' | 'B' } : null;
}

/** La mia ultima partita giocata: la più recente con risultato in cui sono in squadra, con l'esito (V = vinta, P = pareggio, S = persa). */
export function myLastMatch(data: Dataset, playerId: string, playerName: string): { m: Match; team: 'A' | 'B'; result: 'V' | 'P' | 'S' } | null {
  const list = data.matches
    .filter((m) => hasScore(m) && myTeam(m, playerId, playerName))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)));
  const m = list[0];
  if (!m) return null;
  const r = getPlayerMatchResult(m, playerId, playerName);
  return { m, team: myTeam(m, playerId, playerName) as 'A' | 'B', result: r === 'W' ? 'V' : r === 'L' ? 'S' : 'P' };
}

/** Le ultime partite disputate dal giocatore nella lega corrente, dalla piu recente. */
export function myRecentMatches(data: Dataset, playerId: string, playerName: string, limit = 10, today = todayRome()): Match[] {
  return data.matches
    .filter((m) => hasScore(m) && String(m.date ?? '') <= today && myTeam(m, playerId, playerName))
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')) || String(b.id).localeCompare(String(a.id)))
    .slice(0, limit);
}

/** Nel profilo: stagione corrente, o ultime cinque partite giocate del giocatore. */
export function profileSeasonData(data: Dataset, playerId: string, playerName: string, today = todayRome()): { dataset: Dataset; label: string } {
  const current = seasonOf(today);
  const played = data.matches.filter((m) => hasScore(m) && String(m.date ?? '') <= today && myTeam(m, playerId, playerName))
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')) || String(b.id).localeCompare(String(a.id)));
  const seasonal = current ? played.filter((m) => seasonOf(m.date)?.key === current.key) : [];
  const enough = seasonal.length >= 5;
  const selected = enough ? seasonal : played.slice(0, 5);
  const ids = new Set(selected.map((m) => m.id));
  return { dataset: { ...data, matches: selected, ratings: data.ratings.filter((r) => ids.has(r.matchId)) },
    label: enough ? 'Stagione in corso' : 'Ultime 5 partite' };
}
