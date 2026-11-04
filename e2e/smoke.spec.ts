// Schermate in un telefono emulato (iPhone, Android e uno schermo piccolo da 360 px).
// Leggono i dati veri dalla lega pubblica su Supabase: serve la rete.
import { expect, test } from '@playwright/test';
import { fixturePlayer, noOverflow, setup } from './helpers';

// l'app si apre solo con l'accesso: la prova entra come membro della lega pubblica vera (accesso simulato, letture vere)
test.beforeEach(async ({ page }) => {
  await setup(page, { publicRole: 'member' });
});

test('Rosa: 22 carte, la più forte per prima, niente esce in orizzontale', async ({ page }) => {
  await page.goto('/l/san-marcello/rosa');
  const cards = page.locator('#players-list .card-compact');
  await expect(cards).toHaveCount(22, { timeout: 20_000 });
  // prime due: Caputo e Peppe (OVR 7.3, in ordine di nome)
  await expect(cards.nth(0).locator('.player-name-display')).toHaveText('Caputo');
  await expect(cards.nth(1).locator('.player-name-display')).toHaveText('Peppe');
  await expect(cards.nth(0).locator('.ovr-badge')).toHaveText('OVR 7.3');
  const overflow = (await page.evaluate(() => document.documentElement.scrollWidth)) - (page.viewportSize() as { width: number }).width;
  expect(overflow).toBeLessThanOrEqual(0);
  // nessuna carta più larga dello schermo
  const widths = await cards.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
  const vw = await page.evaluate(() => window.innerWidth);
  for (const r of widths) expect(r).toBeLessThanOrEqual(vw + 0.5);
});

test('aprendo la lega si parte da «Il mio profilo» (e il pulsante in basso ci riporta)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#page-profilo')).toHaveClass(/active/);
  await expect(page.locator('.bnav-item.active')).toHaveAttribute('aria-label', 'Il mio profilo');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/l/san-marcello/profilo');
  await page.locator('.bottom-nav').getByRole('button', { name: 'Rosa', exact: true }).click();
  await expect(page.locator('#page-rosa')).toHaveClass(/active/);
  await page.locator('.bottom-nav').getByRole('button', { name: 'Il mio profilo', exact: true }).click();
  await expect(page.locator('#page-profilo')).toHaveClass(/active/);
});

test('le 3 schede in basso (da membro) cambiano pagina', async ({ page }) => {
  await page.goto('/l/san-marcello/rosa');
  await expect(page.locator('#page-rosa')).toHaveClass(/active/);
  for (const [label, id] of [['Partite', 'partite'], ['Classifiche', 'classifiche'], ['Rosa', 'rosa']] as const) {
    await page.locator('.bottom-nav').getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator(`#page-${id}`)).toHaveClass(/active/);
    await expect(page.locator('.bnav-item.active')).toHaveAttribute('aria-label', label);
  }
});

