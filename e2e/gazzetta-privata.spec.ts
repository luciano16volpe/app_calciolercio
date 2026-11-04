import { expect, test } from '@playwright/test';
import { openApp, setup } from './helpers';

test('le Gazzette usano URL firmati per la sessione', async ({ page }) => {
  await setup(page);
  await openApp(page);
  await page.locator('.bottom-nav').getByRole('button', { name: 'Partite', exact: true }).click();
  const image = page.locator('#gaz-strip img').first();
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('src', /token=fake/);
});
