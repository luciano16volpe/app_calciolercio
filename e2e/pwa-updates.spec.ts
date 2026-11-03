import { expect, test } from '@playwright/test';
import { openApp, setup } from './helpers';

test('nuova versione pronta: avviso, rinvio e ripresentazione senza perdere la pagina', async ({ page }) => {
  await page.addInitScript(() => {
    const sw = navigator.serviceWorker;
    Object.defineProperty(sw, 'controller', { configurable: true, value: {} });
    Object.defineProperty(sw, 'ready', { configurable: true, value: Promise.resolve({ update: async () => undefined }) });
  });
  await setup(page, { publicRole: 'member' });
  await openApp(page);
  await expect(page.locator('.update-notice')).toHaveCount(0);
  await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange')));
  const banner = page.locator('.update-notice');
  await expect(banner).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Aggiorna' })).toBeVisible();
  await banner.getByRole('button', { name: 'Non ora' }).click();
  await expect(banner).toHaveCount(0);
  await expect(page.locator('#page-rosa')).toHaveClass(/active/);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(banner).toBeVisible();
  const viewport = page.viewportSize()!;
  const bounds = await banner.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
});
