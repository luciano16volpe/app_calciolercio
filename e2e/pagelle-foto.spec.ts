// Pagelle da saltare (elenco, scheda partita, conteggio nel menu della redazione) e foto nei pallini (Rosa, Gioca, menu, intestazione).
// Database finto condiviso con i dati veri di prova.
import { expect, test, type Browser, type TestInfo } from '@playwright/test';
import { FakeBackend } from './fakeBackend';
import { openMenu } from './helpers';

function league(be: FakeBackend, role: 'admin' | 'redazione') {
  const u = be.addUser('u-1', 'u1@example.com', 'Utente Prova');
  be.leagues.push({ id: 'SM', name: 'San Marcello', slug: 'san-marcello', is_public: false, invite_code: 'smsmsmsm', owner_id: role === 'admin' ? u : null, settings: {}, created_at: '2026-01-01' });
  be.members.push({ league_id: 'SM', user_id: u, role, joined_at: '2026-01-01' });
  be.seedLegacy('SM');
  return u;
}
async function open(browser: Browser, testInfo: TestInfo, be: FakeBackend, user: string, path = '/l/san-marcello/rosa') {
  const { defaultBrowserType: _ignored, ...use } = testInfo.project.use;
  void _ignored;
  const ctx = await browser.newContext({ ...use });
  await be.attach(ctx, user);
  await ctx.addInitScript(() => localStorage.removeItem('calciolercio-cache'));
  const page = await ctx.newPage();
  await page.goto(path);
  await expect(page.locator('#players-list .card-compact').first()).toBeVisible({ timeout: 20_000 });
  return page;
}

/** Toglie titoli e descrizioni alle due partite giocate più recenti (sono «da scrivere») e dice quante partite da scrivere ci sono in tutto
 *  (i dati di prova ne hanno già alcune senza descrizioni). */
function strip(be: FakeBackend): number {
  const played = [...be.matches].filter((x) => x.score_a != null && x.score_b != null).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const ids = played.slice(0, 2).map((x) => String(x.id));
  for (const r of be.mplayers) if (ids.includes(String(r.match_id))) { r.titolo = null; r.descrizione = null; }
  const hasText = (id: string) => be.mplayers.some((r) => r.match_id === id && (String(r.titolo ?? '').trim() || String(r.descrizione ?? '').trim()));
  return played.filter((x) => !hasText(String(x.id))).length;
}

test('Pagelle: elenco «senza pagelle», Salta e Rimetti; il conteggio nel menu segue', async ({ browser }, testInfo) => {
  const be = new FakeBackend();
  const u = league(be, 'admin');
  const n = strip(be);
  const page = await open(browser, testInfo, be, u);
  await openMenu(page);
  await expect(page.locator('#menu-pending')).toContainText(`${n} da scrivere o saltare`);
  await page.locator('#menu-pending').click();
  const sheet = page.locator('#sheet-pending');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.pending-row')).toHaveCount(n);
  await expect(sheet.locator('#pending-skipped')).toHaveCount(0);
  // salto la prima
  await sheet.locator('.pending-row').first().getByRole('button', { name: /^Salta/ }).click();
  await expect(page.locator('#toast')).toContainText('saltate');
  expect(be.matches.filter((x) => x.ratings_skipped === true).length).toBe(1);
  await expect(sheet.locator('.pending-row')).toHaveCount(n); // (n - 1) da scrivere + 1 tra le saltate
  await expect(sheet.locator('#pending-skipped')).toContainText('Saltate (1)');
  // la rimetto
  await sheet.locator('#pending-skipped .pending-row').getByRole('button', { name: /^Rimetti/ }).click();
  await expect(page.locator('#toast')).toContainText('rimesse da scrivere');
  await expect(sheet.locator('.pending-row')).toHaveCount(n);
  await expect(sheet.locator('#pending-skipped')).toHaveCount(0);
  expect(be.matches.some((x) => x.ratings_skipped === true)).toBe(false);
});

test('Pagelle: la redazione vede il conteggio senza le saltate, e salta dalla scheda della partita', async ({ browser }, testInfo) => {
  const be = new FakeBackend();
  const u = league(be, 'redazione');
  const n = strip(be);
  const page = await open(browser, testInfo, be, u);
  await openMenu(page);
  await expect(page.locator('#menu-red-pending .menu-bd')).toHaveText(String(n));
  await page.locator('#menu-red-list').click();
  await expect(page.locator('#sheet-pending')).toBeVisible();
  await page.getByRole('button', { name: 'Indietro' }).click();
  // dalla scheda dell'ultima partita
  await page.locator('.bottom-nav').getByText('Partite', { exact: true }).click();
  await page.locator('#last-match .card').click();
  await expect(page.locator('#skip-ratings')).toContainText('Non scrivere le pagelle');
  await page.locator('#skip-ratings').click();
  await expect(page.locator('#skip-ratings')).toContainText('Rimetti tra le pagelle da scrivere');
  await page.locator('#match-modal button', { hasText: '✕' }).first().click();
  await openMenu(page);
  await expect(page.locator('#menu-red-pending .menu-bd')).toHaveText(String(n - 1)); // l'ultima è saltata
});

test('Foto: dentro il pallino in Rosa, in Gioca, nel menu e nell’intestazione (se il giocatore ha la foto)', async ({ browser }, testInfo) => {
  const be = new FakeBackend();
  const u = league(be, 'admin');
  const me = be.players[0] as { id: string; name: string; photo_path: string | null; user_id: string | null };
  me.photo_path = 'foto-di-prova.jpg';
  me.user_id = u; // il mio giocatore: la sua foto va anche in alto
  const page = await open(browser, testInfo, be, u);
  const urlOf = (loc: ReturnType<typeof page.locator>) => loc.evaluate((el) => getComputedStyle(el).backgroundImage);
  // Rosa: un solo pallino con la foto, gli altri con le iniziali
  await expect(page.locator('#players-list .avatar.has-photo')).toHaveCount(1);
  expect(await urlOf(page.locator('#players-list .avatar.has-photo'))).toContain('foto-di-prova.jpg');
  expect(await page.locator('#players-list .avatar.has-photo').evaluate((el) => getComputedStyle(el).color)).toMatch(/rgba\(0, 0, 0, 0\)|transparent/); // le iniziali restano nella pagina ma non si vedono
  await expect(page.locator('#players-list .avatar:not(.has-photo)').first()).not.toHaveText('');
  // intestazione: la mia foto
  expect(await urlOf(page.locator('#menu-button .hf-av'))).toContain('foto-di-prova.jpg');
  // Gioca (amministratore): il pallino della lista di convocazione
  await page.locator('.bottom-nav').getByText('Gioca', { exact: true }).click();
  await expect(page.locator('#page-partita .conv-avatar.has-photo')).toHaveCount(1);
  expect(await urlOf(page.locator('#page-partita .conv-avatar.has-photo'))).toContain('foto-di-prova.jpg');
  // menu: il cerchio in alto mostra la foto, non l'iniziale
  await openMenu(page);
  await expect(page.locator('#menu-avatar img')).toHaveAttribute('src', /foto-di-prova\.jpg/);
});
