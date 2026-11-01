// Redazione: modifica solo titoli e descrizioni delle pagelle e carica la Gazzetta (voci del menu, scheda partita in «solo testo»).
// Scheda giocatore (amministratore): stato del collegamento e invito. «Questo sono io»: solo i giocatori liberi.
import { expect, test } from '@playwright/test';
import { fixturePlayer, lastWrite, noOverflow, openApp, openMenu, setup } from './helpers';

test('Redazione: le voci del menu aprono la scheda della partita pronta per scrivere', async ({ page }) => {
  await setup(page, { publicRole: 'redazione' });
  await openApp(page);
  await openMenu(page);
  await expect(page.locator('.menu-sec', { hasText: 'Redazione · San Marcello' })).toBeVisible();
  await page.locator('#menu-red-pending').click();
  const modal = page.locator('#match-modal');
  await expect(modal).toBeVisible();
  // solo testo: niente modifica di voti, numeri, risultato, descrizione della partita, niente elimina
  await expect(modal.locator('#match-actions')).toBeVisible();
  await expect(modal.locator('button', { hasText: 'Salva pagelle' })).toBeVisible();
  await expect(modal.locator('button[aria-label="Elimina la partita"]')).toHaveCount(0);
  await expect(modal.locator('.rate-btn-plus')).toHaveCount(0);
  await expect(modal.locator('.rate-btn-minus')).toHaveCount(0);
  await expect(modal.locator('#sc-a')).toBeDisabled();
  await expect(modal.locator('#edit-notes')).toBeDisabled();
  await expect(modal.locator('input[type=number]:not([disabled])')).toHaveCount(0);
  await expect(modal.locator('.pgt-add').first()).toBeVisible();
  await expect(modal.locator('.gaz-edit')).toBeVisible(); // la Gazzetta la carica anche la redazione
  await noOverflow(page);
});

test('Redazione: salva solo titolo e descrizione (nessun voto nella richiesta)', async ({ page }) => {
  const writes = await setup(page, { publicRole: 'redazione' });
  await openApp(page);
  await openMenu(page);
  await page.locator('#menu-red-pending').click();
  const modal = page.locator('#match-modal');
  await modal.locator('button', { hasText: 'Salva pagelle' }).click();
  await expect(page.locator('#toast')).toContainText('Nessuna modifica da salvare');
  expect(writes.length).toBe(0);
  await modal.locator('.pgt-add').first().click();
  await page.locator('#pgt-d-tit').fill('LEADER');
  await page.locator('#pgt-d-desc').fill('Partita di sostanza.');
  await page.locator('#pgt-dialog').getByRole('button', { name: 'Fatto' }).click();
  await modal.locator('button', { hasText: 'Salva pagelle' }).click();
  await expect(page.locator('#toast')).toContainText('Salvati titoli e descrizioni: 1');
  const patches = writes.filter((w) => w.table === 'match_players' && w.method === 'PATCH');
  expect(patches.length).toBe(1);
  expect(patches[0]?.body).toEqual({ titolo: 'LEADER', descrizione: 'Partita di sostanza.' });
  expect(writes.some((w) => w.table === 'matches')).toBe(false);
});

test('Redazione: dalla scheda di una partita c\'è «Scrivi le pagelle»; l\'amministratore ha la modifica completa', async ({ page }) => {
  await setup(page, { publicRole: 'redazione' });
  await openApp(page);
  await page.locator('.bottom-nav').getByText('Partite', { exact: true }).click();
  await page.locator('#last-match .card').click();
  const modal = page.locator('#match-modal');
  await expect(modal.locator('#edit-toggle-btn')).toHaveCount(0);
  await modal.locator('#edit-text-btn').click();
  await expect(modal.locator('button', { hasText: 'Salva pagelle' })).toBeVisible();
});

test('Redazione: un membro semplice non vede né modifica né «Scrivi le pagelle»', async ({ page }) => {
  await setup(page, { publicRole: 'member' });
  await openApp(page);
  await page.locator('.bottom-nav').getByText('Partite', { exact: true }).click();
  await page.locator('#last-match .card').click();
  const modal = page.locator('#match-modal');
  await expect(modal).toBeVisible();
  await expect(modal.locator('#edit-toggle-btn')).toHaveCount(0);
  await expect(modal.locator('#edit-text-btn')).toHaveCount(0);
});

test('Questo sono io: si sceglie solo tra i giocatori liberi (elenco dal database)', async ({ page }) => {
  const writes = await setup(page, { rpc: { players_unclaimed: [{ player_id: 'p1', name: 'Luca' }, { player_id: 'p2', name: 'Marco' }] } });
  await openApp(page);
  await openMenu(page);
  await page.locator('#menu-profile').click();
  await expect(page.locator('#myplayer-select option')).toHaveText(['— scegli —', 'Luca', 'Marco']);
  await page.locator('#myplayer-select').selectOption({ label: 'Marco' });
  await page.locator('#myplayer-send').click();
  await expect(page.locator('#toast')).toContainText('Richiesta inviata');
  expect(lastWrite(writes, 'request_claim').body).toEqual({ l: expect.any(String), p: 'p2' });
});

test('Questo sono io: se sono tutti collegati si spiega', async ({ page }) => {
  await setup(page, { rpc: { players_unclaimed: [] } });
  await openApp(page);
  await openMenu(page);
  await page.locator('#menu-profile').click();
  await expect(page.locator('#myplayer-none')).toContainText('già un account collegato');
});

const firstRealPlayer = async (_page: unknown): Promise<{ id: string; name: string }> => fixturePlayer();
const status = (player_id: string, name: string, over: Record<string, unknown> = {}) => ({
  player_id, name, linked: false, linked_name: null, invite_token: null, invite_created: null, invite_expires: null, ...over,
});

test('Scheda giocatore (admin): non collegato → si può invitare', async ({ page }) => {
  const p = await firstRealPlayer(page);
  const writes = await setup(page, { publicRole: 'admin', rpc: { league_players_status: [status(p.id, p.name)], create_player_invite: 'tok' } });
  await openApp(page);
  await page.locator('#players-list .card-compact', { hasText: p.name }).first().click();
  const row = page.locator('#player-link-row');
  await expect(row).toContainText('Non ha ancora un account collegato');
  await page.locator('#player-invite-btn').click();
  await expect.poll(() => writes.some((w) => w.table === 'create_player_invite')).toBe(true);
  expect((lastWrite(writes, 'create_player_invite').body as { p: string }).p).toBe(p.id);
  await noOverflow(page);
});

test('Scheda giocatore (admin): collegato → si vede a chi, senza pulsante di invito', async ({ page }) => {
  const p = await firstRealPlayer(page);
  await setup(page, { publicRole: 'admin', rpc: { league_players_status: [status(p.id, p.name, { linked: true, linked_name: 'Marco R.' })] } });
  await openApp(page);
  await page.locator('#players-list .card-compact', { hasText: p.name }).first().click();
  await expect(page.locator('#player-link-row')).toContainText('Collegato a Marco R.');
  await expect(page.locator('#player-invite-btn')).toHaveCount(0);
});

test('Scheda giocatore: un membro non vede la riga del collegamento', async ({ page }) => {
  const p = await firstRealPlayer(page);
  await setup(page, { publicRole: 'member', rpc: { league_players_status: [status(p.id, p.name)] } });
  await openApp(page);
  await page.locator('#players-list .card-compact', { hasText: p.name }).first().click();
  await expect(page.locator('#match-modal')).toBeVisible();
  await expect(page.locator('#player-link-row')).toHaveCount(0);
});