test('scheda giocatore: si apre dalla Rosa, mostra tutto, si chiude e non esce in orizzontale', async ({ page }) => {
  await page.goto('/l/san-marcello/rosa');
  await expect(page.locator('#players-list .card-compact')).toHaveCount(22, { timeout: 20_000 });
  await page.locator('.player-header', { hasText: /^.*Peppe/ }).first().click();
  const modal = page.locator('#match-modal');
  await expect(modal).toBeVisible();
  await expect(modal.locator('#match-modal-title')).toContainText('Peppe');
  // 11 statistiche + "Peso voti"
  await expect(modal.locator('.stats-grid .stat-row')).toHaveCount(12);
  await expect(modal.locator('.stats-grid')).toContainText('Peso voti');
  // pagelle, bacheca, compagni e avversari
  await expect(modal.locator('.pg-title')).toHaveText(/Pagelle/);
  // le pagelle seguono il periodo breve (stagione in corso o ultime 5 partite): fino a 10 barre, mai zero
  await expect.poll(() => modal.locator('.pg-bar').count()).toBeGreaterThan(0);
  expect(await modal.locator('.pg-bar').count()).toBeLessThanOrEqual(10);
  await expect(modal.locator('.bach-sum')).toContainText('Bacheca');
  await expect(modal.locator('.pe-title', { hasText: 'Compagni e avversari' })).toBeVisible();
  const overflow = (await page.evaluate(() => document.documentElement.scrollWidth)) - (page.viewportSize() as { width: number }).width;
  expect(overflow).toBeLessThanOrEqual(0);
  // tocco su una barra: si apre il riquadro con data e voto
  await modal.locator('.pg-hit').nth(2).click();
  await expect(modal.locator('.pg-pop')).toBeVisible();
  await expect(modal.locator('.pgp-top')).toContainText('voto');
  // il riquadro si chiude toccando altrove (può coprire la Bacheca)
  await modal.locator('.stats-grid').click({ position: { x: 4, y: 4 } });
  await expect(modal.locator('.pg-pop')).toBeHidden();
  // la Bacheca si apre e resta aperta passando a un altro giocatore
  await modal.locator('.bach-sum').click();
  await expect(modal.locator('.bach')).toHaveClass(/open/);
  await modal.locator('.pair-n .albo-name').first().click();
  await expect(modal.locator('#match-modal-title')).not.toContainText('Peppe');
  await expect(modal.locator('.bach')).toHaveClass(/open/);
  // si chiude
  await modal.locator('button', { hasText: '✕' }).first().click();
  await expect(modal).toHaveCount(0);
});

test('scheda giocatore: la finestra "Le pagelle di…" si apre dall\'ultima pagella', async ({ page }) => {
  await page.goto('/l/san-marcello/rosa');
  await expect(page.locator('#players-list .card-compact')).toHaveCount(22, { timeout: 20_000 });
  await page.locator('.player-header', { hasText: /^.*Peppe/ }).first().click();
  await page.locator('.pg-last').click();
  const dlg = page.locator('#pl-dialog');
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('.pl-head')).toContainText('Le pagelle di');
  await expect(dlg.locator('.pl-item').first()).toBeVisible();
  await dlg.locator('.pl-head button').click();
  await expect(dlg).toHaveCount(0);
});

test('Classifiche: stagione, schede e apertura della scheda giocatore', async ({ page }) => {
  await page.goto('/l/san-marcello/rosa');
  await expect(page.locator('#players-list .card-compact')).toHaveCount(22, { timeout: 20_000 });
  await page.locator('.bottom-nav').getByRole('button', { name: 'Classifiche', exact: true }).click();
  const cl = page.locator('#page-classifiche');
  // stagioni (la più recente è scelta) + "Sempre"; quattro schede
  await expect(cl.locator('#cl-seasons .chip').first()).toHaveClass(/active/);
  await expect(cl.locator('#cl-seasons .chip').last()).toContainText('Sempre');
  await expect(cl.locator('#cl-tabs .chip')).toHaveCount(4);
  // il riquadro con i totali (partite, gol…) non c'è più
  await expect(cl.locator('.dash-cell')).toHaveCount(0);
  // marcatori: classifica con il primo posto in evidenza
  await expect(cl.locator('#scorers-list .section-header')).toContainText('marcatori');
  const firstName = cl.locator('#scorers-list > div').nth(1);
  await expect(firstName).toContainText('🥇');
  // cambio stagione: «Sempre» si attiva e la lista resta
  await cl.locator('#cl-seasons .chip').last().click();
  await expect(cl.locator('#cl-seasons .chip').last()).toHaveClass(/active/);
  await expect(cl.locator('#scorers-list')).toBeVisible();
  // le altre schede si aprono senza errori
  for (const label of ['Assist', 'Media voto']) {
    await cl.locator('#cl-tabs .chip', { hasText: label }).click();
    await expect(cl.locator('#scorers-list .section-header').first()).toBeVisible();
  }
  await cl.locator('#cl-tabs .chip', { hasText: 'Media voto' }).click();
  await expect(cl.locator('#scorers-list .section-header').first()).toContainText('media voto');
  // un tocco su un nome apre la scheda del giocatore
  await cl.locator('.cl-row').first().click();
  await expect(page.locator('#match-modal')).toBeVisible();
  const overflow = (await page.evaluate(() => document.documentElement.scrollWidth)) - (page.viewportSize() as { width: number }).width;
  expect(overflow).toBeLessThanOrEqual(0);
});

