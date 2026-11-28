import { expect, test } from 'vitest';
import { drawSummary, type SummaryInput } from './riepilogo';
import { setCanvasFactory } from './share';

test('il riepilogo esportato incorpora il campo prima delle pagelle', () => {
  const calls: string[] = [];
  const context = {
    scale() {}, fillRect() {}, beginPath() {}, moveTo() {}, arcTo() {}, closePath() {}, fill() {},
    save() {}, clip() {}, restore() {},
    measureText: (value: string) => ({ width: value.length * 8 }),
    fillText: (value: string) => { calls.push(value); },
    drawImage: () => { calls.push('CAMPO'); },
  } as unknown as CanvasRenderingContext2D;
  setCanvasFactory(() => ({ getContext: () => context } as unknown as HTMLCanvasElement));
  const summary: SummaryInput = {
    date: '2026-11-28', notes: '', scoreA: 1, scoreB: 0,
    h: { avgA: 7, avgB: 6 } as SummaryInput['h'], tA: [], tB: [], editor: '',
  };
  const pitch = { naturalWidth: 560, naturalHeight: 270 } as HTMLImageElement;
  drawSummary(summary, pitch);
  expect(calls.indexOf('FORMAZIONI IN CAMPO')).toBeLessThan(calls.indexOf('CAMPO'));
  expect(calls).toContain('CAMPO');
  expect(calls).toContain('🔵 Blu');
});
