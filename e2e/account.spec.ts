// Account (passo 3.7a): accesso con email e password, messaggi in italiano, nessuno sbordo a 360 px.
import { expect, test } from '@playwright/test';

test('Account: il modulo di accesso si vede e rifiuta una password sbagliata', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#players-list .card-compact')).toHaveCount(22, { timeout: 20_000 });
  await page.locator('header .logo').click();
  const card = page.locator('#account-card');
  await expect(card.locator('input[type=email]')).toBeVisible();
  // senza dati: avviso
  await card.getByRole('button', { name: 'Accedi' }).click();
  await expect(card.locator('#account-msg')).toContainText('Scrivi email e password');
  // password dimenticata senza email: avviso
  await card.getByRole('button', { name: /password dimenticata/ }).click();
  await expect(card.locator('#account-msg')).toContainText('Scrivi prima la tua email');
  // credenziali sbagliate: messaggio chiaro
  await card.locator('input[type=email]').fill('nessuno@example.com');
  await card.locator('input[type=password]').fill('sbagliata123');
  await card.getByRole('button', { name: 'Accedi' }).click();
  await expect(card.locator('#account-msg')).toContainText('Email o password non corrette', { timeout: 15_000 });
  expect((await page.evaluate(() => document.documentElement.scrollWidth)) - (page.viewportSize() as { width: number }).width).toBeLessThanOrEqual(0);
});
