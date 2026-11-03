import { expect, test } from '@playwright/test';
import { openApp, openPanel, setup } from './helpers';

test('Gazzette filtrate e impostazioni non ricaricate dopo una modifica alla rosa', async ({ page }) => {
  const reads: URL[] = [];
  page.on('request', (r) => { if (r.method() === 'GET' && r.url().includes('/rest/v1/')) reads.push(new URL(r.url())); });
  await setup(page, { publicRole: 'admin' });
  await openApp(page, '/l/san-marcello/rosa');
  const gaz = reads.filter((u) => u.pathname.endsWith('/gazzette'));
  expect(gaz.length).toBeGreaterThan(0);
  expect(gaz.every((u) => (u.searchParams.get('match_id') ?? '').startsWith('in.('))).toBe(true);
  const beforeMatches = reads.filter((u) => u.pathname.endsWith('/matches')).length;
  const before = reads.filter((u) => u.pathname.endsWith('/app_settings')).length;
  expect(before).toBe(1);
  await page.getByText('+ Aggiungi giocatore').click();
  await page.locator('#app-modal-input').fill('Marco');
  await page.locator('#app-modal-ok').click();
  await expect(page.locator('#toast')).toContainText('Giocatore aggiunto');
  expect(reads.filter((u) => u.pathname.endsWith('/app_settings')).length).toBe(before);
  expect(reads.filter((u) => u.pathname.endsWith('/matches')).length).toBe(beforeMatches);
});

test('cambiare una regola ricarica le impostazioni senza riscaricare lo storico', async ({ page }) => {
  const reads: URL[] = [];
  page.on('request', (r) => { if (r.method() === 'GET' && r.url().includes('/rest/v1/')) reads.push(new URL(r.url())); });
  await setup(page, { publicRole: 'admin', rpc: { is_super_admin: true } });
  await openApp(page, '/l/san-marcello/rosa');
  await openPanel(page, '#menu-game-settings', '#sheet-game-settings');
  const matches = reads.filter((u) => u.pathname.endsWith('/matches')).length;
  const settings = reads.filter((u) => u.pathname.endsWith('/app_settings')).length;
  await page.locator('#form-switch').click();
  await expect.poll(() => reads.filter((u) => u.pathname.endsWith('/app_settings')).length).toBe(settings + 1);
  expect(reads.filter((u) => u.pathname.endsWith('/matches')).length).toBe(matches);
});


test('salvare una partita aggiorna lo storico senza ricaricare la rosa', async ({ page }) => {
  const reads: URL[] = [];
  page.on('request', (r) => { if (r.method() === 'GET' && r.url().includes('/rest/v1/')) reads.push(new URL(r.url())); });
  await setup(page, { publicRole: 'admin' });
  await openApp(page, '/l/san-marcello/rosa');
  await page.locator('.bottom-nav').getByRole('button', { name: 'Partite', exact: true }).click();
  await page.locator('#last-match .card').click();
  const modal = page.locator('#match-modal');
  await modal.locator('#edit-toggle-btn').click();
  await modal.locator('#sc-a').fill('9');
  const beforeRoster = reads.filter((u) => u.pathname.endsWith('/league_players')).length;
  const beforeMatches = reads.filter((u) => u.pathname.endsWith('/matches')).length;
  await modal.locator('button', { hasText: 'Salva partita' }).click();
  await expect(page.locator('#toast')).toContainText('Salvato:');
  expect(reads.filter((u) => u.pathname.endsWith('/matches')).length).toBeGreaterThan(beforeMatches);
  expect(reads.filter((u) => u.pathname.endsWith('/league_players')).length).toBe(beforeRoster);
});
