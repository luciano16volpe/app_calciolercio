import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { observeElementVisibility } from '../src/app/visibility';
import { animateWhenVisible } from '../src/app/visibleAnimation';

class Observer {
  static instances: Observer[] = [];
  target!: Element;
  disconnect = vi.fn();
  constructor(private callback: IntersectionObserverCallback) { Observer.instances.push(this); }
  observe(target: Element) { this.target = target; }
  emit(visible: boolean) { this.callback([{ target: this.target, isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
}
let page: EventTarget & { visibilityState: string };
let motion: EventTarget & { matches: boolean };
let queued: Map<number, FrameRequestCallback>;
beforeEach(() => {
  Observer.instances = [];
  page = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  motion = Object.assign(new EventTarget(), { matches: false });
  queued = new Map(); let next = 0;
  vi.stubGlobal('document', page);
  vi.stubGlobal('window', { matchMedia: () => motion });
  vi.stubGlobal('IntersectionObserver', Observer);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { queued.set(++next, callback); return next; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => queued.delete(id));
});
afterEach(() => vi.unstubAllGlobals());
const frame = () => { const pending=[...queued]; queued.clear(); for (const [, callback] of pending) callback(0); };
const visibility = (state: string) => { page.visibilityState=state; page.dispatchEvent(new Event('visibilitychange')); };

test('offscreen effects schedule no frames; scrolling in starts exactly one loop', () => {
  const advance=vi.fn(), draw=vi.fn();
  const stop=animateWhenVisible({} as Element, advance, draw);
  expect(queued.size).toBe(0);
  Observer.instances[0]!.emit(true);
  expect(queued.size).toBe(1); frame();
  expect(advance).toHaveBeenCalledTimes(1); expect(queued.size).toBe(1);
  Observer.instances[0]!.emit(false);
  expect(queued.size).toBe(0); frame(); expect(advance).toHaveBeenCalledTimes(1);
  Observer.instances[0]!.emit(true); frame();
  expect(advance).toHaveBeenCalledTimes(2); expect(queued.size).toBe(1);
  stop(); expect(queued.size).toBe(0);
});

test('backgrounding the browser cancels the loop and returning resumes only visible effects', () => {
  const advance=vi.fn(); const stop=animateWhenVisible({} as Element, advance, vi.fn());
  Observer.instances[0]!.emit(true); frame();
  visibility('hidden'); expect(queued.size).toBe(0);
  visibility('visible'); expect(queued.size).toBe(1);
  visibility('hidden'); Observer.instances[0]!.emit(false);
  visibility('visible'); expect(queued.size).toBe(0);
  stop();
});

test('reduced motion produces a static frame and responds to preference changes', () => {
  motion.matches=true; const draw=vi.fn(), advance=vi.fn();
  const stop=animateWhenVisible({} as Element, advance, draw);
  Observer.instances[0]!.emit(true);
  expect(draw).toHaveBeenCalledTimes(1); expect(queued.size).toBe(0);
  motion.matches=false; motion.dispatchEvent(new Event('change'));
  expect(queued.size).toBe(1); frame(); expect(advance).toHaveBeenCalledTimes(1);
  motion.matches=true; motion.dispatchEvent(new Event('change')); expect(queued.size).toBe(0);
  stop();
});

test('unmount disconnects observers and prevents delayed callbacks restarting animation', () => {
  const stop=animateWhenVisible({} as Element, vi.fn(), vi.fn());
  const observer=Observer.instances[0]!; observer.emit(true);
  stop(); observer.emit(true); visibility('visible'); motion.dispatchEvent(new Event('change'));
  expect(observer.disconnect).toHaveBeenCalledOnce(); expect(queued.size).toBe(0);
});

test('images start only when visible in a foreground page; once loaded they remain available', () => {
  visibility('hidden'); const onChange=vi.fn();
  const stop=observeElementVisibility({} as Element,onChange,{once:true,rootMargin:'160px'});
  const observer=Observer.instances[0]!; observer.emit(true);
  expect(onChange).toHaveBeenLastCalledWith(false);
  visibility('visible'); expect(onChange).toHaveBeenLastCalledWith(true);
  expect(observer.disconnect).toHaveBeenCalledOnce();
  const count=onChange.mock.calls.length; visibility('hidden'); observer.emit(false);
  expect(onChange).toHaveBeenCalledTimes(count); stop();
});

test('browsers without IntersectionObserver retain the existing eager behavior', () => {
  vi.stubGlobal('IntersectionObserver',undefined); const change=vi.fn();
  const stop=observeElementVisibility({} as Element,change);
  expect(change).toHaveBeenLastCalledWith(true);
  visibility('hidden'); expect(change).toHaveBeenLastCalledWith(false); stop();
});
