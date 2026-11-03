import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { monitorUpdates } from '../src/app/monitorUpdates';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-03T12:00:00Z')); });
afterEach(() => { vi.useRealTimers(); });

function setup(initiallyControlled = true) {
  const update = vi.fn().mockResolvedValue(undefined);
  const workers = Object.assign(new EventTarget(), { controller: initiallyControlled ? {} : null, ready: Promise.resolve({ update }) });
  const page = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const browser = Object.assign(new EventTarget(), { setInterval, clearInterval });
  const notify = vi.fn();
  const stop = monitorUpdates(workers as unknown as ServiceWorkerContainer, page as unknown as Document, browser as unknown as Window, notify);
  return { update, workers, page, browser, notify, stop };
}

test('controlla all avvio, poi periodicamente e quando la pagina torna visibile', async () => {
  const s = setup();
  await vi.advanceTimersByTimeAsync(0);
  expect(s.update).toHaveBeenCalledTimes(1);
  s.browser.dispatchEvent(new Event('focus'));
  expect(s.update).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(5 * 60_000);
  expect(s.update).toHaveBeenCalledTimes(2);
  s.page.visibilityState = 'hidden';
  await vi.advanceTimersByTimeAsync(5 * 60_000);
  expect(s.update).toHaveBeenCalledTimes(2);
  s.page.visibilityState = 'visible';
  s.page.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(0);
  expect(s.update).toHaveBeenCalledTimes(3);
  s.stop();
  await vi.advanceTimersByTimeAsync(5 * 60_000);
  expect(s.update).toHaveBeenCalledTimes(3);
});

test('il primo service worker non viene segnalato come aggiornamento, quello successivo si', async () => {
  const s = setup(false);
  s.workers.controller = {};
  s.workers.dispatchEvent(new Event('controllerchange'));
  expect(s.notify).not.toHaveBeenCalled();
  s.workers.controller = {};
  s.workers.dispatchEvent(new Event('controllerchange'));
  expect(s.notify).toHaveBeenCalledTimes(1);
  s.stop();
  s.workers.dispatchEvent(new Event('controllerchange'));
  expect(s.notify).toHaveBeenCalledTimes(1);
});

test('errore di rete viene ignorato e il controllo successivo viene riprovato', async () => {
  const s = setup();
  s.update.mockRejectedValueOnce(new Error('offline'));
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(5 * 60_000);
  expect(s.update).toHaveBeenCalledTimes(2);
  s.stop();
});
