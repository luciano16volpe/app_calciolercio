// Impostazioni (passo 3.8): versione, formazioni, forma recente, pesi in sola lettura, account.
import { expect, test, type Page } from '@playwright/test';
import { openSettings as openSettingsFromMenu } from './helpers';

const openSettings = (page: Page) => openSettingsFromMenu(page);
const noOverflow = async (page: Page) =>
  expect((await page.evaluate(() => document.documentElement.scrollWidth)) - (page.viewportSize() as { width: number }).width).toBeLessThanOrEqual(0);

test('Impostazioni: solo versione, aggiornamento e account (le regole di gioco sono nel menu)', async ({ page }) => {
  await openSettings(page);
  await expect(page.locator('#app-version')).not.toBeEmpty();
  await expect(page.locator('#account-card')).toBeVisible();
  // formazioni, forma recente e pesi non si vedono più qui
  await expect(page.locator('.module-tile')).toHaveCount(0);
  await expect(page.locator('#form-switch')).toHaveCount(0);
  await expect(page.locator('.w-row')).toHaveCount(0);
  await noOverflow(page);
});

test('Impostazioni: Aggiorna app risponde', async ({ page }) => {
  await openSettings(page);
  await page.locator('#update-app').click();
  await expect(page.locator('#toast')).toContainText(/ultima versione|Controllo|Scarico|Non riesco/);
});
