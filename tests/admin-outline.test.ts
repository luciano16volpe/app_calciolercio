// Tutto ciò che vede solo l'admin (di lega o supremo) ha il contorno viola, uguale in tutta l'app e leggibile nei due temi.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const css = readFileSync('src/styles/app.css', 'utf8');
const menuCss = readFileSync('src/styles/menu.css', 'utf8');
const values = (name: string) => [...css.matchAll(new RegExp(`--${name}:(#[0-9a-fA-F]{6})`, 'g'))].map((m) => m[1]!.toLowerCase());
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
const sources = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? sources(p) : p.endsWith('.tsx') ? [p] : [];
});
const all = new Map(sources('src').map((p) => [p.split('\\').join('/'), readFileSync(p, 'utf8')]));
const text = [...all.values()].join('\n');

test('il viola è definito per tema chiaro, scuro di sistema e scuro scelto', () => {
  const v = values('admin');
  expect(v).toHaveLength(3);
  expect(v[1]).toBe(v[2]);
  expect(v[0]).not.toBe(v[1]);
});

test.each([0, 1])('tema %i: il contorno si distingue dallo sfondo e dalle carte (almeno 3:1)', (theme) => {
  const at = (name: string) => values(name)[theme === 0 ? 0 : 1]!;
  expect(contrast(at('admin'), at('gray'))).toBeGreaterThanOrEqual(3);
  expect(contrast(at('admin'), at('gray2'))).toBeGreaterThanOrEqual(3);
});

test('la regola del contorno esiste e le schermate admin hanno la fascia viola in intestazione', () => {
  expect(css).toMatch(/\.admin-only\{outline:2px solid var\(--admin\)/);
  expect(menuCss).toMatch(/\.sheet-admin \.sheet-h\{box-shadow:inset 0 -4px 0 var\(--admin\)\}/);
  expect(all.get('src/app/Sheet.tsx')).toContain("admin ? ' sheet-admin'");
});

test('ogni schermata che apre solo l’admin passa admin a Sheet', () => {
  const ids = ['sheet-proposals', 'sheet-platform-leagues', 'sheet-platform-users', 'sheet-premium', 'sheet-feature-settings', 'sheet-audit', 'sheet-bench',
    'sheet-game-settings', 'sheet-league-admin-hub', 'sheet-league-settings', 'sheet-invites', 'sheet-claims', 'sheet-merge', 'sheet-members',
    'sheet-superadmin-hub', 'sheet-planned-match'];
  for (const id of ids) expect(text, id).toMatch(new RegExp(`<Sheet admin [^\\n]*id="${id}"|<Sheet admin title=[^\\n]*${id}`));
  // le schermate non riservate non hanno la fascia
  for (const id of ['sheet-privacy', 'sheet-help', 'sheet-players-hub', 'sheet-pending', 'sheet-join-league', 'sheet-compare']) expect(text, id).not.toMatch(new RegExp(`<Sheet admin [^\\n]*${id}`));
});

test('righe di menu, caselle e pulsanti riservati all’admin hanno il contorno', () => {
  const drawer = all.get('src/features/menu/MenuDrawer.tsx')!;
  for (const id of ['menu-league-admin', 'menu-pending', 'menu-game-settings', 'menu-league-settings', 'menu-league-settings-locked', 'menu-superadmin']) {
    expect(drawer, id).toMatch(new RegExp(`<Item [^\\n]*id="${id}[^"]*" admin />`));
  }
  expect(drawer).toContain('menu-code admin-only');
  expect(all.get('src/features/menu/LeagueAdminHub.tsx')).toContain('premium-tile admin-only');
  expect(all.get('src/features/menu/SuperAdminHub.tsx')).toContain('premium-tile admin-only');
  expect(all.get('src/app/BottomNav.tsx')).toContain("it.id === 'partita' ? ' admin-only'");
  for (const [file, marker] of [
    ['src/features/partite/MatchCard.tsx', 'edit-toggle-btn" className="btn btn-secondary btn-sm mbar-btn admin-only'],
    ['src/features/partite/CommunityVote.tsx', 'id="community-vote-close" className="btn btn-danger btn-full admin-only"'],
    ['src/features/partite/FormationPoll.tsx', 'id="formation-poll-close" className="btn btn-danger btn-full admin-only"'],
    ['src/features/player/PlayerLinkRow.tsx', 'id="player-link-row" className="row-line admin-only"'],
    ['src/features/player/PlayerBenchRow.tsx', 'id="player-bench-row" className="admin-only"'],
    ['src/features/rosa/RosaList.tsx', 'btn btn-secondary admin-only'],
  ] as const) expect(all.get(file), file).toContain(marker);
});
