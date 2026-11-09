// Membri e ruoli, proposte di amministratore, impostazioni della lega e pannelli della piattaforma.
import { expect, test, type Page } from '@playwright/test';
import { lastWrite, mineAs, noOverflow, openApp, openPanel, setup } from './helpers';

const row = (user_id: string, role: string, display_name: string, over: Record<string, unknown> = {}) => ({
  user_id, role, display_name, email: `${display_name.toLowerCase()}@example.com`, joined_at: '2026-01-01', is_owner: false, admin_request_id: null, ...over,
});
const MEMBERS = [row('u1', 'admin', 'Luciano', { is_owner: true }), row('u2', 'member', 'Marco'), row('u3', 'admin', 'Giulia'), row('u4', 'redazione', 'Sara')];
const open = (page: Page) => openApp(page, '/l/lega-di-prova/rosa', 0);
const rowOf = (page: Page, name: string) => page.locator('.member-row', { hasText: name });

test('Ruoli: il creatore nomina admin, rende redazione, toglie un membro', async ({ page }) => {
  const writes = await setup(page, { mine: mineAs('admin'), rpc: { league_member_list: MEMBERS } });
  await open(page);
  await openPanel(page, '#menu-members', '#sheet-members');
  await expect(page.locator('.member-row')).toHaveCount(4);
  await expect(rowOf(page, 'Luciano')).toContainText('(tu)');
  await expect(rowOf(page, 'Luciano')).toContainText('Creatore');
  await expect(rowOf(page, 'Luciano').getByRole('button')).toHaveCount(0); // il creatore non si tocca
  await rowOf(page, 'Marco').getByRole('button', { name: 'Rendi admin' }).click();
  await expect(page.locator('#toast')).toContainText('Ora è amministratore');
  expect(lastWrite(writes, 'set_member_role').body).toEqual({ l: 'L2', u: 'u2', r: 'admin' });
  await rowOf(page, 'Marco').getByRole('button', { name: 'Rendi redazione' }).click();
  expect(lastWrite(writes, 'set_member_role').body).toEqual({ l: 'L2', u: 'u2', r: 'redazione' });
  // un admin torna membro solo per mano del creatore
  await rowOf(page, 'Giulia').getByRole('button', { name: 'Torna membro' }).click();
  expect(lastWrite(writes, 'set_member_role').body).toEqual({ l: 'L2', u: 'u3', r: 'member' });
  await page.getByRole('button', { name: 'Togli Marco' }).click();
  await page.locator('#app-modal-ok').click();
  await expect(page.locator('#toast')).toContainText('Membro tolto');
  expect(lastWrite(writes, 'remove_member').body).toEqual({ l: 'L2', u: 'u2' });
  await noOverflow(page);
});

test('Ruoli: un admin non creatore può solo proporre (e annullare la proposta)', async ({ page }) => {
  const members = [row('u1', 'admin', 'Luciano'), row('u9', 'admin', 'Creatrice', { is_owner: true }), row('u2', 'member', 'Marco'), row('u4', 'redazione', 'Sara', { admin_request_id: 'r1' })];
  const writes = await setup(page, { mine: mineAs('admin', { owner_id: 'u9' }), rpc: { league_member_list: members } });
  await open(page);
  await openPanel(page, '#menu-members', '#sheet-members');
  await expect(page.getByRole('button', { name: 'Rendi admin' })).toHaveCount(0);
  await expect(rowOf(page, 'Creatrice').getByRole('button')).toHaveCount(0);
  await expect(rowOf(page, 'Luciano').getByRole('button')).toHaveCount(0);
  await rowOf(page, 'Marco').getByRole('button', { name: 'Proponi come admin' }).click();
  await expect(page.locator('#toast')).toContainText('Proposta inviata al creatore');
  expect(lastWrite(writes, 'propose_admin').body).toEqual({ l: 'L2', u: 'u2' });
  await expect(rowOf(page, 'Sara')).toContainText('in attesa del creatore');
  await expect(rowOf(page, 'Sara').getByRole('button', { name: 'Proponi come admin' })).toHaveCount(0);
  await rowOf(page, 'Sara').getByRole('button', { name: 'Annulla la proposta' }).click();
  expect(lastWrite(writes, 'cancel_admin_request').body).toEqual({ c: 'r1' });
});

test('Ruoli: l\'errore del database si vede (ultimo amministratore)', async ({ page }) => {
  await setup(page, { mine: mineAs('admin'), rpc: { league_member_list: MEMBERS }, rpcError: { set_member_role: 'Deve restare almeno un amministratore' } });
  await open(page);
  await openPanel(page, '#menu-members', '#sheet-members');
  await rowOf(page, 'Giulia').getByRole('button', { name: 'Torna membro' }).click();
  await expect(page.locator('#toast')).toContainText('Deve restare almeno un amministratore');
});

