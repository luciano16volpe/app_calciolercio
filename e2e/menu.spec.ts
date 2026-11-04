// Menu laterale (☰): apertura e chiusura, sezioni per ruolo, nessuno sbordo a 320 / 360 / 390 px.
import { expect, test } from '@playwright/test';
import { lastWrite, mineAs, noOverflow, openApp, openMenu, setup } from './helpers';

test('Menu: si apre e si chiude con ✕, toccando lo scuro e con Esc', async ({ page }) => {
  await setup(page);
  await openApp(page);
  await expect(page.locator('#menu-drawer')).toHaveCount(0);
  await openMenu(page);
  await expect(page.locator('html')).toHaveClass(/menu-open/);
  await page.getByRole('button', { name: 'Chiudi il menu' }).click();
  await expect(page.locator('#menu-drawer')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveClass(/menu-open/);
  // toccando la parte scura (a destra del menu)
  await openMenu(page);
  const w = (page.viewportSize() as { width: number }).width;
  await page.locator('.menu-dim').click({ position: { x: w - 4, y: 300 } });
  await expect(page.locator('#menu-drawer')).toHaveCount(0);
  // con Esc
  await openMenu(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu-drawer')).toHaveCount(0);
  // anche la pillola con la lega apre il menu
  await page.locator('#league-pill').click();
  await expect(page.locator('#menu-drawer')).toBeVisible();
});

test('Menu: voci comuni e accesso alle funzioni giocatori', async ({ page }) => {
  await setup(page);
  await openApp(page);
  await openMenu(page);
  await expect(page.locator('.menu-nm')).toHaveText('Luciano');
  await expect(page.locator('#menu-players')).toBeVisible();
  await expect(page.locator('.menu-lgrow:not(.add)')).toHaveCount(1);
  await expect(page.locator('#menu-create')).toHaveCount(0); // per ora le leghe le crea solo l'amministratore supremo
  await expect(page.locator('#menu-join')).toBeVisible();
  await expect(page.locator('#menu-signout')).toBeVisible();
  await expect(page.locator('#menu-login')).toHaveCount(0);
  await page.locator('#menu-players').click();
  for (const id of ['#menu-compare', '#menu-couples', '#menu-albo', '#menu-records']) await expect(page.locator(id)).toBeVisible();
});

test('Menu: le sezioni cambiano con il ruolo nella lega', async ({ page }) => {
  // Il membro vede le funzioni comuni, senza quelle di amministrazione.
  await setup(page, { mine: mineAs('member', { owner_id: 'altro' }) });
  await openApp(page, '/l/lega-di-prova/rosa', 0);
  await openMenu(page);
  await expect(page.locator('#menu-role')).toContainText('Membro · Lega di prova');
  await expect(page.locator('#menu-players')).toBeVisible();
  await expect(page.locator('#menu-members')).toHaveCount(0);
  await expect(page.locator('#menu-red-list')).toHaveCount(0);
  await expect(page.locator('#menu-signout')).toBeVisible();
});

test('Menu: la redazione vede la sezione Redazione e non la Gestione', async ({ page }) => {
  await setup(page, { mine: mineAs('redazione', { owner_id: 'altro' }) });
  await openApp(page, '/l/lega-di-prova/rosa', 0);
  await openMenu(page);
  await expect(page.locator('#menu-role')).toContainText('Redazione');
  await expect(page.locator('#menu-red-list')).toBeVisible();
  await expect(page.locator('#menu-members')).toHaveCount(0);
});

test('Menu: l\'amministratore (non creatore) vede la Gestione ma non le proposte', async ({ page }) => {
  await setup(page, { mine: mineAs('admin', { owner_id: 'altro' }) });
  await openApp(page, '/l/lega-di-prova/rosa', 0);
  await openMenu(page);
  for (const id of ['#menu-members', '#menu-invites', '#menu-claims', '#menu-merge', '#menu-league-settings', '#menu-code']) await expect(page.locator(id)).toBeVisible();
  await expect(page.locator('#menu-code')).toHaveText('abc12345');
  await expect(page.locator('#menu-proposals')).toHaveCount(0);
});

test('Menu: il creatore vede anche le proposte di amministratore', async ({ page }) => {
  await setup(page, { mine: mineAs('admin') }); // owner_id = u1 = io
  await openApp(page, '/l/lega-di-prova/rosa', 0);
  await openMenu(page);
  await expect(page.locator('#menu-role')).toContainText('Admin (creatore)');
  await expect(page.locator('#menu-proposals')).toBeVisible();
});

test('Menu: «Esci» avvisa il registro attività prima di uscire', async ({ page }) => {
  const writes = await setup(page);
  await openApp(page);
  await openMenu(page);
  await page.locator('#menu-signout').click();
  await expect.poll(() => writes.some((w) => w.table === 'log_event')).toBe(true);
  expect(lastWrite(writes, 'log_event').body).toEqual({ p_action: 'auth.logout' });
});

test('Menu: l\'amministratore supremo vede la sezione Piattaforma', async ({ page }) => {
  await setup(page, { mine: mineAs('member', { owner_id: 'altro' }), rpc: { is_super_admin: true } });
  await openApp(page, '/l/lega-di-prova/rosa', 0);
  await openMenu(page);
  await expect(page.locator('.menu-chip.gold')).toContainText('Amministratore supremo');
  for (const id of ['#menu-audit', '#menu-platform-leagues', '#menu-platform-users', '#menu-premium']) await expect(page.locator(id)).toBeVisible();
  await page.locator('#menu-premium').click();
  await expect(page.locator('#sheet-premium')).toBeVisible();
  await page.getByRole('button', { name: /Prova gratuita/ }).click();
  await expect(page.locator('#sheet-premium')).toContainText('un mese di Premium');
  await page.getByRole('button', { name: 'Torna a Premium' }).click();
  await page.getByRole('button', { name: /Abbonamenti/ }).click();
  await expect(page.locator('#sheet-platform-users')).toBeVisible();
});

for (const width of [360]) {
  test(`Menu a ${width} px: niente esce in orizzontale e si arriva in fondo`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await setup(page, { mine: mineAs('admin'), rpc: { is_super_admin: true } });
    await openApp(page, '/l/lega-di-prova/rosa', 0);
    await openMenu(page);
    await noOverflow(page);
    await page.locator('#menu-help').scrollIntoViewIfNeeded();
    await expect(page.locator('#menu-signout')).toBeVisible();
  });
}
