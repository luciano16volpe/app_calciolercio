// Partite (passo 3.4): ultima partita, Gazzette, elenco, scheda partita, equilibrio squadre, testo delle pagelle.
import { expect, test, type Page } from '@playwright/test';
import { openPanel, setup } from './helpers';

// l'app si apre solo con l'accesso: la prova entra come membro della lega pubblica vera (accesso simulato, letture vere)
test.beforeEach(async ({ page }) => {
  await setup(page, { publicRole: 'member' });
});

async function openPartite(page: Page) {
  await page.goto('/');
  await expect(page.locator('#players-list .card-compact')).toHaveCount(22, { timeout: 20_000 });
  await page.locator('.bottom-nav').getByRole('button', { name: 'Partite', exact: true }).click();
  return page.locator('#page-partite');
}

const noOverflow = async (page: Page) =>
  expect((await page.evaluate(() => document.documentElement.scrollWidth)) - (page.viewportSize() as { width: number }).width).toBeLessThanOrEqual(0);

test('Partite: ultima partita, striscia delle Gazzette ed elenco per stagione', async ({ page }) => {
  const pt = await openPartite(page);
  await expect(pt.locator('#last-match')).toContainText('Ultima partita');
  await expect(pt.locator('#last-match')).toContainText(/Vince|Pareggio/);
  await expect(pt.locator('#last-match .mbar-btn', { hasText: 'Riepilogo' })).toBeVisible();
  // Gazzette
  expect(await pt.locator('#gaz-strip .gaz-tile').count()).toBeGreaterThanOrEqual(1);
  // elenco: partite divise per stagione
  await expect(pt.locator('#matches-list .section-header')).toContainText('Tutte le partite');
  expect(await pt.locator('#matches-list .season-head').count()).toBeGreaterThanOrEqual(3);
  expect(await pt.locator('#matches-list > div[style*="cursor"]').count()).toBeGreaterThanOrEqual(10);
  await noOverflow(page);
});

test('Scheda partita: risultato, highlights, pagelle di ogni giocatore, equilibrio squadre', async ({ page }) => {
  const pt = await openPartite(page);
  await pt.locator('#last-match .card').click();
  const modal = page.locator('#match-modal');
  await expect(modal).toBeVisible();
  await expect(modal.locator('#match-modal-title')).toContainText('📅');
  // sola lettura: campi disattivati, nessun pulsante −/+
  await expect(modal.locator('#sc-a')).toBeDisabled();
  await expect(modal.locator('.rate-btn')).toHaveCount(0);
  await expect(modal.locator('text=Highlights')).toBeVisible();
  await expect(modal.locator('.rate-stepper input')).toHaveCount(10);
  await expect(modal.locator('.pgt-view').first()).toBeVisible();
  // equilibrio squadre si apre e si chiude
  const btn = modal.locator('#match-balance-btn');
  await btn.click();
  await expect(modal.locator('#match-balance')).toContainText('Squilibrio in gol');
  await expect(modal.locator('#match-balance .cmp-row')).toHaveCount(11);
  await btn.click();
  await expect(modal.locator('#match-balance')).toBeHidden();
  await noOverflow(page);
  // si chiude
  await modal.locator('button', { hasText: '✕' }).first().click();
  await expect(modal).toHaveCount(0);
});

test('Testo delle pagelle: si apre dall\'ultima partita e si chiude', async ({ page }) => {
  const pt = await openPartite(page);
  await pt.locator('#last-match .mbar-btn', { hasText: 'Pagelle' }).click();
  const dlg = page.locator('#pt-dialog');
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('.pt-text')).toContainText('LE PAGELLE DI CALCIOLERCIO');
  await expect(dlg.locator('.pt-text')).toContainText('MVP');
  // nessuna firma fissa: compare solo il nome di chi ha scritto le pagelle (qui non si sa)
  await expect(dlg.locator('.pt-text')).not.toContainText('a cura della Redazione');
  await expect(dlg.locator('.pt-text')).not.toContainText('Avv. Peppe Rella');
  await dlg.locator('button', { hasText: 'Chiudi' }).click();
  await expect(dlg).toHaveCount(0);
});

test('Gazzette: striscia → visualizzatore, archivio per stagione → "Vai alla partita"', async ({ page }) => {
  const pt = await openPartite(page);
  await pt.locator('#gaz-strip .gaz-tile').first().click();
  const viewer = page.locator('#gaz-viewer');
  await expect(viewer).toBeVisible();
  await expect(viewer.locator('.gv-img img')).toBeVisible();
  await expect(viewer.locator('.gv-top')).toContainText('📰');
  await viewer.locator('.gv-top button').click();
  await expect(viewer).toHaveCount(0);
  // archivio
  await pt.locator('#gaz-strip button', { hasText: 'Vedi tutte' }).click();
  const modal = page.locator('#match-modal');
  await expect(modal.locator('#match-modal-title')).toHaveText('📰 Le Gazzette');
  expect(await modal.locator('.gaz-tile').count()).toBeGreaterThanOrEqual(1);
  await modal.locator('.gaz-tile').first().click();
  await expect(viewer).toBeVisible();
  await viewer.locator('button', { hasText: 'Vai alla partita' }).click();
  await expect(modal.locator('#match-modal-title')).toContainText('📅');
  await expect(viewer).toHaveCount(0);
});

test('Collegamenti verso la partita: dai record e dalle pagelle del giocatore', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#players-list .card-compact')).toHaveCount(22, { timeout: 20_000 });
  // dai Record
  await openPanel(page, '#menu-records', '#sheet-record');
  await page.locator('#extra-list .cl-date').first().click();
  await expect(page.locator('#match-modal-title')).toContainText('📅');
  await page.locator('#match-modal button', { hasText: '✕' }).first().click();
  // dalla scheda giocatore → "Le pagelle di…" → "Apri la partita"
  await page.locator('.bottom-nav').getByRole('button', { name: 'Rosa', exact: true }).click();
  await page.locator('.player-header', { hasText: /^.*Peppe/ }).first().click();
  await page.locator('.pg-last').click();
  await page.locator('#pl-dialog .pl-item').first().click(); // il pulsante compare quando la pagella è aperta
  await page.locator('#pl-dialog .pl-go').first().click();
  await expect(page.locator('#match-modal-title')).toContainText('📅');
  await expect(page.locator('#pl-dialog')).toHaveCount(0);
});
