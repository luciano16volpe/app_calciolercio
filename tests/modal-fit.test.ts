// La finestra delle formazioni deve stare sempre nello schermo, anche con notch e barra di stato, e potersi chiudere.
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const css = readFileSync('src/styles/app.css', 'utf8');
const rule = (selector: string) => css.split('\n').filter((l) => l.startsWith(`${selector}{`)).join('\n');

test('formazioni: lo sfondo rispetta le aree sicure e l’altezza non dipende da dvh', () => {
  const overlay = rule('.formation-poll-overlay');
  for (const side of ['top', 'right', 'bottom', 'left']) expect(overlay).toContain(`env(safe-area-inset-${side}`);
  expect(overlay).toContain('touch-action:none');
  const panel = rule('.formation-poll-panel');
  expect(panel).toContain('max-height:100%');
  expect(panel).not.toMatch(/dvh|100vh/);
});

test('formazioni: intestazione sempre visibile, X abbastanza grande e chiusura anche toccando lo sfondo', () => {
  expect(css).toMatch(/\.formation-poll-head\{flex:none;/);
  expect(css).toMatch(/\.formation-poll-head button\{flex:none;width:42px;height:42px;/);
  const tsx = readFileSync('src/features/partite/FormationPoll.tsx', 'utf8');
  expect(tsx).toMatch(/formation-poll-overlay[^>]*onClick=\{\(event\) => \{ if \(event\.target === event\.currentTarget\) close\(\); \}\}/);
});
