// Collegamento account: invito personale (/invito/<token>), Inviti giocatori, Unisci giocatori,
// «Questo sono io», richieste dell'amministratore, profilo, privacy.
import { expect, test, type Page } from '@playwright/test';
import { fixturePlayer, lastWrite, mineAs, noOverflow, openApp, openPanel, setup, openProfile } from './helpers';

const status = (player_id: string, name: string, over: Record<string, unknown> = {}) => ({
  player_id, name, linked: false, linked_name: null, invite_token: null, invite_created: null, invite_expires: null, ...over,
});
const open = (page: Page) => openApp(page, '/l/lega-di-prova/rosa', 0);

test('Invito: link valido senza accesso → si vede chi sei e il modulo per registrarti', async ({ page }) => {
  await setup(page, { loggedIn: false, rpc: { invite_preview: [{ status: 'valid', player_name: 'Marco', league_name: 'Lega di prova' }] } });
  await page.goto('/invito/tok123');
  await expect(page.locator('#invite-intro')).toContainText('Ciao Marco');
  await expect(page.locator('#invite-intro')).toContainText('Lega di prova');
  await expect(page.locator('#invite-page #account-card')).toBeVisible();
  await noOverflow(page);
});

test('Invito: link scaduto, usato, annullato o non valido → messaggio chiaro', async ({ browser }) => {
  for (const [st, text] of [['expired', 'scaduto'], ['used', 'già stato usato'], ['revoked', 'non è più valido'], ['invalid', 'non valido']] as const) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await setup(page, { loggedIn: false, rpc: { invite_preview: st === 'invalid' ? [] : [{ status: st, player_name: 'Marco', league_name: 'Lega di prova' }] } });
    await page.goto('/invito/tok123');
    await expect(page.locator('#invite-bad')).toContainText(text);
    await ctx.close();
  }
});

test('Invito: con l\'accesso il link si accetta da solo e si arriva al profilo', async ({ page }) => {
  const writes = await setup(page, {
    mine: mineAs('member', { owner_id: 'altro' }),
    rpc: {
      invite_preview: [{ status: 'valid', player_name: 'Marco', league_name: 'Lega di prova' }],
      accept_player_invite: [{ player_id: 'p1', player_name: 'Marco', league_id: 'L2', league_name: 'Lega di prova', league_slug: 'lega-di-prova' }],
    },
    mePlayer: { id: 'p1', name: 'Marco' },
  });
  await page.goto('/invito/tok123');
  await expect(page.locator('#invite-ok')).toContainText('Benvenuto Marco', { timeout: 15_000 });
  expect(lastWrite(writes, 'accept_player_invite').body).toEqual({ tok: 'tok123' });
  await page.locator('#invite-go').click();
  await expect(page.locator('#invite-page')).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe('/l/lega-di-prova/profilo');
  await expect(page.locator('#page-profilo.active')).toBeVisible();
  await expect(page.locator('#myplayer-name')).toHaveText('Marco');
});

test('Invito: un errore del database si mostra e si torna all\'app', async ({ page }) => {
  await setup(page, { rpcError: { accept_player_invite: 'Questo link è già stato usato' }, rpc: { invite_preview: [{ status: 'valid', player_name: 'Marco', league_name: 'X' }] } });
  await page.goto('/invito/tok123');
  await expect(page.locator('#invite-error')).toContainText('già stato usato', { timeout: 15_000 });
  await page.getByRole('button', { name: "Vai all'app" }).click();
  await expect(page.locator('#invite-page')).toHaveCount(0);
});

test('Inviti giocatori: crea il link, lo rigenera, scollega un giocatore', async ({ page }) => {
  const writes = await setup(page, {
    mine: mineAs('admin'),
    rpc: {
      league_players_status: [
        status('p1', 'Marco'),
        status('p2', 'Luca', { invite_token: 'tokL', invite_created: '2026-11-01T10:00:00Z', invite_expires: '2026-11-08T10:00:00Z' }),
        status('p3', 'Sara', { linked: true, linked_name: 'Sara R.' }),
      ],
      create_player_invite: 'nuovoToken',
    },
  });
  await open(page);
  await openPanel(page, '#menu-invites', '#sheet-invites');
  await expect(page.locator('.invite-row')).toHaveCount(3);
  await expect(page.locator('.invite-row').nth(1)).toContainText('valido fino al 08/11/2026');
  await expect(page.locator('.invite-row').nth(2)).toContainText('Collegato a Sara R.');
  await page.getByRole('button', { name: 'Invita Marco' }).click();
  await expect.poll(() => writes.some((w) => w.table === 'create_player_invite')).toBe(true);
  expect(lastWrite(writes, 'create_player_invite').body).toEqual({ p: 'p1', l: 'L2' });
  await expect(page.locator('#toast')).toContainText(/Ciao Marco!|Messaggio copiato/); // il messaggio da mandare all'amico
  await page.getByRole('button', { name: 'Rigenera il link di Luca' }).click();
  await expect.poll(() => writes.filter((w) => w.table === 'create_player_invite').length).toBe(2);
  expect(lastWrite(writes, 'create_player_invite').body).toEqual({ p: 'p2', l: 'L2' });
  await expect(page.locator('#toast')).toContainText(/Ciao Luca!|Messaggio copiato/);
  await page.getByRole('button', { name: 'Scollega Sara' }).click();
  await page.locator('#app-modal-ok').click();
  await expect(page.locator('#toast')).toContainText('Scollegato');
  expect(lastWrite(writes, 'unlink_player').body).toEqual({ p: 'p3' });
  await noOverflow(page);
});

