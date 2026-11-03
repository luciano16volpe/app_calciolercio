import { expect, test } from '@playwright/test';
import { setup } from './helpers';

test('Classifiche: cambio scheda e stagione riportano in alto', async ({ page }) => {
  await setup(page, { publicRole: 'member' });
  await page.goto('/l/san-marcello/classifiche');
  await expect(page.locator('#cl-tabs')).toBeVisible();
  await page.locator('#cl-seasons .chip').last().click();
  const scrollDown = async () => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  };
  await scrollDown();
  await page.locator('#cl-tabs .chip', { hasText: 'Assist' }).click();
  await expect(page.locator('#cl-tabs .chip.active')).toContainText('Assist');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(10);
  await scrollDown();
  await page.locator('#cl-seasons .chip').first().click();
  await expect(page.locator('#cl-seasons .chip').first()).toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(10);
});
