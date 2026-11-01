// Impostazioni (passo 3.8): versione, formazioni, forma recente, pesi in sola lettura, account.
import { expect, test, type Page } from '@playwright/test';
import { openMenu, openSettings as openSettingsFromMenu } from './helpers';

const openSettings = (page: Page) => openSettingsFromMenu(page);
const noOverflow = async (page: Page) =>
  expect((await page.evaluate(() => document.documentElement.scrollWidth)) - (page.viewportSize() as { width: number }).width).toBeLessThanOrEqual(0);

test('Impostazioni: versione, formazioni predefinite, pesi e account', async ({ page }) => {
  await openSettings(page);
  await expect(page.locator('#app-version')).not.toBeEmpty();
  await expect(page.locator('.module-tile')).toHaveCount(10); // 3 + 4 + 3
  await expect(page.locator('.module-tile').first()).toContainText('1-1-2-1');
  await expect(page.locator('#settings-inner .w-row')).toHaveCount(11);
  await expect(page.locator('#settings-inner .w-pill-on')).toHaveCount(11);
  await expect(page.locator('#account-card')).toBeVisible();
  await noOverflow(page);
});

test('Impostazioni: aggiungi e togli una formazione (resta sul telefono)', async ({ page }) => {
  await openSettings(page);
  await page.locator('#add-toggle-5').click();
  // somma sbagliata
  await page.locator('#new-def-5').fill('2');
  await page.locator('#new-med-5').fill('2');
  await page.locator('#new-att-5').fill('1');
  await page.locator('#add-form-5').getByRole('button', { name: 'Aggiungi' }).click();
  await expect(page.locator('#toast')).toContainText('devono sommare 4 (ora: 5)');
  // doppione
  await page.locator('#new-def-5').fill('1');
  await page.locator('#add-form-5').getByRole('button', { name: 'Aggiungi' }).click();
  await expect(page.locator('#toast')).toContainText('già presente');
  // valida
  await page.locator('#new-def-5').fill('0');
  await page.locator('#new-med-5').fill('4');
  await page.locator('#new-att-5').fill('0');
  await page.locator('#new-desc-5').fill('solo centrocampo');
  await page.locator('#add-form-5').getByRole('button', { name: 'Aggiungi' }).click();
  await expect(page.locator('#toast')).toContainText('Formazione 1-0-4-0 aggiunta');
  await expect(page.locator('.module-tile')).toHaveCount(11);
  await page.reload();
  await expect(page.locator('#players-list .card-compact')).toHaveCount(22, { timeout: 20_000 });
  await openMenu(page);
  await page.locator('#menu-app-settings').click();
  await expect(page.locator('.module-tile', { hasText: '1-0-4-0' })).toBeVisible();
  // toglila
  await page.getByRole('button', { name: 'Rimuovi 1-0-4-0' }).click();
  await page.locator('#app-modal-ok').click();
  await expect(page.locator('.module-tile')).toHaveCount(10);
  expect(await page.evaluate(() => localStorage.getItem('calc5_modules'))).not.toContain('1-0-4-0');
  await noOverflow(page);
});

test('Impostazioni: forma recente si spegne e si riaccende', async ({ page }) => {
  await openSettings(page);
  const sw = page.locator('#form-switch');
  await expect(sw).toHaveClass(/on/);
  await sw.click();
  await expect(page.locator('#toast')).toContainText('Forma recente disattivata');
  expect(await page.evaluate(() => localStorage.getItem('calcio_useform'))).toBe('0');
  await sw.click();
  await expect(page.locator('#toast')).toContainText('Forma recente attiva');
  expect(await page.evaluate(() => localStorage.getItem('calcio_useform'))).toBe('1');
});

test('Impostazioni: Aggiorna app risponde', async ({ page }) => {
  await openSettings(page);
  await page.locator('#update-app').click();
  await expect(page.locator('#toast')).toContainText(/ultima versione|Controllo|Scarico|Non riesco/);
});
