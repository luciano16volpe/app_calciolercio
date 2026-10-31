// Schermate in un telefono emulato (iPhone, Android e uno schermo piccolo da 360 px).
// Leggono i dati veri dalla lega pubblica su Supabase: serve la rete.
import { expect, test } from '@playwright/test';

test('la pagina si apre senza scorrimento orizzontale', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('header')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('Rosa: 22 carte, la più forte per prima, niente esce in orizzontale', async ({ page }) => {
  await page.goto('/');
  const cards = page.locator('#players-list .card-compact');
  await expect(cards).toHaveCount(22, { timeout: 20_000 });
  // prime due: Caputo e Peppe (OVR 7.3, in ordine di nome)
  await expect(cards.nth(0).locator('.player-name-display')).toHaveText('Caputo');
  await expect(cards.nth(1).locator('.player-name-display')).toHaveText('Peppe');
  await expect(cards.nth(0).locator('.ovr-badge')).toHaveText('OVR 7.3');
  // il badge PAG ha il colore giusto (la media di Peppe è appena sotto 6,5: giallo, come nella vecchia app)
  const card = (name: string) => cards.filter({ has: page.locator('.player-name-display', { hasText: new RegExp(`^${name}$`) }) });
  await expect(card('Uefa').locator('.pag-badge')).toHaveClass(/pag-good/);
  await expect(card('Uefa').locator('.pag-badge')).toHaveText('PAG 8.0');
  await expect(card('Caputo').locator('.pag-badge')).toHaveClass(/pag-mid/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // nessuna carta più larga dello schermo
  const widths = await cards.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
  const vw = await page.evaluate(() => window.innerWidth);
  for (const r of widths) expect(r).toBeLessThanOrEqual(vw + 0.5);
});

test('le 4 schede in basso cambiano pagina', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#page-rosa')).toHaveClass(/active/);
  for (const [label, id] of [['Gioca', 'partita'], ['Partite', 'partite'], ['Classifiche', 'classifiche'], ['Rosa', 'rosa']] as const) {
    await page.locator('.bottom-nav').getByText(label, { exact: true }).click();
    await expect(page.locator(`#page-${id}`)).toHaveClass(/active/);
    await expect(page.locator('.bnav-item.active')).toHaveText(label);
  }
});
