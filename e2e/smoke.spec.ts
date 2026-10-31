import { expect, test } from '@playwright/test';

test('la pagina si apre senza scorrimento orizzontale', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('header')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
