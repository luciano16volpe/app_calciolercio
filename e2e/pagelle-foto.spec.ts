// Pagelle da saltare (elenco, scheda partita, conteggio nel menu della redazione) e foto nei pallini (Rosa, Gioca, menu, intestazione).
// Database finto condiviso con i dati veri di prova.
import { expect, test, type Browser, type TestInfo } from './fixtures';
import { FakeBackend } from './fakeBackend';
import { openMenu } from './helpers';

function league(be: FakeBackend, role: 'admin' | 'redazione') {
  const u = be.addUser('u-1', 'u1@example.com', 'Utente Prova');
  be.leagues.push({ id: 'SM', name: 'San Marcello', slug: 'san-marcello', is_public: false, invite_code: 'smsmsmsm', owner_id: role === 'admin' ? u : null, settings: {}, created_at: '2026-01-01' });
  be.members.push({ league_id: 'SM', user_id: u, role, joined_at: '2026-01-01' });
  be.seedFixtures('SM');
  return u;
}
async function open(browser: Browser, testInfo: TestInfo, be: FakeBackend, user: string, path = '/l/san-marcello/rosa') {
  const { defaultBrowserType: _ignored, ...use } = testInfo.project.use;
  void _ignored;
  const ctx = await browser.newContext({ ...use });
  await be.attach(ctx, user);
  await ctx.addInitScript(() => localStorage.removeItem('calciolercio-cache'));
  const page = await ctx.newPage();
  await page.goto(path);
  await expect(page.locator('#players-list .card-compact').first()).toBeVisible({ timeout: 20_000 });
  return page;
}

/** Toglie titoli e descrizioni alle due partite giocate più recenti (sono «da scrivere») e dice quante partite da scrivere ci sono in tutto
 *  (i dati di prova ne hanno già alcune senza descrizioni). */
/** Come l'app: una partita con risultato è «da scrivere» se meno della METÀ dei giocatori ha titolo o descrizione. */
function needs(be: FakeBackend, id: string): boolean {
  const rows = be.mplayers.filter((r) => r.match_id === id);
  const written = rows.filter((r) => String(r.titolo ?? '').trim() || String(r.descrizione ?? '').trim()).length;
  return rows.length === 0 || written * 2 < rows.length;
}

function strip(be: FakeBackend): number {
  const played = [...be.matches].filter((x) => x.score_a != null && x.score_b != null).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  // Due incontri recenti e gli altri oltre i sette giorni, anche quando cambia il calendario.
  played.forEach((m, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (i < 2 ? i + 1 : 14 + (i - 2) * 7));
    m.date = date.toLocaleDateString('sv-SE');
  });
  const ids = played.slice(0, 2).map((x) => String(x.id));
  for (const r of be.mplayers) if (ids.includes(String(r.match_id))) { r.titolo = null; r.descrizione = null; }
  return played.filter((x) => needs(be, String(x.id))).length;
}

test('Pagelle: elenco «senza pagelle», Salta e Rimetti; il conteggio nel menu segue', async ({ browser }, testInfo) => {
  const be = new FakeBackend();
  const u = league(be, 'admin');
  const n = strip(be);
  const page = await open(browser, testInfo, be, u);
  await openMenu(page);
  await expect(page.locator('#menu-pending')).toContainText(`${n} da scrivere o saltare`);
  await page.locator('#menu-pending').click();
  const sheet = page.locator('#sheet-pending');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.pending-row')).toHaveCount(n);
  await expect(sheet.locator('#pending-skipped')).toHaveCount(0);
  // salto la prima
  await sheet.locator('.pending-row').first().getByRole('button', { name: /^Salta/ }).click();
  await expect(page.locator('#toast')).toContainText('saltate');
  expect(be.matches.filter((x) => x.ratings_skipped === true).length).toBe(1);
  await expect(sheet.locator('.pending-row')).toHaveCount(n); // (n - 1) da scrivere + 1 tra le saltate
  await expect(sheet.locator('#pending-skipped')).toContainText('Saltate (1)');
  // la rimetto
  await sheet.locator('#pending-skipped .pending-row').getByRole('button', { name: /^Rimetti/ }).click();
  await expect(page.locator('#toast')).toContainText('rimesse da scrivere');
  await expect(sheet.locator('.pending-row')).toHaveCount(n);
  await expect(sheet.locator('#pending-skipped')).toHaveCount(0);
  expect(be.matches.some((x) => x.ratings_skipped === true)).toBe(false);
});