test('Ruoli: se l\'elenco non si carica si vede il messaggio', async ({ page }) => {
  await setup(page, { mine: mineAs('admin'), rpcError: { league_member_list: 'Could not find the function public.league_member_list' } });
  await open(page);
  await openPanel(page, '#menu-members', '#sheet-members');
  await expect(page.locator('#members-error')).toContainText('league_member_list');
});

test('Proposte: il creatore approva e rifiuta', async ({ page }) => {
  const proposals = [
    { id: 'r1', user_id: 'u2', display_name: 'Marco', email: 'm@example.com', requested_by_name: 'Giulia' },
    { id: 'r2', user_id: 'u4', display_name: null, email: 'sara@example.com', requested_by_name: null },
  ];
  const writes = await setup(page, { mine: mineAs('admin'), rpc: { admin_requests_list: proposals } });
  await open(page);
  await openPanel(page, '#menu-proposals', '#sheet-proposals');
  await expect(page.locator('.proposal-row')).toHaveCount(2);
  await expect(page.locator('.proposal-row').first()).toContainText('proposto da Giulia');
  await expect(page.locator('.proposal-row').nth(1)).toContainText('sara@example.com');
  await page.getByRole('button', { name: 'Approva Marco' }).click();
  await expect(page.locator('#toast')).toContainText('Marco è ora amministratore');
  expect(lastWrite(writes, 'decide_admin_request').body).toEqual({ c: 'r1', approve: true });
  await page.getByRole('button', { name: 'Rifiuta sara@example.com' }).click();
  await expect(page.locator('#toast')).toContainText('Proposta rifiutata');
  expect(lastWrite(writes, 'decide_admin_request').body).toEqual({ c: 'r2', approve: false });
  await noOverflow(page);
});

test('Proposte: senza proposte si spiega', async ({ page }) => {
  await setup(page, { mine: mineAs('admin') });
  await open(page);
  await openPanel(page, '#menu-proposals', '#sheet-proposals');
  await expect(page.locator('#proposals-empty')).toBeVisible();
});

test('Impostazioni della lega: si aprono per l\'amministratore senza sbordare', async ({ page }) => {
  await setup(page, { mine: mineAs('admin'), rpc: { my_premium_status: [{ active: true, expires_at: null, trial: false, trial_expires_at: null, lifetime: true }] } });
  await open(page);
  await openPanel(page, '#menu-league-settings', '[aria-label^="Impostazioni"]');
  await noOverflow(page);
});

test('Piattaforma: tutte le leghe e utenti, per l\'amministratore supremo', async ({ page }) => {
  const leagues = [
    { id: 'a', name: 'San Marcello', slug: 'san-marcello', is_public: true, owner_name: 'Luciano', owner_missing: false, admins: 'Luciano', members: 3, matches: 40, created_at: '2026-10-31T00:00:00Z', last_activity: '2026-11-01T00:00:00Z' },
    { id: 'b', name: 'Senza creatore', slug: 'senza', is_public: false, owner_name: null, owner_missing: true, admins: 'Giulia', members: 2, matches: 0, created_at: '2026-10-31T00:00:00Z', last_activity: '2026-10-31T00:00:00Z' },
  ];
  const users = [{ id: 'u1', display_name: 'Luciano', email: 'l@example.com', last_sign_in_at: '2026-11-01T10:00:00Z', created_at: '2026-10-01T00:00:00Z', leagues: 'San Marcello (admin)' }];
  const writes = await setup(page, { mine: mineAs('member', { owner_id: 'altro' }), rpc: { is_super_admin: true, admin_list_leagues: leagues, admin_list_users: users, admin_league_admins: [{ user_id: 'u3', name: 'Giulia' }] } });
  await open(page);
  await openPanel(page, '#menu-platform-leagues', '#sheet-platform-leagues');
  await expect(page.locator('.platform-league')).toHaveCount(2);
  await expect(page.locator('.platform-league').nth(1)).toContainText('Creatore: nessuno');
  await page.getByRole('button', { name: 'Assegna un creatore' }).click();
  await page.locator('.platform-league').nth(1).getByRole('button', { name: 'Giulia' }).click();
  await page.locator('#app-modal-ok').click();
  await expect(page.locator('#toast')).toContainText('Lega assegnata');
  expect(lastWrite(writes, 'admin_assign_owner').body).toEqual({ l: 'b', new_owner: 'u3' });
  await page.getByRole('button', { name: 'Indietro' }).click();
  await page.locator('#menu-platform-users').click(); // «Indietro» riporta al riquadro SUPERADMIN
  await expect(page.locator('#sheet-platform-users')).toBeVisible();
  await expect(page.locator('.platform-user')).toHaveCount(1);
  await noOverflow(page);
});
