// «Il mio profilo» = pagina iniziale: le mie leghe, la scheda, la prossima partita, la mia ultima partita (coriandoli / pioggia),
// il riepilogo, il mio giocatore, uscire da una lega. Footer a sole icone con la mia faccia. Database finto con i dati veri di prova.
import { expect, test, type Browser, type Page, type TestInfo } from './fixtures';
import { FakeBackend } from './fakeBackend';
import { noOverflow, openMenu, openProfile } from './helpers';

type Row = Record<string, unknown>;

/** Lega San Marcello con i dati di prova; `me` = un giocatore che ha giocato l'ultima partita, collegato al mio account. */
function world(role: 'admin' | 'member' = 'member', link = true) {
  const be = new FakeBackend();
  const u = be.addUser('u-me', 'me@example.com', 'Io Medesimo');
  be.leagues.push({ id: 'SM', name: 'San Marcello', slug: 'san-marcello', is_public: false, invite_code: 'smsmsmsm', owner_id: null, settings: {}, created_at: '2026-01-01' });
  be.members.push({ league_id: 'SM', user_id: u, role, joined_at: '2026-01-01' });
  be.seedLegacy('SM');
  // una seconda lega di cui faccio parte
  be.leagues.push({ id: 'L2', name: 'Calcetto del Giovedì', slug: 'calcetto-del-giovedi', is_public: false, invite_code: 'giovgiov', owner_id: null, settings: {}, created_at: '2026-02-01' });
  be.members.push({ league_id: 'L2', user_id: u, role: 'member', joined_at: '2026-02-01' });
  const last = [...be.matches].filter((x) => x.score_a != null).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] as Row;
  const mp = be.mplayers.find((r) => r.match_id === last.id) as Row;
  const me = be.players.find((p) => p.id === mp.player_id) as Row;
  if (link) me.user_id = u;
  return { be, u, last, mp, me };
}
async function open(browser: Browser, testInfo: TestInfo, be: FakeBackend, user: string, path = '/') {
  const { defaultBrowserType: _ignored, ...use } = testInfo.project.use;
  void _ignored;
  const ctx = await browser.newContext({ ...use });
  await be.attach(ctx, user);
  await ctx.addInitScript(() => localStorage.removeItem('calciolercio-cache'));
  const page = await ctx.newPage();
  await page.goto(path);
  await expect(page.locator('#menu-button')).toBeVisible({ timeout: 20_000 });
  return page;
}
/** Il mio esito nella partita (mettendo il risultato che voglio): 'W' vinta, 'L' persa, 'D' pari. */
function setResult(be: FakeBackend, matchId: unknown, myTeam: unknown, res: 'W' | 'L' | 'D') {
  const m = be.matches.find((x) => x.id === matchId) as Row;
  const mineA = myTeam === 'A';
  m.score_a = res === 'D' ? 3 : (res === 'W') === mineA ? 6 : 2;
  m.score_b = res === 'D' ? 3 : (res === 'W') === mineA ? 2 : 6;
}
const y = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!.y;

test('Profilo: è la pagina iniziale e le sezioni sono nell’ordine voluto', async ({ browser }, testInfo) => {
  const { be, u, me } = world();
  // una partita in programma in cui gioco: così compare anche «Prossima partita»
  const d = new Date();
  d.setDate(d.getDate() + 3);
  be.matches.push({ id: 'futura', league_id: 'SM', date: d.toLocaleDateString('sv-SE'), play_time: '21:00:00', place: 'Campo Sole', notes: null, score_a: null, score_b: null, pred: null, pred_rank: null });
  be.mplayers.push({ match_id: 'futura', player_id: me.id, team: 'B', position: 1, rating: null, goals: 0, assist: 0, autogol: 0, meta: 0, rigori_sbagliati: 0, titolo: null, descrizione: null });
  const page = await open(browser, testInfo, be, u);
  await expect(page.locator('#page-profilo.active')).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => new URL(page.url()).pathname).toBe('/l/san-marcello/profilo');
  await expect(page.locator('#profile-player-card')).toBeVisible();
  const order = ['#next-match', '#my-last-match', '#profile-player-card', '#profile-recent-matches', '#myplayer-card', '#my-tools', '#leave-card'];
  const ys: number[] = [];
  for (const sel of order) {
    await expect(page.locator(sel).first(), sel).toBeVisible();
    ys.push(await y(page, sel));
  }
  await expect(page.locator('#profile-card')).toHaveCount(0);
  expect(ys).toEqual([...ys].sort((a, b) => a - b)); // dall'alto verso il basso, nell'ordine dato
  await noOverflow(page);
});

