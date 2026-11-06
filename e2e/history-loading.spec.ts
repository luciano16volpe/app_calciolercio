import { expect, test } from '@playwright/test';
import { json, openApp, setup } from './helpers';

const toggleVisibility = async (page: import('@playwright/test').Page, state: 'hidden' | 'visible') => {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value });
    window.dispatchEvent(new Event('visibilitychange'));
  }, state);
};

test('startup transfers no report texts; opening a match loads only that match and caches it', async ({ page }) => {
  const requests: URL[] = [];
  page.on('request', (r) => { if (r.method() === 'GET' && r.url().includes('/rest/v1/')) requests.push(new URL(r.url())); });
  await setup(page, { publicRole: 'admin' });
  await openApp(page, '/l/san-marcello/rosa');
  const details = () => requests.filter((r) => r.pathname.endsWith('/match_players'));
  const summaries = requests.filter((r) => r.pathname.endsWith('/match_player_summaries'));
  expect(summaries.length).toBeGreaterThan(0);
  expect(summaries.every((r) => !/titolo|descrizione/.test(r.searchParams.get('select') ?? ''))).toBe(true);
  expect(details()).toHaveLength(0);
  await page.getByRole('button', { name: 'Partite', exact: true }).click();
  await page.locator('#last-match .card').click();
  await expect(page.locator('#match-modal')).toBeVisible();
  expect(details()).toHaveLength(1);
  expect(details()[0]!.searchParams.get('match_id')).toMatch(/^eq\./);
  await page.keyboard.press('Escape');
  await expect(page.locator('#match-modal')).toHaveCount(0);
  await page.locator('#last-match .card').click();
  await expect(page.locator('#match-modal')).toBeVisible();
  expect(details()).toHaveLength(1);
});

test('returning to the app checks the version, reloads history only after a change', async ({ page }) => {
  let version = 'v1'; let versionReads = 0; let historyReads = 0;
  await page.clock.install();
  await setup(page);
  await page.route('**/rest/v1/league_data_versions*', (r) => { versionReads++; return json(r, { version }); });
  page.on('request', (r) => { if (r.method() === 'GET' && new URL(r.url()).pathname.endsWith('/matches')) historyReads++; });
  await openApp(page);
  const initial = historyReads;
  await toggleVisibility(page, 'hidden');
  await page.clock.fastForward(16_000);
  await toggleVisibility(page, 'visible');
  await expect.poll(() => versionReads).toBeGreaterThan(1);
  expect(historyReads).toBe(initial);
  const reads = versionReads;
  version = 'v2';
  await toggleVisibility(page, 'hidden');
  await page.clock.fastForward(16_000);
  await toggleVisibility(page, 'visible');
  await expect.poll(() => versionReads).toBeGreaterThan(reads);
  await expect.poll(() => historyReads).toBe(initial + 1);
});
test('a background revision refresh preserves unsaved match edits', async ({ page }) => {
  let version = 'v1'; let reads = 0;
  await page.clock.install();
  await setup(page, { publicRole: 'admin' });
  await page.route('**/rest/v1/league_data_versions*', (r) => json(r, { version }));
  page.on('request', (r) => { if (r.method() === 'GET' && new URL(r.url()).pathname.endsWith('/match_player_summaries')) reads++; });
  await openApp(page);
  await page.getByRole('button', { name: 'Partite', exact: true }).click();
  await page.locator('#last-match .card').click();
  await page.locator('#edit-toggle-btn').click();
  await page.locator('#sc-a').fill('42');
  const before = reads;
  version = 'v2';
  await toggleVisibility(page, 'hidden');
  await page.clock.fastForward(16_000);
  await toggleVisibility(page, 'visible');
  await expect.poll(() => reads).toBeGreaterThan(before);
  await expect(page.locator('#sc-a')).toHaveValue('42');
});
