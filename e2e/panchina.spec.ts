// Panchina: l'amministratore toglie un giocatore dalla lega (non si «archivia»); la storia resta, finisce in Panchina,
// da lì si riporta in Rosa. Database finto condiviso, con i dati veri di prova (22 giocatori, 16 partite).
import { expect, test } from './fixtures';
import { FakeBackend } from './fakeBackend';
import { noOverflow, openMenu } from './helpers';

test('Panchina: via dalla lega, resta nella storia, torna dalla Panchina', async ({ browser }, testInfo) => {
  const { defaultBrowserType: _ignored, ...use } = testInfo.project.use;
  void _ignored;
  const be = new FakeBackend();
  const adm = be.addUser('u-adm', 'adm@example.com', 'Admin Panchina');
  const mem = be.addUser('u-mem', 'mem@example.com', 'Membro Semplice');
  be.leagues.push({ id: 'SM', name: 'San Marcello', slug: 'san-marcello', is_public: false, invite_code: 'smsmsmsm', owner_id: adm, settings: {}, created_at: '2026-01-01' });
  be.members.push({ league_id: 'SM', user_id: adm, role: 'admin', joined_at: '2026-01-01' }, { league_id: 'SM', user_id: mem, role: 'member', joined_at: '2026-01-02' });
  be.seedFixtures('SM');
  // un giocatore che ha giocato l'ultima partita
  const lastMatch = [...be.matches].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] as { id: string };
  const pid = (be.mplayers.find((x) => x.match_id === lastMatch.id) as { player_id: string }).player_id;
  const name = String((be.players.find((p) => p.id === pid) as { name: string }).name);

  const open = async (user: string) => {
    const ctx = await browser.newContext({ ...use });
    await be.attach(ctx, user);
    await ctx.addInitScript(() => localStorage.removeItem('calciolercio-cache'));
    const page = await ctx.newPage();
    await page.goto('/l/san-marcello/rosa', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#players-list .card-compact').first()).toBeVisible({ timeout: 20_000 });
    return page;
  };

  const page = await open(adm);
  await expect(page.locator('#players-list .card-compact')).toHaveCount(22);
  // toglie il giocatore dalla lega (dalla sua scheda, in Rosa)
  await page.locator('#players-list .card-compact', { hasText: name }).first().click();
  await expect(page.locator('#match-modal-body > :last-child')).toHaveId('player-bench-row');
  await page.locator('#player-remove').click();
  await expect(page.locator('#app-modal-msg')).toContainText('restano nella storia');
  await page.locator('#app-modal-ok').click();
  await expect(page.locator('#toast')).toContainText('è in Panchina');
  await expect(page.locator('#players-list .card-compact')).toHaveCount(21);
  await expect(page.locator('#players-list')).not.toContainText(name);
  // la storia resta: nell'ultima partita compare ancora
  await page.locator('.bottom-nav').getByRole('button', { name: 'Partite', exact: true }).click();
  await page.locator('#last-match .card').click();
  await expect(page.locator('#match-modal')).toContainText(name);
  await page.locator('#match-modal button', { hasText: '✕' }).first().click();
  // Panchina: c'è, con le sue partite; lo riporta in Rosa
  await openMenu(page);
  await page.locator('#menu-bench').click();
  const sheet = page.locator('#sheet-bench');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.bench-row', { hasText: name })).toContainText('partit');
  await noOverflow(page);
  await page.getByRole('button', { name: `Porta ${name} in San Marcello` }).click();
  await expect(page.locator('#toast')).toContainText('è ora nella Rosa');
  await expect(sheet.locator('#bench-empty')).toBeVisible();
  await page.getByRole('button', { name: 'Indietro' }).click();
  await page.locator('.bottom-nav').getByRole('button', { name: 'Rosa', exact: true }).click();
  await expect(page.locator('#players-list .card-compact')).toHaveCount(22);

  // un membro semplice non ha la Panchina
  const m = await open(mem);
  await openMenu(m);
  await expect(m.locator('#menu-bench')).toHaveCount(0);
  await page.context().close();
  await m.context().close();
});