test('la guida «Installa sul telefono» si vede in ogni pagina finché non si chiude', async ({ page }) => {
  await page.goto('/');
  const hint = page.locator('#install-hint');
  await expect(hint).toBeVisible(); // si parte da Classifiche: la guida non è più solo nella Rosa
  for (const label of ['Partite', 'Rosa']) {
    await page.locator('.bottom-nav').getByRole('button', { name: label, exact: true }).click();
    await expect(hint).toBeVisible();
  }
  await expect(page.locator('#page-rosa')).toHaveClass(/active/);
  expect((await page.evaluate(() => document.documentElement.scrollWidth)) - (page.viewportSize() as { width: number }).width).toBeLessThanOrEqual(0);
  await hint.getByRole('button', { name: 'Chiudi' }).click();
  await expect(hint).toHaveCount(0);
  await page.locator('.bottom-nav').getByRole('button', { name: 'Classifiche', exact: true }).click();
  await expect(hint).toHaveCount(0);
});

test('Ricaricare: niente rotellina in alto; si tira la pagina verso il basso e i dati si aggiornano', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#page-profilo')).toHaveClass(/active/);
  await expect(page.locator('#header-refresh')).toHaveCount(0);
  await expect(page.locator('header')).not.toContainText('🔄');
  await page.waitForLoadState('networkidle'); // finito il caricamento iniziale: da qui si contano solo le letture causate dal gesto
  let reads = 0;
  page.on('request', (r) => { if (/league_players|\/matches/.test(r.url()) && r.method() === 'GET') reads++; });
  // gesto di trascinamento verso il basso dalla cima della pagina (eventi di tocco simulati: valgono in ogni browser)
  const touch = (type: string, y: number) =>
    page.evaluate(([t, yy]) => {
      const ev = new Event(t as string, { bubbles: true, cancelable: true }) as Event & { touches?: unknown[] };
      ev.touches = t === 'touchend' ? [] : [{ clientX: 180, clientY: yy as number }];
      (document.querySelector('#page-profilo') as Element).dispatchEvent(ev);
    }, [type, y] as const);
  // tirata corta: non succede niente
  await touch('touchstart', 100); await touch('touchmove', 140); await touch('touchmove', 170);
  await expect(page.locator('#ptr')).toContainText('Tira per aggiornare');
  await touch('touchend', 170);
  await expect(page.locator('#ptr')).toHaveCount(0);
  expect(reads).toBe(0);
  // tirata lunga: compare l'avviso, al rilascio si aggiorna
  await touch('touchstart', 100); await touch('touchmove', 160); await touch('touchmove', 300);
  await expect(page.locator('#ptr')).toContainText('Rilascia per aggiornare');
  await touch('touchend', 300);
  await expect(page.locator('#toast')).toContainText('Aggiornato', { timeout: 10_000 });
  expect(reads).toBeGreaterThan(0);
  await expect(page.locator('#ptr')).toHaveCount(0);
});

test('Intestazione: accessibile su schermo piccolo e cambio lega', async ({ page }) => {
  await setup(page, { mePlayer: fixturePlayer() });
  await page.goto('/');
  const btn = page.locator('#menu-button');
  await expect(btn).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#league-pill')).toContainText('San Marcello');
  // nessun elemento fuori dallo schermo, nemmeno a 320 px
  await page.setViewportSize({ width: 320, height: 700 });
  await noOverflow(page);
  const head = (await page.locator('header').boundingBox())!;
  for (const sel of ['#menu-button', '.app-title', '#league-pill']) {
    const b = (await page.locator(sel).boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(-0.5);
    expect(b.x + b.width).toBeLessThanOrEqual(head.width + 0.5);
  }
  // Il nome della lega apre il menu per cambiarla
  await page.locator('.bottom-nav').getByRole('button', { name: 'Rosa', exact: true }).click();
  await page.locator('#league-pill').click();
  await expect(page.locator('#menu-drawer')).toBeVisible();
});
