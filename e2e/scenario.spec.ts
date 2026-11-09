// Scenario completo con più persone, ognuna nel suo telefono emulato (iPhone, Android, schermo da 360 px), su un database finto condiviso:
// il creatore apre una lega → invito personale a un giocatore → l'amico si registra dal link e viene collegato →
// entra con il codice in una seconda lega portando il suo giocatore (niente doppioni) → un admin non creatore propone un nuovo admin →
// il creatore approva → la redazione importa le pagelle da WhatsApp → l'admin salva la partita → il registro attività contiene tutte le azioni.
// (I permessi veri e il registro scritto dai trigger si provano sul database vero in supabase/tests/*.sql.)
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { FakeBackend } from './fakeBackend';
import { noOverflow, openMenu } from './helpers';

const WHATSAPP = readFileSync('tests/fixtures/whatsapp/2026-10-28_pagelle.txt', 'utf-8');
const BLU = ['Steppata', 'Fabio', 'Nico', 'Grosso', 'Seghino'];
const BIANCHI = ['Gianluca', 'Rella', 'Peppe', 'Vito', 'Luciano'];

test('Scenario completo: lega, invito, collegamento, codice, ruoli, pagelle, registro', async ({ browser }, testInfo) => {
  test.setTimeout(300_000);
  const { defaultBrowserType: _ignored, ...use } = testInfo.project.use;
  void _ignored;
  const be = new FakeBackend();
  const O = be.addUser('u-owner', 'luciano@example.com', 'Luciano Creatore');
  const X = be.addUser('u-xena', 'xena@example.com', 'Xena Admin');
  const R = be.addUser('u-rita', 'rita@example.com', 'Rita Redazione');
  const S = be.addUser('u-sara', 'sara@example.com', 'Sara Suprema');
  be.supers.add(S);
  be.supers.add(O); // per ora le leghe le crea solo l'amministratore supremo: il «creatore» dello scenario lo è
  const pages: Page[] = [];
  const phone = async (user: string | null): Promise<Page> => {
    const ctx = await browser.newContext({ ...use });
    await be.attach(ctx, user);
    // ogni caricamento parte da dati freschi: la copia salvata (valida 1 minuto) nasconderebbe le modifiche fatte dagli altri telefoni
    await ctx.addInitScript(() => localStorage.removeItem('calciolercio-cache'));
    const page = await ctx.newPage();
    pages.push(page);
    return page;
  };
  const joinWithCode = async (page: Page, code: string) => {
    await openMenu(page);
    await page.locator('#menu-join').click();
    await page.locator('#jl-code').fill(code);
    await page.locator('#jl-submit').click();
    await expect(page.locator('#toast')).toContainText('Sei dentro la lega', { timeout: 15_000 });
    await expect(page.locator('#page-profilo.active')).toBeVisible();
  };
  const createLeague = async (page: Page, name: string): Promise<string> => {
    await openMenu(page);
    await page.locator('#menu-superadmin').click();
    await page.locator('#menu-create').click();
    await page.locator('#cl-name').fill(name);
    await page.locator('#cl-submit').click();
    await expect(page.locator('#sheet-created')).toBeVisible({ timeout: 15_000 });
    const code = (await page.locator('#created-code').textContent()) ?? '';
    await page.getByRole('button', { name: 'Vai alla lega' }).click();
    // l'amministratore supremo ritrova il riquadro SUPERADMIN sotto il menu: si chiudono entrambi
    await page.getByRole('button', { name: 'Indietro' }).click();
    await page.getByRole('button', { name: 'Chiudi il menu' }).click();
    await expect(page.locator('#league-pill')).toContainText(name);
    return code;
  };

  // 1 · il creatore apre la lega e aggiunge un giocatore
  const owner = await phone(O);
  await owner.goto('/');
  await expect(owner.locator('#menu-button')).toBeVisible({ timeout: 20_000 });
  const code1 = await createLeague(owner, 'Calcetto Scenario');
  const l1 = be.leagues.find((l) => l.name === 'Calcetto Scenario')!;
  expect(l1.owner_id).toBe(O);
  expect(code1).toBe(l1.invite_code);
  await expect(owner.locator('#empty-guide')).toBeVisible();
  await owner.locator('#guide-new').click();
  await owner.locator('#app-modal-input').fill('Fabio');
  await owner.locator('#app-modal-ok').click();
  await expect(owner.locator('#toast')).toContainText('Giocatore aggiunto');
  // il resto della rosa e una partita già giocata (la generazione delle squadre si prova in gioca.spec.ts)
  be.seedMatch(l1.id as string, BLU, BIANCHI, '2026-10-28');
  await owner.reload();
  await expect(owner.locator('#players-list .card-compact')).toHaveCount(10, { timeout: 20_000 });

  // 2 · invito personale a Fabio
  await openMenu(owner);
  await owner.locator('#menu-league-admin').click();
  await owner.locator('#menu-invites').click();
  await owner.getByRole('button', { name: 'Invita Fabio' }).click();
  await expect.poll(() => be.invites.length, { timeout: 10_000 }).toBe(1);
  const token = be.invites[0]!.token as string;
  await owner.getByRole('button', { name: 'Indietro' }).click();
  await owner.getByRole('button', { name: 'Indietro' }).click();
  await owner.getByRole('button', { name: 'Chiudi il menu' }).click();

  // 3 · l'amico apre il link, si registra e viene collegato al suo giocatore
  const friend = await phone(null);
  await friend.goto(`/invito/${token}`);
  await expect(friend.locator('#invite-intro')).toContainText('Ciao Fabio', { timeout: 20_000 });
  const card = friend.locator('#invite-page #account-card');
  await card.locator('#mode-up').click();
  await card.locator('input[autocomplete=name]').fill('Fabio Amico');
  await card.locator('input[type=email]').fill('fabio@example.com');
  await card.locator('input[type=password]').fill('segreta123');
  await card.locator('button.btn-primary').click();
  await expect(friend.locator('#invite-ok')).toContainText('Benvenuto Fabio', { timeout: 20_000 });
  await friend.locator('#invite-go').click();
  await expect(friend.locator('#page-profilo.active')).toBeVisible();
  await expect(friend.locator('#myplayer-name')).toHaveText('Fabio');
  const fabio = be.players.find((p) => p.name === 'Fabio')!;
  const F = fabio.user_id as string;
  expect(F).toBeTruthy();
  expect(be.userName(F)).toBe('Fabio Amico');
  expect(be.members.some((m) => m.league_id === l1.id && m.user_id === F && m.role === 'member')).toBe(true);
  await noOverflow(friend);

  // 4 · il creatore apre una seconda lega; l'amico entra con il codice portando il suo giocatore (niente doppioni)
  const code2 = await createLeague(owner, 'Seconda Lega');
  const l2 = be.leagues.find((l) => l.name === 'Seconda Lega')!;
  const playersBefore = be.players.length;
  await joinWithCode(friend, code2);
  expect(be.players.length).toBe(playersBefore);
  expect(be.players.filter((p) => p.user_id === F)).toHaveLength(1);
  expect(be.lplayers.filter((lp) => lp.league_id === l2.id)).toHaveLength(1);
  expect(be.lplayers.find((lp) => lp.league_id === l2.id)?.player_id).toBe(fabio.id);
  await expect(friend.locator('#league-pill')).toContainText('Seconda Lega');
  await friend.locator('.bottom-nav').getByRole('button', { name: 'Rosa', exact: true }).click(); // dopo l'ingresso si apre il profilo
  await expect(friend.locator('#players-list .card-compact')).toHaveCount(1, { timeout: 15_000 });

  // 5 · Xena e Rita entrano nella prima lega con il codice
  const xena = await phone(X);
  await xena.goto('/');
  await expect(xena.locator('#menu-button')).toBeVisible({ timeout: 20_000 });
  await joinWithCode(xena, code1);
  const rita = await phone(R);
  await rita.goto('/');
  await expect(rita.locator('#menu-button')).toBeVisible({ timeout: 20_000 });
  await joinWithCode(rita, code1);

  // 6 · il creatore nomina Xena amministratrice e Rita redazione
  await owner.goto('/l/calcetto-scenario/rosa');
  await expect(owner.locator('#league-pill')).toContainText('Calcetto Scenario', { timeout: 20_000 });
  await openMenu(owner);
  await owner.locator('#menu-league-admin').click();
  await owner.locator('#menu-members').click();
  const row = (name: string) => owner.locator('.member-row', { hasText: name });
  await expect(row('Xena Admin')).toBeVisible();
  await row('Xena Admin').getByRole('button', { name: 'Rendi admin' }).click();
  await expect(owner.locator('#toast')).toContainText('Ora è amministratore');
  await row('Rita Redazione').getByRole('button', { name: 'Rendi redazione' }).click();
  await expect(owner.locator('#toast')).toContainText('Ora è redazione');
  expect(be.members.find((m) => m.league_id === l1.id && m.user_id === X)?.role).toBe('admin');
  expect(be.members.find((m) => m.league_id === l1.id && m.user_id === R)?.role).toBe('redazione');
  await owner.getByRole('button', { name: 'Indietro' }).click();

  // 7 · Xena (admin, non creatrice) può solo proporre: propone Fabio
  await xena.goto('/l/calcetto-scenario/rosa');
  await expect(xena.locator('#league-pill')).toContainText('Calcetto Scenario', { timeout: 20_000 });
  await openMenu(xena);
  await xena.locator('#menu-league-admin').click();
  await expect(xena.locator('#menu-proposals')).toHaveCount(0);
  await xena.locator('#menu-members').click();
  const xrow = xena.locator('.member-row', { hasText: 'Fabio Amico' });
  await expect(xrow.getByRole('button', { name: 'Rendi admin' })).toHaveCount(0);
  await xrow.getByRole('button', { name: 'Proponi come admin' }).click();
  await expect(xena.locator('#toast')).toContainText('Proposta inviata al creatore');

  // 8 · il creatore approva
  await owner.reload();
  await expect(owner.locator('#league-pill')).toContainText('Calcetto Scenario', { timeout: 20_000 });
  await openMenu(owner);
  await owner.locator('#menu-league-admin').click();
  await expect(owner.locator('#menu-proposals')).toContainText('(1)');
  await owner.locator('#menu-proposals').click();
  await expect(owner.locator('.proposal-row')).toHaveCount(1);
  await expect(owner.locator('.proposal-row')).toContainText('proposto da Xena Admin');
  await owner.getByRole('button', { name: 'Approva Fabio Amico' }).click();
  await expect(owner.locator('#toast')).toContainText('è ora amministratore');
  expect(be.members.find((m) => m.league_id === l1.id && m.user_id === F)?.role).toBe('admin');
  await owner.getByRole('button', { name: 'Indietro' }).click();

  // 9 · la redazione importa le pagelle da WhatsApp (solo titoli e descrizioni)
  await rita.goto('/l/calcetto-scenario/rosa');
  await expect(rita.locator('#league-pill')).toContainText('Calcetto Scenario', { timeout: 20_000 });
  await openMenu(rita);
  await expect(rita.locator('#menu-members')).toHaveCount(0); // niente gestione per la redazione
  await rita.locator('#menu-red-import').click();
  const modal = rita.locator('#match-modal');
  await expect(modal.locator('button', { hasText: 'Salva pagelle' })).toBeVisible({ timeout: 15_000 });
  await expect(modal.locator('.rate-btn-plus')).toHaveCount(0);
  await modal.locator('#wa-text').fill(WHATSAPP);
  await modal.getByRole('button', { name: /Analizza il messaggio/ }).click();
  await modal.getByRole('button', { name: /Assegna titoli e descrizioni/ }).click();
  await modal.locator('button', { hasText: 'Salva pagelle' }).click();
  await expect(rita.locator('#toast')).toContainText('Salvati titoli e descrizioni', { timeout: 15_000 });
  const steppata = be.players.find((p) => p.name === 'Steppata')!;
  const sp = be.mplayers.find((m) => m.player_id === steppata.id)!;
  expect(String(sp.titolo)).toContain('LEADER');
  expect(String(sp.descrizione).length).toBeGreaterThan(50);
  expect(sp.rating).toBe(6); // i voti non si sono mossi
  await noOverflow(rita);

  // 10 · l'admin (Xena) salva la partita: risultato 5-3 e un voto
  await xena.reload();
  await expect(xena.locator('#league-pill')).toContainText('Calcetto Scenario', { timeout: 20_000 });
  await xena.locator('.bottom-nav').getByRole('button', { name: 'Partite', exact: true }).click();
  await xena.locator('#last-match .card').click();
  const xm = xena.locator('#match-modal');
  await xm.locator('#edit-toggle-btn').click();
  await xm.locator('#sc-a').fill('5');
  await xm.locator('#sc-b').fill('3');
  await xm.locator('button', { hasText: 'Salva partita' }).click();
  await expect(xena.locator('#toast')).toContainText('Salvato', { timeout: 15_000 });
  expect(be.matches[0]!.score_a).toBe(5);
  expect(be.matches[0]!.score_b).toBe(3);
  expect(String(be.mplayers.find((m) => m.player_id === steppata.id)!.titolo)).toContain('LEADER'); // il testo della redazione resta
  await noOverflow(xena);

  // 11 · il registro attività (amministratrice suprema) contiene tutte le azioni
  const sara = await phone(S);
  await sara.goto('/');
  await expect(sara.locator('#menu-button')).toBeVisible({ timeout: 20_000 });
  await openMenu(sara);
  await sara.locator('#menu-superadmin').click();
  await sara.locator('#menu-audit').click();
  await expect(sara.locator('#sheet-audit')).toBeVisible();
  await sara.locator('#audit-search').click(); // il registro si carica solo dopo «Cerca attività»
  await expect(sara.locator('.audit-op').first()).toBeVisible({ timeout: 15_000 });
  const heads = sara.locator('.audit-head');
  for (let i = (await heads.count()) - 1; i >= 0; i--) await heads.nth(i).click(); // si aprono tutte le operazioni
  const text = (await sara.locator('#sheet-audit').innerText()).replace(/\s+/g, ' ');
  for (const phrase of [
    'ha creato la lega «Calcetto Scenario»',
    'ha creato la lega «Seconda Lega»',
    'ha creato il link d’invito per Fabio',
    'Fabio ha usato il suo link d’invito',
    'Fabio è stato collegato a un account',
    'ha cambiato il ruolo di Xena Admin da membro a amministratore',
    'ha cambiato il ruolo di Rita Redazione da membro a redazione',
    'ha proposto Fabio Amico come amministratore',
    'ha approvato Fabio Amico come amministratore',
    'ha aggiunto il titolo «LEADER',
    'ha cambiato il risultato della partita del 28/10/2026',
  ]) expect(text, `nel registro manca: ${phrase}`).toContain(phrase);
  for (const who of ['Luciano Creatore', 'Fabio Amico', 'Xena Admin', 'Rita Redazione']) expect(text).toContain(who);
  expect(await sara.locator('.audit-op.delicate').count()).toBeGreaterThanOrEqual(3); // cambi di ruolo e approvazione
  await noOverflow(sara);

  // chi non è amministratore supremo non ha la voce nel menu
  await openMenu(xena);
  await expect(xena.locator('#menu-audit')).toHaveCount(0);
  await Promise.all(pages.map((p) => p.context().close()));
});