test('Cambio lega dal menu: lega attiva e selezione immediata', async ({ browser }, testInfo) => {
  const { be, u } = world();
  const page = await open(browser, testInfo, be, u);
  await expect(page.locator('#profilo-leghe')).toHaveCount(0);
  await openMenu(page);
  await expect(page.locator('#menu-leagues .menu-lgrow.act')).toContainText('San Marcello');
  await page.locator('#menu-leagues .menu-lgrow[data-slug="calcetto-del-giovedi"]').click();
  await expect(page.locator('#league-pill')).toContainText('Calcetto del');
  await openMenu(page);
  await expect(page.locator('#menu-leagues .menu-lgrow.act')).toContainText('Calcetto del');
});

test('Profilo: la prossima partita mostra giorno, ora, luogo, squadra, compagni e avversari', async ({ browser }, testInfo) => {
  const { be, u, me } = world();
  const d = new Date();
  d.setDate(d.getDate() + 3);
  be.matches.push({ id: 'futura', league_id: 'SM', date: d.toLocaleDateString('sv-SE'), play_time: '21:00:00', place: 'Campo Sole', notes: null, score_a: null, score_b: null, pred: null, pred_rank: null });
  const others = be.players.filter((p) => p.id !== me.id).slice(0, 3);
  be.mplayers.push(
    { match_id: 'futura', player_id: me.id, team: 'B', position: 1 },
    { match_id: 'futura', player_id: others[0]!.id, team: 'B', position: 2 },
    { match_id: 'futura', player_id: others[1]!.id, team: 'A', position: 3 },
    { match_id: 'futura', player_id: others[2]!.id, team: 'A', position: 4 },
  );
  const page = await open(browser, testInfo, be, u);
  const card = page.locator('#next-match');
  await expect(card).toContainText('Campo Sole');
  await expect(card).toContainText('21:00');
  await expect(card).toContainText('Giochi con i ⚪ Bianchi');
  await expect(card).toContainText(`Con te: ${others[0]!.name}`);
  await expect(card).toContainText(others[1]!.name as string);
  await expect(card).toContainText('Contro:');
  // La partita resta in programma, ma non compare se non sono convocato.
  be.mplayers = be.mplayers.filter((r) => !(r.match_id === 'futura' && r.player_id === me.id));
  await page.reload();
  await expect(page.locator('#my-last-match')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#next-match')).toHaveCount(0);
});

for (const [res, effect] of [['W', 'coriandoli'], ['L', 'pioggia'], ['D', 'nessun effetto']] as const) {
  test(`Ultima partita (${res}): ${effect}, nel profilo e nella schermata Partite`, async ({ browser }, testInfo) => {
    const { be, u, last, mp } = world();
    setResult(be, last.id, mp.team, res);
    const page = await open(browser, testInfo, be, u);
    // coriandoli = un velo a tutto schermo (solo se ho vinto); pioggia = dentro il riquadro (solo se ho perso)
    const fx = async (box: ReturnType<typeof page.locator>) => {
      await expect(page.locator('#profile-confetti')).toHaveCount(res === 'W' ? 1 : 0);
      await expect(box.locator('#rain-fx')).toHaveCount(res === 'L' ? 1 : 0);
    };
    // nel profilo («La mia ultima partita»)
    const mine = page.locator('#my-last-match');
    await expect(mine).toHaveAttribute('data-result', res);
    await expect(mine).toContainText(res === 'W' ? 'Hai vinto' : res === 'L' ? 'Hai perso' : 'Hai pareggiato');
    await fx(mine);
    // nelle Partite («Ultima partita» della lega): stesso riquadro, stesso effetto, perché ci ho giocato
    await page.locator('.bottom-nav').getByRole('button', { name: 'Partite', exact: true }).click();
    const lm = page.locator('#last-match .card');
    await expect(lm).toHaveAttribute('data-result', res);
    await fx(lm);
    // gli effetti non bloccano i tocchi: la partita si apre
    await lm.click({ position: { x: 20, y: 20 } });
    await expect(page.locator('#match-modal')).toBeVisible();
  });
}

test('Partite: se nell’ultima partita non c’ero io, nessun effetto', async ({ browser }, testInfo) => {
  const { be, u, last, me } = world();
  // tolgo il mio giocatore da quella partita
  be.mplayers = be.mplayers.filter((r) => !(r.match_id === last.id && r.player_id === me.id));
  const page = await open(browser, testInfo, be, u, '/l/san-marcello/partite');
  const lm = page.locator('#last-match .card');
  await expect(lm).toBeVisible({ timeout: 20_000 });
  await expect(lm).not.toHaveAttribute('data-result', /./);
  await expect(page.locator('#profile-confetti, #rain-fx')).toHaveCount(0);
});

test('Titolo e logo riportano al profilo', async ({ browser }, testInfo) => {
  const { be, u } = world();
  const page = await open(browser, testInfo, be, u, '/l/san-marcello/classifiche');
  await expect(page.locator('#page-classifiche.active')).toBeVisible({ timeout: 20_000 });
  await openProfile(page);
  await expect(page.locator('#page-profilo.active')).toBeVisible();
  await page.locator('.bottom-nav').getByRole('button', { name: 'Rosa', exact: true }).click();
  await openProfile(page);
  await expect(page.locator('#page-profilo.active')).toBeVisible();
});

test('Footer: solo icone, «Il mio profilo» per primo con la mia faccia; anche a 320 px', async ({ browser }, testInfo) => {
  const { be, u, me } = world('admin');
  (me as Row).photo_path = 'foto-prova.jpg';
  const page = await open(browser, testInfo, be, u);
  const items = page.locator('.bottom-nav .bnav-item');
  await expect(items).toHaveCount(5); // profilo, classifiche, partite, gioca (admin), rosa
  expect(await items.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(['Il mio profilo', 'Classifiche', 'Partite', 'Gioca', 'Rosa']);
  expect(await items.evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()))).toEqual(['', '', '', '', '']); // niente scritte
  await expect(items.first()).toHaveClass(/active/); // si parte dal profilo
  const bg = await page.locator('.bn-face').evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bg).toContain('foto-prova.jpg');
  await page.setViewportSize({ width: 320, height: 700 });
  await noOverflow(page);
  for (const b of await items.all()) {
    const box = (await b.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(-0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(320.5);
    expect(box.width).toBeGreaterThan(40);
  }
  // senza foto: l'iniziale; il tocco porta al profilo
  (me as Row).photo_path = null;
  await page.reload();
  await expect(page.locator('.bn-face')).toHaveText(String(me.name).slice(0, 1).toUpperCase(), { timeout: 20_000 });
  await items.nth(4).click();
  await expect(page.locator('#page-rosa.active')).toBeVisible();
  await items.first().click();
  await expect(page.locator('#page-profilo.active')).toBeVisible();
});

test('Profilo senza un giocatore collegato: le leghe, «Questo sono io» e l’uscita; nessuna scheda e icona generica nel footer', async ({ browser }, testInfo) => {
  const { be, u } = world('member', false);
  const page = await open(browser, testInfo, be, u);
  await expect(page.locator('#page-profilo.active')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#profilo-leghe')).toHaveCount(0);
  await expect(page.locator('#myplayer-card')).toContainText('Scegli il tuo nome');
  await expect(page.locator('#leave-card')).toBeVisible();
  await expect(page.locator('#profile-player-card, #my-last-match, #next-match, #profile-card')).toHaveCount(0);
  await expect(page.locator('.bn-face')).toHaveCount(0);
  await expect(page.locator('.bottom-nav .bnav-item').first().locator('svg')).toBeVisible();
});


test('Profilo: statistiche e ultime dieci partite seguono la lega scelta', async ({ browser }, testInfo) => {
  const { be, u, me } = world();
  be.lplayers.push({ league_id: 'L2', player_id: me.id, aliases: [] });
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  for (let i = 1; i <= 12; i++) {
    const id = 'l2-match-' + i;
    be.matches.push({ id, league_id: 'L2', date: today, score_a: 99, score_b: 0, notes: null, pred: null, pred_rank: null });
    be.mplayers.push({ match_id: id, player_id: me.id, team: 'A', position: 0, rating: 10, goals: 0, assist: 0, autogol: 0, meta: 0, rigori_sbagliati: 0, titolo: 'Ottimo', descrizione: null });
  }
  const page = await open(browser, testInfo, be, u);
  const card = page.locator('#profile-player-card');
  await expect(card).toBeVisible();
  const overall = await card.locator('.fut-mini-ovr').innerText();
  await expect(page.locator('#profile-card')).toHaveCount(0);
  await openMenu(page);
  await page.locator('#menu-leagues .menu-lgrow[data-slug="calcetto-del-giovedi"]').click();
  await expect(page.locator('#league-pill')).toContainText('Calcetto del');
  await expect(page.locator('#profile-recent-matches .profile-match')).toHaveCount(10);
  await expect(page.locator('#profile-recent-matches')).toContainText('99 - 0');
  await expect(card.locator('.fut-mini-ovr')).toHaveText(overall);
  await expect(card).toContainText('Stagione in corso');
  await expect(card.locator('.pg-cell').filter({ hasText: 'Media voto' }).locator('.pg-val')).toHaveText('10.00');
  await card.locator('.pg-last').click();
  await expect(page.locator('#pl-dialog')).toContainText('Stagione in corso');
  await expect(page.locator('#pl-dialog .pl-item')).toHaveCount(12);
  await page.locator('#pl-dialog').getByRole('button', { name: 'Chiudi' }).click();
  await page.locator('#profile-recent-matches .profile-match').first().click();
  await expect(page.locator('#match-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#match-modal')).toHaveCount(0);
  await openMenu(page);
  await page.locator('#menu-leagues .menu-lgrow[data-slug="san-marcello"]').click();
  await expect(page.locator('#league-pill')).toContainText('San Marcello');
  await expect(page.locator('#profile-recent-matches')).not.toContainText('99 - 0');
});

test('Forma: stesso stato in Rosa e profilo, distinto per lega', async ({ browser }, testInfo) => {
  const { be, u, me } = world();
  const removed = new Set(be.matches.filter((m) => m.league_id === 'SM').map((m) => m.id));
  be.matches = be.matches.filter((m) => m.league_id !== 'SM');
  be.mplayers = be.mplayers.filter((r) => !removed.has(r.match_id));
  be.lplayers.push({ league_id: 'L2', player_id: me.id, aliases: [] });
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  const old = `${Number(today.slice(0, 4)) - 1}-01-01`;
  const add = (league: string, votes: number[]) => votes.forEach((rating, i) => {
    const id = `${league}-form-${i}`;
    be.matches.push({ id, league_id: league, date: league === 'SM' && i < 4 ? old : today, score_a: 2, score_b: 1 });
    be.mplayers.push({ match_id: id, player_id: me.id, team: 'A', position: 0, rating, goals: 0, assist: 0, autogol: 0, meta: 0, rigori_sbagliati: 0 });
  });
  add('SM', [5, 5, 5, 5, 8, 8, 7, 6, 6]);
  add('L2', [5, 5, 5, 8, 8]);
  const page = await open(browser, testInfo, be, u);
  const card = page.locator('#profile-player-card');
  await expect(card.locator('.fut-mini')).not.toHaveClass(/crisi|fire/);
  await expect(card.locator('.pg-head')).toContainText('Costante');
  await expect(card.locator('.pg-cell').filter({ hasText: 'Media voto' }).locator('.pg-val')).toHaveText('7.00');
  await page.locator('.bottom-nav').getByRole('button', { name: 'Rosa', exact: true }).click();
  await expect(page.locator('#players-list .card-compact', { hasText: String(me.name) }).locator('.fire-chip')).toHaveCount(0);
  await openProfile(page);
  await openMenu(page);
  await page.locator('#menu-leagues .menu-lgrow[data-slug="calcetto-del-giovedi"]').click();
  await expect(page.locator('#league-pill')).toContainText('Calcetto del');
  await expect(card.locator('.fut-mini')).toHaveClass(/fire/);
  await expect(card.locator('.pg-head')).toContainText('In forma');
  await page.locator('.bottom-nav').getByRole('button', { name: 'Rosa', exact: true }).click();
  await expect(page.locator('#players-list .card-compact', { hasText: String(me.name) }).locator('.fire-chip')).toHaveText('🔥');
});
