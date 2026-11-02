// Gioca (passo 3.5): formato, convocati, sorteggio, campo, proposte, scambio trascinando — iPhone, Android e 360 px.
import { expect, test, type Page } from '@playwright/test';
import { setup } from './helpers';

// «Gioca» c'è solo per gli amministratori: la prova entra come amministratore di San Marcello (accesso simulato, letture vere)
test.beforeEach(async ({ page }) => {
  await setup(page, { publicRole: 'admin' });
});

async function openGioca(page: Page) {
  await page.goto('/');
  await expect(page.locator('#players-list .card-compact')).toHaveCount(22, { timeout: 20_000 });
  await page.evaluate(() => localStorage.removeItem('calciolercio-format'));
  await page.reload();
  await expect(page.locator('#players-list .card-compact')).toHaveCount(22, { timeout: 20_000 });
  await page.locator('.bottom-nav').getByText('Gioca', { exact: true }).click();
  return page.locator('#page-partita');
}

const noOverflow = async (page: Page) =>
  expect((await page.evaluate(() => document.documentElement.scrollWidth)) - (page.viewportSize() as { width: number }).width).toBeLessThanOrEqual(0);

test('Gioca: formato, convocati e contatore', async ({ page }) => {
  const g = await openGioca(page);
  await expect(g.locator('#fmt-5')).toHaveClass(/active/);
  await expect(g.locator('#conv-list .conv-item')).toHaveCount(22);
  await expect(g.locator('#sel-cnt')).toHaveText('0');
  await expect(g.locator('#needed-n2')).toHaveText('10');
  // un tocco sceglie un giocatore, un altro lo toglie
  await g.locator('#conv-list .conv-item').nth(3).click();
  await expect(g.locator('#sel-cnt')).toHaveText('1');
  await expect(g.locator('#conv-list .conv-item').nth(3)).toHaveClass(/sel/);
  await g.locator('#conv-list .conv-item').nth(3).click();
  await expect(g.locator('#sel-cnt')).toHaveText('0');
  // "Seleziona i primi" prende i più forti, "Tutti" toglie
  await g.locator('button', { hasText: 'Seleziona i primi' }).click();
  await expect(g.locator('#sel-cnt')).toHaveText('10');
  await expect(g.locator('#conv-list .conv-item.sel')).toHaveCount(10);
  await g.locator('button', { hasText: '✕ Tutti' }).click();
  await expect(g.locator('#sel-cnt')).toHaveText('0');
  // 6 vs 6 e squadre asimmetriche
  await g.locator('#fmt-6').click();
  await expect(g.locator('#needed-n2')).toHaveText('12');
  await expect(g.locator('#fmt-6')).toHaveClass(/active/);
  await g.locator('.asym-toggle').click();
  await expect(g.locator('#asym-controls')).toBeVisible();
  await expect(g.locator('#sz-a')).toHaveText('6');
  await expect(g.locator('#sz-b')).toHaveText('7');
  await expect(g.locator('#needed-n2')).toHaveText('13');
  await g.locator('#asym-controls .adj-btn').nth(1).click(); // + sul Blu
  await expect(g.locator('#sz-a')).toHaveText('7');
  await noOverflow(page);
  // il formato resta ricordato
  await page.reload();
  await page.locator('.bottom-nav').getByText('Gioca', { exact: true }).click();
  await expect(page.locator('#sz-a')).toHaveText('7');
});

test('Gioca: servono i convocati giusti, poi il sorteggio mostra campo, squadre e proposte', async ({ page }) => {
  const g = await openGioca(page);
  // senza convocati: avviso e nessun risultato
  await g.locator('button', { hasText: 'Genera squadre bilanciate' }).click();
  await expect(page.locator('#toast')).toContainText('Seleziona esattamente 10 giocatori (0/10)');
  await expect(g.locator('#partita-result')).toHaveCount(0);
  // con i 10 più forti
  await g.locator('button', { hasText: 'Seleziona i primi' }).click();
  await g.locator('button', { hasText: 'Genera squadre bilanciate' }).click();
  const res = g.locator('#partita-result');
  await expect(res).toBeVisible();
  await expect(res.locator('#pitch-svg text')).toHaveCount(10); // un nome per giocatore sul campo
  await expect(res.locator('#chips-a .pchip')).toHaveCount(5);
  await expect(res.locator('#chips-b .pchip')).toHaveCount(5);
  await expect(res.locator('#avg-a')).toContainText('Media');
  await expect(res.locator('#mod-label-a')).toContainText('1-');
  await expect(res.locator('#stat-cmp .cmp-row')).toHaveCount(11);
  await expect(res.locator('#bal-row')).toContainText('diff');
  await expect(res.locator('#combo-idx')).toHaveText('1 / 50');
  // ▶ e ◀ cambiano proposta
  await res.locator('.combo-btn').nth(1).click();
  await expect(res.locator('#combo-idx')).toHaveText('2 / 50');
  await res.locator('.combo-btn').nth(0).click();
  await res.locator('.combo-btn').nth(0).click();
  await expect(res.locator('#combo-idx')).toHaveText('50 / 50'); // si riparte dall'ultima
  await res.locator('.combo-btn').nth(1).click();
  await expect(res.locator('#combo-idx')).toHaveText('1 / 50');
  // la precisione c'è
  await expect(res.locator('#gioca-precision')).toContainText('Precisione bilanciamento');
  await noOverflow(page);
});

test('Gioca: si scambia un giocatore trascinandolo sull\'altra squadra', async ({ page }) => {
  const g = await openGioca(page);
  await g.locator('button', { hasText: 'Seleziona i primi' }).click();
  await g.locator('button', { hasText: 'Genera squadre bilanciate' }).click();
  const res = g.locator('#partita-result');
  await expect(res).toBeVisible();
  await res.scrollIntoViewIfNeeded();
  const a = res.locator('#chips-a .pchip').first();
  const b = res.locator('#chips-b .pchip').first();
  await a.scrollIntoViewIfNeeded();
  const nameA = await a.locator('.pchip-name').innerText();
  const nameB = await b.locator('.pchip-name').innerText();
  const ba = (await a.boundingBox())!;
  const bb = (await b.boundingBox())!;
  await page.mouse.move(ba.x + ba.width / 2, ba.y + ba.height / 2);
  await page.mouse.down();
  await page.mouse.move(ba.x + ba.width / 2 + 12, ba.y + ba.height / 2 + 12, { steps: 3 });
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(res.locator('#combo-idx')).toHaveText('✏️ Personalizzata');
  await expect(res.locator('#chips-a')).toContainText(nameB);
  await expect(res.locator('#chips-b')).toContainText(nameA);
  await expect(res.locator('#chips-a .pchip')).toHaveCount(5);
  // un semplice tocco su un giocatore non scambia nulla
  const tap = res.locator('#chips-a .pchip').nth(1);
  const before = await res.locator('#chips-a').innerText();
  await tap.click();
  expect(await res.locator('#chips-a').innerText()).toBe(before);
  await noOverflow(page);
});
