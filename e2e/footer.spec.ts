import { expect, test } from '@playwright/test';
import { openApp, openMenu, setup } from './helpers';

test('La navigazione resta visibile e non copre l’ultima scheda', async ({ page }) => {
  await setup(page, { publicRole: 'admin' });
  await page.goto('/l/san-marcello/rosa');
  const cards = page.locator('#players-list .card-compact');
  await expect(cards).toHaveCount(22);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const nav = page.locator('.bottom-nav');
  await expect(nav).toBeVisible();
  await expect.poll(async () => {
    const last = await cards.last().boundingBox();
    const footer = await nav.boundingBox();
    return last && footer && last.y + last.height <= footer.y;
  }).toBe(true);
  await nav.getByRole('button', { name: 'Partite' }).click();
  await expect(page.locator('#page-partite')).toHaveClass(/active/);
});

test('Il footer resta visibile sopra i pannelli del menu e porta alla sezione scelta', async ({ page }) => {
  await setup(page, { publicRole: 'admin' });
  await openApp(page, '/l/san-marcello/rosa');
  await openMenu(page);
  await page.locator('#menu-league-admin').click();
  await page.locator('#menu-members').click();
  await expect(page.locator('#sheet-members')).toBeVisible();
  const nav = page.locator('.bottom-nav');
  await expect(nav).toBeVisible();
  // il footer è davvero in cima (nessun pannello lo copre) e non copre l'ultimo contenuto del pannello
  const box = (await nav.boundingBox())!;
  const top = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.bottom-nav') !== null, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  expect(top).toBe(true);
  await nav.getByRole('button', { name: 'Partite' }).click();
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(page.locator('#menu-drawer')).toHaveCount(0);
  await expect(page.locator('#page-partite')).toHaveClass(/active/);
});
