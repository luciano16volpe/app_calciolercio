// Impostazioni (passo 3.8): versione, formazioni, forma recente, pesi in sola lettura, account.
import { expect, test, type Page } from '@playwright/test';
import { openSettings as openSettingsFromMenu, setup } from './helpers';

// l'app si apre solo con l'accesso: la prova entra come membro della lega pubblica vera (accesso simulato, letture vere)
test.beforeEach(async ({ page }) => {
  await setup(page, { publicRole: 'member' });
});

const openSettings = (page: Page) => openSettingsFromMenu(page);
const noOverflow = async (page: Page) =>
  expect((await page.evaluate(() => document.documentElement.scrollWidth)) - (page.viewportSize() as { width: number }).width).toBeLessThanOrEqual(0);

test('Aspetto: chiaro, scuro e come il telefono; la scelta resta dopo il riavvio', async ({ page }) => {
  await openSettings(page);
  const bg = () => page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--gray').trim());
  const attr = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await expect(page.locator('#theme-auto')).toHaveAttribute('aria-checked', 'true');
  await page.locator('#theme-dark').click();
  expect(await attr()).toBe('dark');
  expect(await bg()).toBe('#181c24');
  await page.locator('#theme-light').click();
  expect(await attr()).toBe('light');
  expect(await bg()).toBe('#f2f4f7');
  await page.reload();
  expect(await attr()).toBe('light'); // ricordato
  await openSettings(page);
  await expect(page.locator('#theme-light')).toHaveAttribute('aria-checked', 'true');
  await page.locator('#theme-auto').click();
  expect(await attr()).toBeNull();
  await noOverflow(page);
});

test('Aspetto: scegliere «Scuro» vale anche se il telefono è in chiaro, e «Chiaro» se è in scuro', async ({ browser }) => {
  for (const [phone, pick, want] of [['light', 'dark', '#181c24'], ['dark', 'light', '#f2f4f7']] as const) {
    const ctx = await browser.newContext({ colorScheme: phone });
    const page = await ctx.newPage();
    await setup(page, { publicRole: 'member' });
    await openSettings(page);
    await page.locator(`#theme-${pick}`).click();
    expect(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--gray').trim())).toBe(want);
    await ctx.close();
  }
});

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

