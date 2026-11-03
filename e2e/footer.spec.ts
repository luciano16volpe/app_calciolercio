import { expect, test } from '@playwright/test';
import { setup } from './helpers';

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
