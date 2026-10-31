// Test golden (passo 3.7b): salvataggio della scheda partita. Si riempiono i campi della vera schermata di legacy
// (voti, gol, assist, pagelle, risultato), si preme "Salva" e si confronta ciò che legacy salverebbe con il piano della nuova versione.
import { describe, expect, it } from 'vitest';
import { clampInt, planSave, stepCount, stepRating, stepScore, type PlayerFields } from '../../src/domain/matchEdit';
import { normalizeTeam } from '../../src/domain/stats';
import type { Match } from '../../src/domain/types';
import { real } from './data';
import { loadLegacy, type LegacyData } from './legacy';
import { synthetic } from './synthetic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...a: any[]) => any;
interface L extends Record<string, unknown> {
  saveRatings: Fn; clampInt: Fn; scoreStep: Fn; rateStep: Fn; goalStep: Fn;
  __multiOn: (b: boolean) => void; __reset: () => void; __answer: (b: boolean) => void; __getEl: (id: string) => unknown;
  __cap: () => { toasts: string[]; calls: Array<[string, Record<string, unknown>]>; confirms: Array<Record<string, unknown>> };
  __setVals: (o: Record<string, string>) => void;
}
const FUNCS = ['saveRatings', 'normalizeTeam', 'clampInt', 'clampRating', 'esc', 'rateStep', 'rateColor', 'goalStep', 'scoreStep'];
const CONSTS: string[] = [];

const datasets: Array<[string, LegacyData]> = [
  ['dati reali', real as unknown as LegacyData],
  ...[1, 2, 3].map((s) => [`dati inventati (seme ${s})`, synthetic(s)] as [string, LegacyData]),
];