test('Pagelle: la redazione salta a gruppi (le più vecchie di 7 giorni, poi tutte) e rimette tutte insieme', async ({ browser }, testInfo) => {
  const be = new FakeBackend();
  const u = league(be, 'redazione');
  const n = strip(be);
  // partite senza testi, con risultato (come le calcola l'app) e quante sono più vecchie di 7 giorni
  const pending = be.matches.filter((x) => x.score_a != null && x.score_b != null && needs(be, String(x.id)));
  const cut = new Date();
  cut.setDate(cut.getDate() - 7);
  const older7 = pending.filter((x) => String(x.date) < cut.toLocaleDateString('sv-SE')).length;
  expect(pending.length).toBe(n);
  expect(older7).toBeGreaterThan(0);
  expect(older7).toBeLessThan(n); // le due partite più recenti dei dati di prova hanno meno di... (se no il test non distingue)

  const page = await open(browser, testInfo, be, u);
  await openMenu(page);
  await page.locator('#menu-red-list').click();
  const sheet = page.locator('#sheet-pending');
  await expect(sheet.locator('#skip-all')).toContainText(`Salta tutte e ${n}`);
  // le più vecchie di 7 giorni
  await expect(sheet.locator('#skip-older-7')).toContainText(`Salta le ${older7} più vecchie di 7 giorni`);
  await sheet.locator('#skip-older-7').click();
  await expect(page.locator('#app-modal-msg')).toContainText(`${older7} partite`);
  await page.locator('#app-modal-ok').click();
  await expect(page.locator('#toast')).toContainText(`${older7} partite saltate`);
  expect(be.matches.filter((x) => x.ratings_skipped === true).length).toBe(older7);
  await expect(sheet.locator('#pending-skipped')).toContainText(`Saltate (${older7})`);
  // tutte
  if (n - older7 > 1) {
    await sheet.locator('#skip-all').click();
    await page.locator('#app-modal-ok').click();
    await expect(page.locator('#toast')).toContainText('partite saltate');
  } else {
    await sheet.locator('.pending-row').first().getByRole('button', { name: /^Salta/ }).click();
  }
  await expect(sheet.locator('#pending-empty')).toBeVisible();
  await expect(sheet.locator('#pending-skipped')).toContainText(`Saltate (${n})`);
  // rimetti tutte
  await sheet.locator('#restore-all').click();
  await page.locator('#app-modal-ok').click();
  await expect(page.locator('#toast')).toContainText('rimesse da scrivere');
  await expect(sheet.locator('#pending-skipped')).toHaveCount(0);
  expect(be.matches.some((x) => x.ratings_skipped === true)).toBe(false);
  // il menu della redazione torna al conteggio di prima
  await page.getByRole('button', { name: 'Indietro' }).click();
  await openMenu(page);
  await expect(page.locator('#menu-red-pending .menu-bd')).toHaveText(String(n));
});

test('Pagelle: la redazione vede il conteggio senza le saltate, e salta dalla scheda della partita', async ({ browser }, testInfo) => {
  const be = new FakeBackend();
  const u = league(be, 'redazione');
  const n = strip(be);
  const page = await open(browser, testInfo, be, u);
  await openMenu(page);
  await expect(page.locator('#menu-red-pending .menu-bd')).toHaveText(String(n));
  await page.locator('#menu-red-list').click();
  await expect(page.locator('#sheet-pending')).toBeVisible();
  await page.getByRole('button', { name: 'Indietro' }).click();
  // dalla scheda dell'ultima partita
  await page.locator('.bottom-nav').getByRole('button', { name: 'Partite', exact: true }).click();
  await page.locator('#last-match .card').click();
  await expect(page.locator('#skip-ratings')).toContainText('Non scrivere le pagelle');
  await page.locator('#skip-ratings').click();
  await expect(page.locator('#skip-ratings')).toContainText('Rimetti tra le pagelle da scrivere');
  await page.locator('#match-modal button', { hasText: '✕' }).first().click();
  await openMenu(page);
  await expect(page.locator('#menu-red-pending .menu-bd')).toHaveText(String(n - 1)); // l'ultima è saltata
});

