// Account (passo 3.7a): accesso con email e password, messaggi in italiano, nessuno sbordo a 360 px.
import { expect, test } from '@playwright/test';
import { openSettings } from './helpers';

test('Account: il modulo di accesso si vede e rifiuta una password sbagliata', async ({ page }) => {
  await openSettings(page);
  const card = page.locator('#account-card');
  await expect(card.locator('input[type=email]')).toBeVisible();
  // senza dati: avviso
  await card.locator('button.btn-primary').click();
  await expect(card.locator('#account-msg')).toContainText('Scrivi email e password');
  // password dimenticata senza email: avviso
  await card.getByRole('button', { name: /password dimenticata/i }).click();
  await expect(card.locator('#account-msg')).toContainText('Scrivi prima la tua email');
  // la registrazione mostra l'avviso sul registro attività
  await card.locator('#mode-up').click();
  await expect(card.locator('#signup-notice')).toContainText('registriamo le azioni');
  await card.locator('#mode-in').click();
  // credenziali sbagliate: messaggio chiaro
  await card.locator('input[type=email]').fill('nessuno@example.com');
  await card.locator('input[type=password]').fill('sbagliata123');
  await card.locator('button.btn-primary').click();
  await expect(card.locator('#account-msg')).toContainText('Email o password non corrette', { timeout: 15_000 });
  expect((await page.evaluate(() => document.documentElement.scrollWidth)) - (page.viewportSize() as { width: number }).width).toBeLessThanOrEqual(0);
});
