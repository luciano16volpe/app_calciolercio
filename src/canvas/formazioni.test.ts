import { expect, test } from 'vitest';
import { drawFormations } from './formazioni';
import { setCanvasFactory } from './share';

test('l’immagine distingue il portiere fisso dal portiere di ruolo', () => {
  const labels: string[] = [];
  const ctx = {
    scale() {}, fillRect() {}, beginPath() {}, moveTo() {}, arcTo() {}, closePath() {}, fill() {}, arc() {},
    measureText: (value: string) => ({ width: value.length * 10 }),
    fillText: (value: string) => { labels.push(value); },
  } as unknown as CanvasRenderingContext2D;
  setCanvasFactory(() => ({ getContext: () => ctx } as unknown as HTMLCanvasElement));
  drawFormations({
    tA: [{ name: 'Luca', score: 6, role: 'POR', fixedGoalkeeper: true }],
    tB: [{ name: 'Marco', score: 6, role: 'POR' }],
    sA: 6, sB: 6, modA: '1-1-2-1', modB: '1-1-2-1', diff: 0, subtitle: 'Formazioni',
  });
  expect(labels).toContain('PORTIERE FISSO');
  expect(labels).toContain('PORTIERE DI RUOLO');
});