test('Unisci giocatori: controlli, conferma e unione', async ({ page }) => {
  const writes = await setup(page, { publicRole: 'admin' });
  await openApp(page);
  await openPanel(page, '#menu-merge', '#sheet-merge');
  await page.locator('#mg-submit').click();
  await expect(page.locator('#toast')).toContainText('Scegli i due giocatori');
  await page.locator('#mg-keep').selectOption({ index: 1 });
  await expect(page.locator('#mg-drop option')).toHaveCount(22); // «scegli» + 21: chi si tiene non si può assorbire
  const keep = await page.locator('#mg-keep').inputValue();
  await page.locator('#mg-drop').selectOption({ index: 1 });
  const drop = await page.locator('#mg-drop').inputValue();
  expect(drop).not.toBe(keep);
  await page.locator('#mg-submit').click();
  await page.locator('#app-modal-ok').click();
  await expect(page.locator('#toast')).toContainText('Giocatori uniti');
  expect(lastWrite(writes, 'merge_players').body).toEqual({ keep, drop_id: drop });
});

test('Unisci giocatori: se il database rifiuta si vede il motivo', async ({ page }) => {
  await setup(page, { publicRole: 'admin', rpcError: { merge_players: 'I due giocatori hanno giocato la stessa partita' } });
  await openApp(page);
  await openPanel(page, '#menu-merge', '#sheet-merge');
  await page.locator('#mg-keep').selectOption({ index: 1 });
  await page.locator('#mg-drop').selectOption({ index: 1 });
  await page.locator('#mg-submit').click();
  await page.locator('#app-modal-ok').click();
  await expect(page.locator('#toast')).toContainText('stessa partita');
});

test('Questo sono io: scelgo il mio nome e mando la richiesta', async ({ page }) => {
  const writes = await setup(page, { rpc: { players_unclaimed: [{ player_id: 'p1', name: 'Luca' }, { player_id: 'p2', name: 'Marco' }] } });
  await openApp(page);
  await openProfile(page);
  await expect(page.locator('#myplayer-card')).toBeVisible();
  await page.locator('#myplayer-send').click();
  await expect(page.locator('#toast')).toContainText('Scegli il tuo nome');
  expect(writes.length).toBe(0);
  await expect(page.locator('#myplayer-select option')).toHaveCount(3); // «scegli» + i due liberi
  await page.locator('#myplayer-select').selectOption({ index: 1 });
  await page.locator('#myplayer-send').click();
  await expect(page.locator('#toast')).toContainText('Richiesta inviata');
  expect(Object.keys(lastWrite(writes, 'request_claim').body as object).sort()).toEqual(['l', 'p']);
  await noOverflow(page);
});

test('Questo sono io: richiesta in attesa', async ({ page }) => {
  await setup(page, { claims: [{ player_id: 'p1', league_id: 'x', status: 'pending', created_at: '2026-11-01', players: { name: 'Marco' } }] });
  await openApp(page);
  await openProfile(page);
  await expect(page.locator('#myplayer-pending')).toContainText('Marco');
  await expect(page.locator('#myplayer-select')).toHaveCount(0);
});

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('Il mio profilo: da collegato non ci si può scollegare (lo fa solo l’amministratore)', async ({ page }) => {
  const writes = await setup(page, { mePlayer: fixturePlayer() });
  await openApp(page);
  await openProfile(page);
  await expect(page.locator('#myplayer-name')).toHaveText(fixturePlayer().name);
  await expect(page.locator('#myplayer-locked')).toContainText('amministratore');
  await expect(page.getByRole('button', { name: 'Scollega' })).toHaveCount(0);
  expect(writes.some((x) => x.table === 'unlink_me')).toBe(false);
});

test('Il mio profilo: cambio il mio nome', async ({ page }) => {
  const writes = await setup(page, { mePlayer: fixturePlayer(), rpc: { rename_my_player: 'Marco Rossi' } });
  await openApp(page);
  await openProfile(page);
  await page.locator('#my-rename').click();
  await page.locator('#app-modal-input').fill('Marco Rossi');
  await page.locator('#app-modal-ok').click();
  await expect(page.locator('#toast')).toContainText('Ora ti chiami Marco Rossi');
  expect(lastWrite(writes, 'rename_my_player').body).toEqual({ p_name: 'Marco Rossi' });
  expect(writes.some((w) => w.table === 'players')).toBe(false); // niente scritture dirette sul giocatore
});

