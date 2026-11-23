// Ciò che vedono solo redazione e admin ha il contorno verde dell'editore (il viola resta alle cose solo da admin).
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const css = readFileSync('src/styles/app.css', 'utf8');
const menuCss = readFileSync('src/styles/menu.css', 'utf8');
const read = (p: string) => readFileSync(p, 'utf8');
const values = (name: string) => [...css.matchAll(new RegExp(`--${name}:(#[0-9a-fA-F]{6})`, 'g'))].map((m) => m[1]!.toLowerCase());
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

test('il verde dell’editore è definito per i tre temi e diverso dal viola', () => {
  const v = values('editor');
  expect(v).toHaveLength(3);
  expect(v[1]).toBe(v[2]);
  expect(v[0]).not.toBe(v[1]);
  expect(v[0]).not.toBe(values('admin')[0]);
});

test.each([0, 1])('tema %i: il verde si distingue dallo sfondo e dalle carte (almeno 3:1)', (theme) => {
  const at = (name: string) => values(name)[theme === 0 ? 0 : 1]!;
  expect(contrast(at('editor'), at('gray'))).toBeGreaterThanOrEqual(3);
  expect(contrast(at('editor'), at('gray2'))).toBeGreaterThanOrEqual(3);
});

test('regole del contorno verde e fascia verde sulle schermate di redazione e admin', () => {
  expect(css).toMatch(/\.staff-only\{outline:2px solid var\(--editor\)/);
  expect(menuCss).toMatch(/\.sheet-staff \.sheet-h\{box-shadow:inset 0 -4px 0 var\(--editor\)\}/);
  expect(read('src/app/Sheet.tsx')).toContain("staff ? ' sheet-staff'");
  expect(read('src/features/menu/PendingPanel.tsx')).toMatch(/<Sheet staff [^\n]*id="sheet-pending"/);
});

test('righe di menu e pulsanti condivisi da redazione e admin sono verdi, non viola', () => {
  const drawer = read('src/features/menu/MenuDrawer.tsx');
  expect(drawer).toMatch(/<Item [^\n]*title="Da completare"[^\n]*staff \/>/);
  expect(drawer).toMatch(/<Item [^\n]*title="Partite senza pagelle"[^\n]*staff \/>/);
  expect(drawer).not.toMatch(/<Item [^\n]*title="Partite senza pagelle"[^\n]* admin \/>/);
  const card = read('src/features/partite/MatchCard.tsx');
  expect(card).toContain('id="edit-text-btn" className="btn btn-secondary btn-sm mbar-btn staff-only"');
  expect(card).toContain('id="skip-ratings" className="btn btn-secondary btn-full btn-sm staff-only"');
  expect((card.match(/gaz-edit staff-only/g) ?? []).length).toBe(2);
  expect(card).toContain('staff-only staff-block');
  expect(read('src/features/partite/parts.tsx')).toContain('mbar-btn staff-only" id="last-match-edit"');
  // il pulsante di modifica completa resta solo dell'admin, quindi viola
  expect(card).toContain('edit-toggle-btn" className="btn btn-secondary btn-sm mbar-btn admin-only');
});
