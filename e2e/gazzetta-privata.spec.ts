import { expect, test } from '@playwright/test';
import { json, openApp, setup } from './helpers';

test('le Gazzette usano URL firmati per la sessione', async ({ page }) => {
  await setup(page);
  await openApp(page);
  await page.locator('.bottom-nav').getByRole('button', { name: 'Partite', exact: true }).click();
  const image = page.locator('#gaz-strip img').first();
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('src', /token=fake/);
});

test('anteprima visibile anche quando manca il file della miniatura', async ({ page }) => {
  await setup(page);
  await page.route('**/storage/v1/object/sign/gazzette/**', (r) =>
    new URL(r.request().url()).pathname.endsWith('-t.jpg')
      ? json(r, { error: 'not_found', message: 'Object not found', statusCode: '404' }, 400)
      : json(r, { signedURL: '/object/public/gazzette/test.jpg?token=full' }));
  await openApp(page);
  await page.locator('.bottom-nav').getByRole('button', { name: 'Partite', exact: true }).click();
  const image = page.locator('#gaz-strip img').first();
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('src', /token=full/);
});