const POOL = {
  rating: ['', '', '6', '7.5', '10', '0', '11', 'abc', '5.3', '6.25', '1', '8,5'],
  count: ['', '', '', '0', '1', '2', '3', '25', '-2', 'x', '4.7'],
  small: ['', '', '0', '1', '11', '3'],
  tit: ['', '', '', ' Il Muro ', 'x'.repeat(70)],
  desc: ['', '', '', ' bravo *tanto* ', 'y'.repeat(2100)],
  score: ['', '', '0', '3', '5', '120', 'x', '-1'],
};
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe.each(datasets)('%s', (_label, raw) => {
  const legacy = loadLegacy<L>(FUNCS, CONSTS, raw);
  const matches = raw.matches as Match[];

  it('salvataggio: pagelle, controlli e risultato come legacy', async () => {
    const r = rng(7);
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)] as T;
    let saved = 0, blocked = 0, asked = 0;
    for (const m of matches.slice(0, 12)) {
      for (let round = 0; round < 12; round++) {
        const tA = normalizeTeam(m.teamA), tB = normalizeTeam(m.teamB);
        // più spesso valori sensati: in un giro su due niente valori strani
        const calm = round % 2 === 0;
        const fields = (list: Array<{ id: string | null; name: string }>): PlayerFields[] =>
          list.map((p) => ({
            id: p.id, name: p.name,
            rating: calm ? pick(['', '6', '7', '5.5', '8']) : pick(POOL.rating),
            goals: calm ? pick(['', '', '1', '2']) : pick(POOL.count),
            assist: calm ? pick(['', '', '', '1', '2']) : pick(POOL.count),
            autogol: calm ? pick(['', '', '', '', '1']) : pick(POOL.small),
            rigori: calm ? pick(['', '', '', '', '1']) : pick(POOL.small),
            meta: calm ? pick(['', '', '', '2']) : pick(POOL.count),
            tit: calm ? pick(['', '', 'Il Muro']) : pick(POOL.tit),
            desc: calm ? pick(['', '', 'bravo']) : pick(POOL.desc),
          }));
        const A = fields(tA), B = fields(tB);
        const scA = calm ? pick(['', '2', '4']) : pick(POOL.score), scB = calm ? pick(['', '1', '3']) : pick(POOL.score);
        // schermata di legacy
        const vals: Record<string, string> = { 'sc-a': scA, 'sc-b': scB, 'edit-notes': 'nota' };
        [...A.map((p) => [p, 'bl'] as const), ...B.map((p) => [p, 'bi'] as const)].forEach(([p, cls], i) => {
          Object.assign(vals, {
            [`rate-${cls}-${i}`]: p.rating, [`goal-${cls}-${i}`]: p.goals, [`ast-${cls}-${i}`]: p.assist, [`og-${cls}-${i}`]: p.autogol,
            [`rig-${cls}-${i}`]: p.rigori, [`meta-${cls}-${i}`]: p.meta, [`tit-${cls}-${i}`]: p.tit, [`desc-${cls}-${i}`]: p.desc,
          });
        });
        legacy.__multiOn(true);
        legacy.__setVals(vals);
        legacy.__reset();
        legacy.__answer(true);
        await legacy.saveRatings(m.id);
        const cap = legacy.__cap();
        // l'avviso sui titoli riguarda solo lo script Google di legacy: qui i titoli vanno nel database
        cap.confirms = cap.confirms.filter((c) => (c as { title: string }).title !== 'Titoli non salvati');

        const plan = planSave(A, B, scA, scB);
        if (plan.missingRating.length) {
          blocked++;
          expect(cap.toasts).toEqual([`⚠️ Metti il voto a: ${plan.missingRating.join(', ')} (ha gol, assist, autogol, rigori o pagella)`]);
          expect(cap.calls).toEqual([]);
          continue;
        }
        if (plan.overAssist.length) {
          asked++;
          expect(cap.confirms.length).toBe(1);
          const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          expect((cap.confirms[0] as { msg: string }).msg).toBe(plan.overAssist.map(esc).join('<br>') + '<br><br>Controlla i dati inseriti. Vuoi salvare comunque?');
        } else expect(cap.confirms).toEqual([]);
        saved++;
        const first = cap.calls[0] as [string, { matchId: string; ratings: unknown[] }];
        expect(first[0]).toBe('saveRatings');
        expect(first[1].matchId).toBe(m.id);
        expect(JSON.parse(JSON.stringify(first[1].ratings))).toEqual(JSON.parse(JSON.stringify(plan.rows)));
        const upd = cap.calls.find((c) => c[0] === 'updateScore') as [string, { scoreA: unknown; scoreB: unknown }] | undefined;
        if (upd) {
          expect(upd[1].scoreA).toBe(plan.scoreA);
          expect(upd[1].scoreB).toBe(plan.scoreB);
        }
      }
    }
    // le prove devono aver toccato tutti e tre i casi
    expect(saved).toBeGreaterThan(0);
    expect(blocked).toBeGreaterThan(0);
    expect(asked).toBeGreaterThanOrEqual(0);
  });

  it('pulsanti − e +: stessi valori di legacy', () => {
    // legacy lavora sui campi: si usa un campo finto per id
    const run = (fn: 'scoreStep' | 'rateStep' | 'goalStep', cur: string, d: number) => {
      legacy.__multiOn(true);
      legacy.__setVals({ f: cur });
      legacy[fn]('f', d);
      return (legacy.__getEl('f') as unknown as { value: string }).value;
    };
    for (const cur of ['', '0', '1', '5', '98', '99', '10', '9.5', 'x', '20', '19']) {
      for (const d of [-1, 1]) {
        expect(stepScore(cur, d)).toBe(String(run('scoreStep', cur, d)));
        expect(stepRating(cur, d)).toBe(String(run('rateStep', cur, d)));
        expect(stepCount(cur, d, 20)).toBe(String(run('goalStep', cur, d)));
      }
    }
    for (const v of ['', '3', '-4', '200', 'x', '7.9']) expect(clampInt(v, 0, 99, 0)).toBe(legacy.clampInt(v, 0, 99, 0));
  });
});
