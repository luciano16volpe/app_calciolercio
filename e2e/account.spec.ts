// Pagina d'ingresso (chi non è loggato): logo al centro, Accedi / Registrati, messaggi in italiano, nessuno sbordo a 360 px.
import { expect, test } from '@playwright/test';

const noOverflow = async (page: import('@playwright/test').Page) =>
  expect((await page.evaluate(() => document.documentElement.scrollWidth)) - (page.viewportSize() as { width: number }).width).toBeLessThanOrEqual(0);

test('Ingresso: senza accesso si vede solo la pagina con il logo e Accedi / Registrati', async ({ page }) => {
  await page.goto('/');
  const login = page.locator('#login-page');
  await expect(login).toBeVisible();
  await expect(login.locator('img[alt="CalcioLercio"]')).toBeVisible();
  await expect(page.locator('#mode-in')).toBeVisible();
  await expect(page.locator('#mode-up')).toBeVisible();
  // niente app dietro: né intestazione, né menu, né schede in basso, né rosa
  await expect(page.locator('header')).toHaveCount(0);
  await expect(page.locator('#menu-button')).toHaveCount(0);
  await expect(page.locator('.bottom-nav')).toHaveCount(0);
  await expect(page.locator('#players-list')).toHaveCount(0);
  // il logo sta al centro dello schermo
  const box = await login.locator('img').boundingBox();
  const vw = (page.viewportSize() as { width: number }).width;
  expect(Math.abs((box!.x + box!.width / 2) - vw / 2)).toBeLessThanOrEqual(2);
  await noOverflow(page);
});

test('Ingresso: avvisi sui campi mancanti, registrazione con avviso sul registro, password sbagliata', async ({ page }) => {
  await page.goto('/');
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
  await noOverflow(page);
});

for (const width of [360]) {
  test(`Ingresso a ${width} px: tutto dentro lo schermo`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await page.goto('/');
    await expect(page.locator('#login-page')).toBeVisible();
    await page.locator('#mode-up').click();
    await noOverflow(page);
    const rights = await page.locator('#login-page input, #login-page button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
    for (const r of rights) expect(r).toBeLessThanOrEqual(width + 0.5);
  });
}

test('Ingresso: dal link d\'invito si arriva alla pagina dell\'invito, non a quella d\'ingresso', async ({ page }) => {
  await page.goto('/invito/qualunque');
  await expect(page.locator('#invite-page')).toBeVisible();
});

test('Ingresso: la guida «Installa sul telefono» c\'è, con il testo giusto, e si chiude', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'solo telefono');
  await page.goto('/');
  const hint = page.locator('#login-page #install-hint');
  await expect(hint).toBeVisible();
  const android = /Android/.test(await page.evaluate(() => navigator.userAgent));
  await expect(hint).toContainText(android ? 'Installa app' : 'Aggiungi alla schermata Home');
  await noOverflow(page);
  await hint.getByRole('button', { name: 'Chiudi' }).click();
  await expect(hint).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#login-page')).toBeVisible();
  await expect(page.locator('#install-hint')).toHaveCount(0); // ricordato
});
