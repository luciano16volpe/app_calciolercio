// Immagini da condividere (passo 3.6): figurina, formazioni, foglio, riepilogo, confronto — iPhone, Android e 360 px.
// Si controlla che le immagini si generino davvero nel browser (anche su Safari), che il visualizzatore a schermo intero si apra
// e che Condividi / Salva funzionino. Con SHOTS_DIR=<cartella> le immagini generate vengono anche salvate per guardarle.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { openPanel, setup } from './helpers';

// «Gioca» c'è solo per gli amministratori: la prova entra come amministratore di San Marcello (accesso simulato, letture vere)
test.beforeEach(async ({ page }) => {
  // These tests verify the download fallback; avoid the operating system share dialog.
  await page.addInitScript(() => Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false }));
  await setup(page, { publicRole: 'admin' });
});

async function openApp(page: Page) {
  await page.goto('/l/san-marcello/rosa');
  await expect(page.locator('#players-list .card-compact')).toHaveCount(22, { timeout: 20_000 });
  await page.evaluate(() => localStorage.removeItem('calciolercio-format'));
}
const nav = (page: Page, name: string) => page.locator('.bottom-nav').getByRole('button', { name: name, exact: true }).click();

/** L'immagine mostrata nel visualizzatore: misure vere e, se richiesto, file salvato. */
async function viewerImage(page: Page, label: string, testInfo: { project: { name: string } }) {
  const viewer = page.locator('#img-viewer');
  await expect(viewer).toBeVisible({ timeout: 15_000 });
  const img = viewer.locator('.gv-img img');
  await expect.poll(async () => img.evaluate((i: HTMLImageElement) => i.naturalWidth), { timeout: 15_000 }).toBeGreaterThan(0);
  const size = await img.evaluate((i: HTMLImageElement) => ({ w: i.naturalWidth, h: i.naturalHeight }));
  const dir = process.env.SHOTS_DIR;
  if (dir) {
    const b64 = await img.evaluate(async (i: HTMLImageElement) => {
      const buf = await (await fetch(i.src)).arrayBuffer();
      let s = '';
      new Uint8Array(buf).forEach((b) => (s += String.fromCharCode(b)));
      return btoa(s);
    });
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${label}-${testInfo.project.name}.png`), Buffer.from(b64, 'base64'));
  }
  return { viewer, size };
}

const noOverflow = async (page: Page) =>
  expect((await page.evaluate(() => document.documentElement.scrollWidth)) - (page.viewportSize() as { width: number }).width).toBeLessThanOrEqual(0);

test('Figurina: si apre a schermo intero, a doppia risoluzione, con Condividi e Salva', async ({ page }, testInfo) => {
  await openApp(page);
  await page.locator('#players-list .card-compact').first().click();
  await page.locator('.fut-mini').first().click();
  const { viewer, size } = await viewerImage(page, 'figurina', testInfo);
  expect(size).toEqual({ w: 1440, h: 2280 }); // 720×1140 a doppia risoluzione
  await expect(viewer.locator('.gv-top')).toContainText('🃏 La figurina di');
  await expect(viewer.locator('.gv-btns button')).toHaveText(['📲 Condividi', '⬇️ Salva']);
  // tocco sull'immagine = ingrandisce / rimpicciolisce
  await viewer.locator('.gv-img').click();
  await expect(viewer.locator('.gv-img')).toHaveClass(/zoom/);
  await viewer.locator('.gv-img').click();
  await expect(viewer.locator('.gv-img')).not.toHaveClass(/zoom/);
  // Salva scarica il file
  const [dl] = await Promise.all([page.waitForEvent('download'), viewer.locator('.gv-btns button', { hasText: 'Salva' }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^figurina_.+\.png$/);
  // si chiude
  await viewer.locator('.gv-top button').click();
  await expect(page.locator('#img-viewer')).toHaveCount(0);
  await noOverflow(page);
});

test('Gioca: formazioni a schermo intero e foglio da stampare scaricato', async ({ page }, testInfo) => {
  test.setTimeout(90_000); // le immagini grandi sono lente da generare mentre girano più prove insieme
  await openApp(page);
  await nav(page, 'Gioca');
  const g = page.locator('#page-partita');
  await g.locator('button', { hasText: 'Seleziona i primi' }).click();
  await g.locator('button', { hasText: 'Genera squadre bilanciate' }).click();
  const res = g.locator('#partita-result');
  await expect(res).toBeVisible();
  await res.locator('button', { hasText: 'Condividi' }).click();
  const { viewer, size } = await viewerImage(page, 'formazioni', testInfo);
  expect(size.w).toBe(1800);
  expect(size.h).toBeGreaterThan(1000);
  await expect(viewer.locator('.gv-top')).toContainText('⚽ Formazioni di oggi');
  await viewer.locator('.gv-top button').click();
  await expect(page.locator('#img-viewer')).toHaveCount(0);
  // foglio: si genera e si scarica (sul computer non c'è la finestra di condivisione)
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), res.locator('button', { hasText: 'Foglio' }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^foglio_partita_\d{4}-\d{2}-\d{2}\.png$/);
  await noOverflow(page);
});

test('Partite: il riepilogo della partita si apre a schermo intero', async ({ page }, testInfo) => {
  await openApp(page);
  await nav(page, 'Partite');
  await page.locator('#last-match .mbar-btn', { hasText: 'Riepilogo' }).click();
  const { viewer, size } = await viewerImage(page, 'riepilogo', testInfo);
  expect(size.w).toBe(1800);
  expect(size.h).toBeGreaterThan(1500);
  await expect(viewer.locator('.gv-top')).toContainText('🖼️ Riepilogo ·');
  await viewer.locator('.gv-top button').click();
  await expect(page.locator('#img-viewer')).toHaveCount(0);
  // anche dalla scheda partita
  await page.locator('#last-match .card').click();
  await page.locator('#mbar-share .mbar-btn', { hasText: 'Riepilogo' }).click();
  await expect(page.locator('#img-viewer')).toBeVisible({ timeout: 15_000 });
});

test('Confronto: l\'immagine si genera e si scarica', async ({ page }) => {
  await openApp(page);
  await openPanel(page, '#menu-compare', '#sheet-compare');
  const box = page.locator('#cmp-box');
  await expect(box.locator('.vs-cards .fut-mini')).toHaveCount(2);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20_000 }), box.locator('button', { hasText: 'Condividi il confronto' }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^confronto_.+_vs_.+\.png$/);
  await noOverflow(page);
});