test('Il mio profilo: se il nome è già usato si vede il motivo', async ({ page }) => {
  await setup(page, { mePlayer: fixturePlayer(), rpcError: { rename_my_player: 'Il nome «Caputo» è già usato da un altro giocatore (lega San Marcello)' } });
  await openApp(page);
  await openProfile(page);
  await page.locator('#my-rename').click();
  await page.locator('#app-modal-input').fill('Caputo');
  await page.locator('#app-modal-ok').click();
  await expect(page.locator('#toast')).toContainText('già usato da un altro giocatore');
});

test('Il mio profilo: cambio la mia foto (file e collegamento passano dalle funzioni sicure)', async ({ page }) => {
  const writes = await setup(page, { mePlayer: fixturePlayer() });
  await openApp(page);
  await openProfile(page);
  await page.locator('#my-photo-file').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('#toast')).toContainText('Foto aggiornata', { timeout: 15_000 });
  const me = fixturePlayer();
  expect(writes.some((w) => w.table === 'storage' && w.method === 'POST' && String(w.body).startsWith('photos/' + me.id + '-'))).toBe(true);
  expect((lastWrite(writes, 'set_my_photo').body as { p_path: string }).p_path).toMatch(new RegExp('^' + me.id + '-[0-9]+\\.jpg$'));
  expect(writes.some((w) => w.table === 'players')).toBe(false);
});

test('Il mio profilo: si vede la scheda del giocatore senza campi modificabili', async ({ page }) => {
  const me = fixturePlayer();
  await setup(page, { mePlayer: me });
  await openApp(page);
  await openProfile(page);
  const card = page.locator('#profile-player-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText(me.name);
  await expect(card.locator('.stat-row')).toHaveCount(12); // 11 statistiche + peso voti
  await expect(card.locator('input, textarea')).toHaveCount(0);
  await expect(card.locator('#match-modal-body')).toBeVisible();
  await expect(card.getByText('✕')).toHaveCount(0);
  await expect(page.locator('#profile-card')).toHaveCount(0);
  // «Sei collegato a…» sta in fondo alla pagina, sotto la scheda e il riepilogo
  await expect(page.locator('#myplayer-card')).toContainText('Sei collegato a');
  const y = async (sel: string) => (await page.locator(sel).boundingBox())!.y;
  expect(await y('#myplayer-card')).toBeGreaterThan(await y('#profile-player-card'));
  await expect(page.locator('#leave-card')).toBeVisible();
  expect(await y('#leave-card')).toBeGreaterThan(await y('#myplayer-card'));
  await noOverflow(page);
});

test('Questo sono io: se la tabella manca si spiega cosa fare', async ({ page }) => {
  await setup(page, { claims: 'missing' });
  await openApp(page);
  await openProfile(page);
  await expect(page.locator('#myplayer-error')).toContainText('20261102000000_questo_sono_io.sql');
});

test('Richieste «sono io»: l\'amministratore conferma e rifiuta', async ({ page }) => {
  const pending = [
    { id: 'c1', player_id: 'p1', player_name: 'Marco', user_id: 'u2', display_name: 'Marchino', email: 'm@example.com', created_at: '2026-11-01' },
    { id: 'c2', player_id: 'p2', player_name: 'Luca', user_id: 'u3', display_name: null, email: 'l@example.com', created_at: '2026-11-02' },
  ];
  const writes = await setup(page, { mine: mineAs('admin'), rpc: { claims_pending: pending } });
  await open(page);
  await openPanel(page, '#menu-claims', '#sheet-claims');
  await expect(page.locator('.claim-row')).toHaveCount(2);
  await expect(page.locator('.claim-row').first()).toContainText('Marchino dice di essere Marco');
  await expect(page.locator('.claim-row').nth(1)).toContainText('l@example.com');
  await page.getByRole('button', { name: 'Conferma Marchino come Marco' }).click();
  await expect(page.locator('#toast')).toContainText('Marchino è ora Marco');
  expect(lastWrite(writes, 'review_claim').body).toEqual({ c: 'c1', approve: true });
  await page.getByRole('button', { name: 'Rifiuta l@example.com' }).click();
  await expect(page.locator('#toast')).toContainText('Richiesta rifiutata');
  expect(lastWrite(writes, 'review_claim').body).toEqual({ c: 'c2', approve: false });
});

test('Privacy: informativa con le righe sul registro; la cancellazione chiede di scrivere CANCELLA', async ({ page }) => {
  const writes = await setup(page);
  await openApp(page);
  await openPanel(page, '#menu-privacy', '#sheet-privacy');
  await expect(page.locator('#sheet-privacy')).toContainText('registriamo le azioni');
  await page.locator('#delete-account').click();
  await page.locator('#app-modal-input').fill('boh');
  await page.locator('#app-modal-ok').click();
  await expect(page.locator('#toast')).toContainText('Scrivi CANCELLA');
  expect(writes.some((w) => w.table === 'delete_my_account')).toBe(false);
  await page.locator('#delete-account').click();
  await page.locator('#app-modal-input').fill('cancella');
  await page.locator('#app-modal-ok').click();
  await expect(page.locator('#toast')).toContainText('Account cancellato');
  expect(writes.some((w) => w.table === 'delete_my_account')).toBe(true);
});
