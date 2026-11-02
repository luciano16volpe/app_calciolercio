// Regole di gioco (formazioni, forma recente, pesi): uniche per tutta l'app; le vedono gli admin di lega, le cambia solo il superadmin.
import { expect, test } from '@playwright/test';
import { lastWrite, mineAs, noOverflow, openApp, openPanel, setup } from './helpers';

test('Regole di gioco: l\'admin di lega vede formazioni, forma e pesi, ma solo in lettura', async ({ page }) => {
  const writes = await setup(page, { publicRole: 'admin' });
  await openApp(page);
  await openPanel(page, '#menu-game-settings', '#sheet-game-settings');
  await expect(page.locator('.module-tile')).toHaveCount(10);
  await expect(page.locator('.w-row')).toHaveCount(11);
  await expect(page.locator('#form-switch')).toHaveCount(0);
  await expect(page.locator('[id^=add-toggle-]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Rimuovi/ })).toHaveCount(0);
  await expect(page.locator('#weights-save')).toHaveCount(0);
  await expect(page.locator('#game-settings')).toContainText('le cambia solo l’amministratore della piattaforma');
  await noOverflow(page);
  expect(writes.length).toBe(0);
});

test('Regole di gioco: il superadmin cambia forma recente, formazioni e pesi (uguali per tutte le leghe)', async ({ page }) => {
  const writes = await setup(page, { mine: mineAs('member', { owner_id: 'altro' }), rpc: { is_super_admin: true } });
  await openApp(page, '/l/lega-di-prova/rosa', 0);
  await openPanel(page, '#menu-game-settings', '#sheet-game-settings');
  await expect(page.locator('#game-settings')).toContainText('Le cambi solo tu');
  // forma recente
  await page.locator('#form-switch').click();
  await expect.poll(() => writes.some((w) => w.table === 'admin_set_setting'), { timeout: 15_000 }).toBe(true);
  expect(lastWrite(writes, 'admin_set_setting').body).toEqual({ k: 'use_form', v: false });
  // nuova formazione 5vs5: somma sbagliata, poi giusta
  await page.locator('#add-toggle-5').click();
  await page.locator('#new-def-5').fill('2');
  await page.locator('#new-med-5').fill('2');
  await page.locator('#new-att-5').fill('1');
  await page.locator('#add-form-5').getByRole('button', { name: 'Aggiungi' }).click();
  await expect(page.locator('#toast')).toContainText('devono sommare 4 (ora: 5)');
  await page.locator('#new-def-5').fill('0');
  await page.locator('#new-med-5').fill('4');
  await page.locator('#new-att-5').fill('0');
  await page.locator('#add-form-5').getByRole('button', { name: 'Aggiungi' }).click();
  await expect.poll(() => writes.filter((w) => w.table === 'admin_set_setting').length, { timeout: 15_000 }).toBe(2);
  const mods = lastWrite(writes, 'admin_set_setting').body as { k: string; v: string };
  expect(mods.k).toBe('game_modules');
  expect(mods.v).toContain('1-0-4-0');
  // pesi: si cambia una statistica e si salva
  await expect(page.locator('#weights-save')).toBeDisabled();
  await page.getByRole('button', { name: 'stamina 3', exact: true }).click();
  await expect(page.locator('#weights-save')).toBeEnabled();
  await page.locator('#weights-save').click();
  await expect.poll(() => writes.filter((w) => w.table === 'admin_set_setting').length, { timeout: 15_000 }).toBe(3);
  const w = lastWrite(writes, 'admin_set_setting').body as { k: string; v: number[] };
  expect(w.k).toBe('ovr_weights');
  expect(w.v).toHaveLength(11);
  expect(w.v[0]).toBe(3);
  await noOverflow(page);
});

test('Regole di gioco: se il database rifiuta (non sei superadmin) si vede il motivo', async ({ page }) => {
  await setup(page, { mine: mineAs('member', { owner_id: 'altro' }), rpc: { is_super_admin: true }, rpcError: { admin_set_setting: 'Permesso negato: solo l\'amministratore della piattaforma' } });
  await openApp(page, '/l/lega-di-prova/rosa', 0);
  await openPanel(page, '#menu-game-settings', '#sheet-game-settings');
  await page.locator('#form-switch').click();
  await expect(page.locator('#toast')).toContainText('Permesso negato');
});
