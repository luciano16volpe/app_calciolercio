// Leghe dal menu ☰: crea lega, entra con il codice, cambio lega (anche dall'indirizzo /l/<slug>), lega vuota con guida, esci.
import { expect, test } from '@playwright/test';
import { lastWrite, mineAs, noOverflow, openApp, openMenu, openPanel, setup, openProfile } from './helpers';

test('Crea lega: controlli sul nome, poi codice d\'invito e lega scelta', async ({ page }) => {
  const writes = await setup(page, { rpc: { is_super_admin: true } }); // per ora le leghe le crea solo l'amministratore supremo
  await openApp(page);
  await openPanel(page, '#menu-create', '#sheet-create-league');
  await page.locator('#cl-name').fill('Ab');
  await page.locator('#cl-submit').click();
  await expect(page.locator('#toast')).toContainText('da 3 a 40 caratteri');
  expect(writes.length).toBe(0);
  await page.locator('#cl-name').fill('  Calcetto del giovedì ');
  await expect(page.locator('#cl-public')).toHaveCount(0); // non esistono leghe pubbliche: si entra solo su invito
  await expect(page.locator('#cl-private-note')).toContainText('solo con un invito');
  await page.getByRole('button', { name: '7 vs 7' }).click();
  await page.getByRole('button', { name: 'Gio', exact: true }).click();
  await page.locator('#cl-submit').click();
  await expect(page.locator('#sheet-created')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#created-code')).toHaveText('abc12345');
  const body = lastWrite(writes, 'leagues').body as { id: string; name: string; is_public: boolean; settings: unknown };
  expect(body.name).toBe('Calcetto del giovedì');
  expect(body.is_public).toBe(false);
  expect(body.settings).toEqual({ format: 7, day: 4 });
  expect(await page.evaluate(() => localStorage.getItem('calciolercio-league'))).toBe('calcetto-del-giovedi');
  await noOverflow(page);
  await page.getByRole('button', { name: 'Vai alla lega' }).click();
  await expect(page.locator('#sheet-created')).toHaveCount(0);
  await expect(page.locator('#league-pill')).toContainText('Calcetto del giovedì');
});

test('Entra con il codice: scrive il codice senza spazi e apre il profilo', async ({ page }) => {
  const writes = await setup(page);
  await openApp(page);
  await openPanel(page, '#menu-join', '#sheet-join-league');
  await page.locator('#jl-submit').click();
  await expect(page.locator('#toast')).toContainText('Scrivi il codice');
  await page.locator('#jl-code').fill(' abc12345 ');
  await page.locator('#jl-submit').click();
  await expect(page.locator('#toast')).toContainText('Sei dentro la lega', { timeout: 15_000 });
  expect(lastWrite(writes, 'join_league').body).toEqual({ code: 'abc12345' });
  await expect(page.locator('#page-profilo.active')).toBeVisible(); // si sceglie subito chi si è
});

test('Entra con il codice: un codice sbagliato mostra l\'errore del database', async ({ page }) => {
  await setup(page, { rpcError: { join_league: 'Codice non valido' } });
  await openApp(page);
  await openPanel(page, '#menu-join', '#sheet-join-league');
  await page.locator('#jl-code').fill('sbagliato');
  await page.locator('#jl-submit').click();
  await expect(page.locator('#toast')).toContainText('Codice non valido');
  await expect(page.locator('#sheet-join-league')).toBeVisible();
});

test('Cambio lega: dal menu e con l\'indirizzo /l/<slug>', async ({ page }) => {
  await setup(page, { mine: mineAs('member', { owner_id: 'altro' }) });
  // indirizzo diretto: apre la lega indicata e lo ricorda
  await openApp(page, '/l/lega-di-prova/rosa', 0);
  await expect(page.locator('#league-pill')).toContainText('Lega di prova');
  expect(new URL(page.url()).pathname).toBe('/l/lega-di-prova/rosa');
  expect(await page.evaluate(() => localStorage.getItem('calciolercio-league'))).toBe('lega-di-prova');
  // le altre pagine non rompono la lega vuota e restano nell'indirizzo
  for (const [tab, path] of [['Partite', 'partite'], ['Classifiche', 'classifiche'], ['Rosa', 'rosa']] as const) {
    await page.locator('.bottom-nav').getByRole('button', { name: tab, exact: true }).click();
    await expect(page.getByText('Non riesco a caricare i dati')).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe(`/l/lega-di-prova/${path}`);
  }
  // dal menu: torno alla lega pubblica (22 giocatori)
  await openMenu(page);
  await expect(page.locator('.menu-lgrow[aria-current="true"]')).toContainText('Lega di prova');
  await page.locator('.menu-lgrow:not(.add)').filter({ hasNotText: 'Lega di prova' }).first().click();
  await expect(page.locator('#players-list .card-compact')).toHaveCount(22, { timeout: 20_000 });
  expect(new URL(page.url()).pathname).toMatch(/^\/l\/san-marcello\/rosa$/);
  // e di nuovo alla lega di prova dal menu
  await openMenu(page);
  await page.locator('.menu-lgrow[data-slug="lega-di-prova"]').click();
  await expect(page.locator('#league-pill')).toContainText('Lega di prova');
  expect(new URL(page.url()).pathname).toBe('/l/lega-di-prova/rosa');
});

test('Cambio lega: un indirizzo sconosciuto riporta alla lega pubblica', async ({ page }) => {
  await setup(page);
  await openApp(page, '/l/non-esiste/rosa');
  await expect(page.locator('#league-pill')).toContainText('San Marcello');
  expect(new URL(page.url()).pathname).toBe('/l/san-marcello/rosa');
});

test('Lega vuota: la guida non importa giocatori da altre leghe', async ({ page }) => {
  await setup(page, { mine: mineAs('admin'), publicRole: 'admin' });
  await openApp(page, '/', 22); // per conoscere la lega pubblica
  await page.goto('/l/lega-di-prova/rosa');
  await expect(page.locator('#empty-guide')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#guide-new')).toBeVisible();
  await expect(page.locator('#guide-from-leagues')).toHaveCount(0);
  await noOverflow(page);
});

test('Lega vuota: chi non è amministratore non vede la guida', async ({ page }) => {
  await setup(page, { mine: mineAs('member', { owner_id: 'altro' }) });
  await openApp(page, '/l/lega-di-prova/rosa', 0);
  await expect(page.locator('#league-pill')).toContainText('Lega di prova');
  await expect(page.locator('#empty-guide')).toHaveCount(0);
});

test('Esci da una lega dal profilo', async ({ page }) => {
  const writes = await setup(page, { mine: mineAs('member', { owner_id: 'altro' }) });
  await openApp(page, '/l/lega-di-prova/rosa', 0);
  await openProfile(page);
  await page.getByRole('button', { name: 'Esci da Lega di prova' }).click();
  await page.locator('#app-modal-ok').click();
  await expect(page.locator('#toast')).toContainText('Sei uscito dalla lega', { timeout: 15_000 });
  expect(writes.some((x) => x.table === 'league_members' && x.method === 'DELETE')).toBe(true);
});

test('Crea lega: un utente normale non vede il pulsante nel menu', async ({ page }) => {
  await setup(page);
  await openApp(page);
  await openMenu(page);
  await expect(page.locator('#menu-create')).toHaveCount(0);
  await expect(page.locator('#menu-join')).toBeVisible();
});

test('Senza leghe: il benvenuto offre solo «Entra con un codice»; l’amministratore supremo può anche creare', async ({ browser }) => {
  for (const sup of [false, true]) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await setup(page, { publicRole: false, rpc: { is_super_admin: sup } });
    await page.goto('/');
    await expect(page.locator('.page.active #no-league')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.page.active #no-league-join')).toBeVisible();
    await expect(page.locator('.page.active #no-league-create')).toHaveCount(sup ? 1 : 0);
    await ctx.close();
  }
});
