// Classifiche (passo 3.3b): tabella Statistiche, Confronto testa a testa e Albo d'oro (questi ultimi dal menu laterale) — su iPhone, Android e 360 px.
import { expect, test, type Page } from '@playwright/test';
import { openPanel, setup } from './helpers';

// l'app si apre solo con l'accesso: la prova entra come membro della lega pubblica vera (accesso simulato, letture vere)
test.beforeEach(async ({ page }) => {
  await setup(page, { publicRole: 'member' });
});

async function openClassifiche(page: Page, tab: string) {
  await page.goto('/');
  await expect(page.locator('#page-profilo #myplayer-card')).toBeVisible({ timeout: 20_000 });
  await page.locator('.bottom-nav').getByRole('button', { name: 'Classifiche', exact: true }).click();
  await page.locator('#cl-tabs .chip', { hasText: tab }).click();
  return page.locator('#page-classifiche');
}

const noOverflow = async (page: Page) =>
  expect((await page.evaluate(() => document.documentElement.scrollWidth)) - (page.viewportSize() as { width: number }).width).toBeLessThanOrEqual(0);

test('Statistiche: filtri Titolari/Occasionali/Tutti e ordinamento toccando le intestazioni', async ({ page }) => {
  const cl = await openClassifiche(page, 'Statistiche');
  const table = cl.locator('#stats-table');
  await expect(table.locator('.section-header')).toContainText('Statistiche giocatori');
  // di partenza: Titolari, per gol (dal più alto) — la colonna ⚽ è evidenziata
  await expect(table.locator('.sub-tab.active')).toContainText('Titolari');
  const header = (label: string) => table.locator('th', { hasText: label }).first();
  await expect(header('⚽')).toContainText('▾');
  const goals = async () => (await table.locator('tbody tr td:nth-child(8)').allInnerTexts()).map(Number);
  const desc = await goals();
  expect(desc).toEqual([...desc].sort((a, b) => b - a));
  // un secondo tocco inverte l'ordine
  await header('⚽').click();
  await expect(header('⚽')).toContainText('▴');
  const asc = await goals();
  expect(asc).toEqual([...asc].sort((a, b) => a - b));
  // ordinamento per nome: A–Z
  await header('Giocatore').click();
  const names = (await table.locator('tbody tr td:nth-child(1)').allInnerTexts()).map((t) => t.replace('›', '').trim().toLowerCase());
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  // "Tutti" mostra almeno tanti giocatori quanto "Titolari"
  const titolari = await table.locator('tbody tr').count();
  await table.locator('.sub-tab', { hasText: 'Tutti' }).click();
  expect(await table.locator('tbody tr').count()).toBeGreaterThanOrEqual(titolari);
  // la colonna dei nomi resta ferma quando si scorre (non si esce in orizzontale dalla pagina)
  await noOverflow(page);
  // un tocco su un nome apre la scheda
  await table.locator('tbody tr td:nth-child(1)').first().click();
  await expect(page.locator('#match-modal')).toBeVisible();
});

test('Confronto: due giocatori, scambio, scelta dall\'elenco e righe con barre', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#page-profilo #myplayer-card')).toBeVisible({ timeout: 20_000 });
  await openPanel(page, '#menu-compare', '#sheet-compare');
  const box = page.locator('#cmp-box');
  await expect(box.locator('.section-header')).toContainText('Confronto testa a testa');
  await expect(box.locator('.vs-sel')).toHaveCount(2);
  await expect(box.locator('.vs-cards .fut-mini')).toHaveCount(2);
  await expect(box.locator('.vs-row')).toHaveCount(12);
  await expect(box.locator('.vs-fut')).toHaveCount(6);
  const first = await box.locator('.vs-sel span').first().innerText();
  const second = await box.locator('.vs-sel span').nth(1).innerText();
  expect(first).not.toBe(second);
  // ⇄ scambia
  await box.locator('.vs-swap').click();
  await expect(box.locator('.vs-sel span').first()).toHaveText(second);
  await expect(box.locator('.vs-sel span').nth(1)).toHaveText(first);
  // scelta dall'elenco: il giocatore dell'altra parte è disattivato
  await box.locator('.vs-sel').first().click();
  const modal = page.locator('#match-modal');
  await expect(modal.locator('#match-modal-title')).toHaveText('Scegli il giocatore');
  await expect(modal.locator('.vs-opt')).toHaveCount(22);
  await expect(modal.locator('.vs-opt.dis')).toHaveCount(1);
  const target = modal.locator('.vs-opt:not(.dis)').nth(5);
  const targetName = await target.locator('.vs-opt-n').innerText();
  await target.click();
  await expect(modal).toHaveCount(0);
  await expect(box.locator('.vs-sel span').first()).toHaveText(targetName);
  await noOverflow(page);
});

test('Albo d\'oro: stagioni con premi, Occasionali, vergogna e imprese', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#page-profilo #myplayer-card')).toBeVisible({ timeout: 20_000 });
  await openPanel(page, '#menu-albo', '#sheet-albo');
  // "Sempre": tutte le stagioni
  await page.locator('#panel-seasons .chip').last().click();
  const albo = page.locator('#extra-list');
  await expect(albo.locator('.section-header')).toContainText("Albo d'oro");
  expect(await albo.locator('.albo-season').count()).toBeGreaterThanOrEqual(3);
  await expect(albo.locator('.albo-chip.done').first()).toContainText('chiusa'); // stagione chiusa e congelata
  await expect(albo.locator('.albo-chip.live').first()).toContainText('in corso');
  await expect(albo.locator('.albo-row').first()).toBeVisible();
  await expect(albo.locator('.albo-grp', { hasText: 'Premi della vergogna' }).first()).toBeVisible();
  await expect(albo.locator('.albo-feat').first()).toBeVisible();
  // un nome del premio apre la scheda
  await albo.locator('.albo-name').first().click();
  await expect(page.locator('#match-modal')).toBeVisible();
  await noOverflow(page);
});
