import { expect, test } from '@playwright/test';
import { fixturePlayer, setup } from './helpers';

const nav = (page: import('@playwright/test').Page, name: string) => page.locator('.bottom-nav').getByRole('button', { name, exact: true }).click();

test('unused pages and drawing code are not downloaded or mounted on the profile', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (r) => { if (r.resourceType() === 'script') scripts.push(new URL(r.url()).pathname); });
  await setup(page, { publicRole: 'admin', mePlayer: fixturePlayer() });
  await page.goto('/l/san-marcello/profilo');
  await expect(page.locator('#page-profilo #myplayer-card')).toBeVisible();
  for (const chunk of ['GiocaPage', 'ClassifichePage', 'SettingsPage', 'MatchCard', 'make', 'RosaList']) {
    expect(scripts.some((url) => url.includes('/' + chunk + '-'))).toBe(false);
  }
  await expect(page.locator('#players-list')).toHaveCount(0);
  await expect(page.locator('#cl-content')).toHaveCount(0);
  await expect(page.locator('.gioca-intro')).toHaveCount(0);
  await nav(page, 'Gioca');
  await expect(page.locator('#fmt-6')).toBeVisible();
  await page.locator('#fmt-6').click();
  await page.locator('.conv-item').first().click();
  await nav(page, 'Classifiche');
  await page.locator('#cl-tabs').getByRole('button', { name: /Assist/ }).click();
  await nav(page, 'Gioca');
  await expect(page.locator('#fmt-6')).toHaveClass(/active/);
  await expect(page.locator('.conv-item.sel')).toHaveCount(1);
  expect(scripts.filter((url) => url.includes('/GiocaPage-'))).toHaveLength(1);
  await nav(page, 'Classifiche');
  await expect(page.locator('#cl-tabs .active')).toContainText('Assist');
});

test('drawing code is requested by an image action, and feature chunks are absent from PWA precache', async ({ page, request }) => {
  const scripts: string[] = [];
  page.on('request', (r) => { if (r.resourceType() === 'script') scripts.push(new URL(r.url()).pathname); });
  await setup(page, { publicRole: 'admin' });
  await page.goto('/l/san-marcello/profilo');
  await expect(page.locator('#page-profilo #myplayer-card')).toBeVisible();
  await nav(page, 'Partite');
  const summary = page.locator('#last-match').getByRole('button', { name: /Riepilogo/ });
  await expect(summary).toBeVisible();
  expect(scripts.some((url) => url.includes('/make-'))).toBe(false);
  await summary.click();
  await expect(page.locator('#img-viewer')).toBeVisible();
  expect(scripts.some((url) => url.includes('/make-'))).toBe(true);
  const worker = await (await request.get('/sw.js')).text();
  expect(worker).not.toMatch(/url:"assets\/(?:GiocaPage|ClassifichePage|SettingsPage|MatchCard|make)-/);
  expect(worker).toContain('calciolercio-feature-code');
});
