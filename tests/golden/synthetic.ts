// Dati inventati (ma ripetibili, con un seme) per coprire i casi che i dati reali non hanno:
// pari merito, stagioni corte, ospiti non in rosa, voti e gol strani, rosa grande con tanti Occasionali.
import { real } from './data';
import type { LegacyData } from './legacy';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function synthetic(seed: number): LegacyData {
  const r = rng(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)] as T;
  const players = Array.from({ length: 20 }, (_, i) => ({
    id: 'p' + i, name: 'G' + i, roles: ['MED'], stats: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  }));
  const orphans = ['Ospite1', 'Ospite2']; // non in rosa: raggruppati per nome
  const entry = (i: number) =>
    i < 20
      ? r() < 0.15 ? (players[i] as { name: string }).name : { id: 'p' + i, name: (players[i] as { name: string }).name }
      : { id: null, name: orphans[i - 20] };
  const dates: string[] = [];
  for (const [y, m] of [[2025, 12], [2026, 1], [2026, 2], [2026, 3], [2026, 4], [2026, 6], [2026, 9], [2026, 10]] as const) {
    const k = 2 + Math.floor(r() * 5);
    for (let j = 0; j < k; j++) dates.push(`${y}-${String(m).padStart(2, '0')}-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`);
  }
  dates.push('2026-05-01'); // una stagione con una sola partita (troppo corta per i premi)
  const matches = dates.map((date, idx) => {
    const all = Array.from({ length: 22 }, (_, i) => i).sort(() => r() - 0.5);
    const sz = 5 + Math.floor(r() * 2);
    const a = all.slice(0, sz).map(entry);
    const b = all.slice(sz, sz * 2).map(entry);
    const noScore = r() < 0.12;
    const score = () => (r() < 0.1 ? String(Math.floor(r() * 9)) : Math.floor(r() * 9));
    return {
      id: 'm' + String(idx).padStart(3, '0'), date, teamA: a, teamB: b,
      scoreA: noScore ? null : score(), scoreB: noScore ? '' : score(),
    };
  });
  const ratings: Array<Record<string, unknown>> = [];
  matches.forEach((m) => {
    [...m.teamA, ...m.teamB].forEach((e) => {
      if (r() < 0.2) return; // pagella mancante
      const id = typeof e === 'string' ? null : e.id;
      const name = typeof e === 'string' ? e : e.name;
      const rawVote = pick([4, 5, 5.5, 6, 6, 6.5, 7, 7, 7.5, 8, 8.5, 9, '', null, 0, 'x', '7.5']);
      ratings.push({
        matchId: m.id, player: name, playerId: id, rating: rawVote,
        goals: pick([0, 0, 0, 0, 1, 1, 2, 3, 5, '2', null]), assist: pick([0, 0, 0, 1, 1, 3, null]),
        autogol: pick([0, 0, 0, 0, 1]), rigoriSbagliati: pick([0, 0, 0, 0, 1, 2]), meta: pick([0, 0, 0, 1, 2]),
      });
    });
  });
  return { players, weights: real.weights, matches, ratings };
}