test('Foto: dentro il pallino in Rosa, in Gioca, nel menu e nell’intestazione (se il giocatore ha la foto)', async ({ browser }, testInfo) => {
  const be = new FakeBackend();
  const u = league(be, 'admin');
  const me = be.players[0] as { id: string; name: string; photo_path: string | null; user_id: string | null };
  me.photo_path = 'foto-di-prova.jpg';
  me.user_id = u; // il mio giocatore: la sua foto va anche in alto
  const broken = be.players[1] as { name: string; photo_path: string | null };
  broken.photo_path = 'foto-non-disponibile.jpg';
  const page = await open(browser, testInfo, be, u);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aWQAAAAASUVORK5CYII=', 'base64');
  await page.route('**/storage/v1/object/public/photos/*', (route) => route.request().url().includes('foto-di-prova.jpg')
    ? route.fulfill({ status: 200, contentType: 'image/png', body: png })
    : route.fulfill({ status: 404 }));
  await page.reload();
  const urlOf = (loc: ReturnType<typeof page.locator>) => loc.evaluate((el) => getComputedStyle(el).backgroundImage);
  // Rosa: immagine caricata davvero e iniziali se il file manca.
  const rosaPhoto = page.locator('#players-list .card-compact').filter({ has: page.getByText(me.name, { exact: true }) }).locator('.avatar');
  await rosaPhoto.scrollIntoViewIfNeeded();
  await expect(rosaPhoto.locator('img')).toHaveAttribute('src', /foto-di-prova\.jpg/);
  await expect.poll(() => rosaPhoto.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  const rosaBroken = page.locator('#players-list .card-compact').filter({ has: page.getByText(broken.name, { exact: true }) }).locator('.avatar');
  await rosaBroken.scrollIntoViewIfNeeded();
  await expect(rosaBroken).not.toHaveClass(/has-photo/);
  await expect(rosaBroken).not.toHaveText('');
  // footer: la mia foto
  expect(await urlOf(page.locator('.bottom-nav .bn-face'))).toContain('foto-di-prova.jpg');
  // Gioca (amministratore): il pallino della lista di convocazione
  await page.locator('.bottom-nav').getByRole('button', { name: 'Gioca', exact: true }).click();
  const giocaPhoto = page.locator('#conv-list .conv-item').filter({ has: page.getByText(me.name, { exact: true }) }).locator('.conv-avatar');
  await giocaPhoto.scrollIntoViewIfNeeded();
  await expect(giocaPhoto.locator('img')).toHaveAttribute('src', /foto-di-prova\.jpg/);
  await expect.poll(() => giocaPhoto.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  const giocaBroken = page.locator('#conv-list .conv-item').filter({ has: page.getByText(broken.name, { exact: true }) }).locator('.conv-avatar');
  await giocaBroken.scrollIntoViewIfNeeded();
  await expect(giocaBroken).not.toHaveClass(/has-photo/);
  await expect(giocaBroken).not.toHaveText('');
  // menu: il cerchio in alto mostra la foto, non l'iniziale
  await openMenu(page);
  await expect(page.locator('#menu-avatar img')).toHaveAttribute('src', /foto-di-prova\.jpg/);
});

test('Firma: «Redazione <nome>» è di chi ha scritto le pagelle; senza autore noto non c\u2019è nessuna firma', async ({ browser }, testInfo) => {
  const be = new FakeBackend();
  const u = league(be, 'admin');
  const last = [...be.matches].filter((x) => x.score_a != null).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] as { id: string };
  const page = await open(browser, testInfo, be, u);
  const pagelle = async () => {
    await page.locator('.bottom-nav').getByRole('button', { name: 'Partite', exact: true }).click();
    await page.locator('#last-match .mbar-btn', { hasText: 'Pagelle' }).click();
    const t = page.locator('#pt-dialog .pt-text');
    await expect(t).toContainText('LE PAGELLE DI CALCIOLERCIO');
    return t;
  };
  // autore non registrato: nessuna firma (né quella fissa di una volta)
  const t0 = await pagelle();
  await expect(t0).not.toContainText('a cura della Redazione');
  await expect(t0).not.toContainText('Avv. Peppe Rella');
  await page.locator('#pt-dialog button', { hasText: 'Chiudi' }).click();
  // autore registrato: compare il suo nome
  be.editors.push({ match_id: last.id, league_id: 'SM', name: 'Luca Rossi' });
  await page.reload(); // si riapre sulle Partite (l'indirizzo ricorda la pagina)
  await expect(page.locator('#last-match')).toBeVisible({ timeout: 20_000 });
  await page.locator('#last-match .mbar-btn', { hasText: 'Pagelle' }).click();
  const t1 = page.locator('#pt-dialog .pt-text');
  await expect(t1).toContainText('LE PAGELLE DI CALCIOLERCIO');
  await expect(t1).toContainText('a cura della Redazione Luca Rossi');
  await expect(t1).not.toContainText('Avv. Peppe Rella');
});
