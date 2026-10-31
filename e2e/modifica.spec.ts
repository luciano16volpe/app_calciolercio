// Modifica partite (passo 3.7b): scheda partita modificabile, nuova partita da Gioca, eliminazione.
// Nessuna scrittura vera: l'accesso da amministratore è simulato e ogni scrittura verso Supabase viene intercettata e registrata.
import { expect, test, type Page, type Route } from '@playwright/test';

const REF = 'ivrwqpuikbnvnxgvgegd';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const FAKE_JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp: 4102444800 })}.firma`;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

interface Write { method: string; table: string; body: unknown }

/** Simula l'accesso (con il ruolo dato, o nessun accesso) e intercetta le scritture. Le letture vanno ai dati veri con la chiave pubblica. */
async function login(page: Page, role: 'admin' | 'member' | null = 'admin') {
  const writes: Write[] = [];
  if (role) {
    await page.addInitScript(([ref, jwt]) => {
      localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
        access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 99999999, expires_at: 4102444800,
        user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
      }));
    }, [REF, FAKE_JWT]);
  }
  await page.route('**/auth/v1/**', (r: Route) => r.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: '{}' }));
  await page.route('**/storage/v1/object/**', async (r: Route) => {
    const req = r.request();
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET') return r.continue(); // le foto pubbliche si leggono normalmente
    writes.push({ method: req.method(), table: 'storage', body: new URL(req.url()).pathname.split('/object/')[1] });
    return r.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ Key: 'ok' }) });
  });
  await page.route('**/rest/v1/**', async (r: Route) => {
    const req = r.request();
    const table = new URL(req.url()).pathname.split('/').pop() as string;
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET') {
      if (table === 'league_members') {
        const list = new URL(req.url()).search.includes('leagues'); // "le mie leghe" (elenco) oppure "il mio ruolo" (uno solo)
        return r.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(list ? [] : { role }) });
      }
      const h = { ...req.headers() };
      h.authorization = `Bearer ${h.apikey}`; // le letture pubbliche non devono portare il finto accesso
      return r.continue({ headers: h });
    }
    if (table === 'league_member_list') return r.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: '[]' }); // è una lettura (elenco membri)
    let body: unknown = null;
    try { body = req.postDataJSON(); } catch { /* nessun corpo */ }
    writes.push({ method: req.method(), table, body });
    const created = req.method() === 'POST' && (table === 'matches' || table === 'players');
    return r.fulfill({ status: created ? 201 : 204, headers: CORS, contentType: 'application/json', body: created ? JSON.stringify({ id: table === 'players' ? 'nuovo-giocatore' : 'nuova-partita' }) : '' });
  });
  return writes;
}

async function openLastMatch(page: Page) {
  await page.goto('/');
  await expect(page.locator('#players-list .card-compact')).toHaveCount(22, { timeout: 20_000 });
  await page.locator('.bottom-nav').getByText('Partite', { exact: true }).click();
  await page.locator('#last-match .card').click();
  return page.locator('#match-modal');
}
const noOverflow = async (page: Page) =>
  expect((await page.evaluate(() => document.documentElement.scrollWidth)) - (page.viewportSize() as { width: number }).width).toBeLessThanOrEqual(0);

async function generateTeams(page: Page) {
  await page.goto('/');
  await expect(page.locator('#players-list .card-compact')).toHaveCount(22, { timeout: 20_000 });
  await page.evaluate(() => localStorage.removeItem('calciolercio-format'));
  await page.locator('.bottom-nav').getByText('Gioca', { exact: true }).click();
  const g = page.locator('#page-partita');
  await g.locator('button', { hasText: 'Seleziona i primi' }).click();
  await g.locator('button', { hasText: 'Genera squadre bilanciate' }).click();
  return g.locator('#partita-result');
}

test('Senza accesso la partita resta in sola lettura', async ({ page }) => {
  await login(page, null);
  const modal = await openLastMatch(page);
  await expect(modal).toBeVisible();
  await expect(modal.locator('#edit-toggle-btn')).toHaveCount(0);
});

test('Un semplice membro non può modificare', async ({ page }) => {
  await login(page, 'member');
  const modal = await openLastMatch(page);
  await expect(modal).toBeVisible();
  await expect(modal.locator('#edit-toggle-btn')).toHaveCount(0);
});

test('Amministratore: modifica voto, gol e risultato e salva', async ({ page }) => {
  const writes = await login(page);
  const modal = await openLastMatch(page);
  await modal.locator('#edit-toggle-btn').click();
  await expect(modal.locator('#match-actions')).toBeVisible();
  await expect(modal.locator('#edit-toggle-btn')).toHaveCount(0);
  await modal.locator('.rate-stepper input').first().fill('7');
  await noOverflow(page); // in modifica compaiono i pulsanti − e +: a 360 px devono starci
  const goal = modal.locator('.mcnt-row').first().locator('.goal-stepper').first();
  const before = Number((await goal.locator('input').inputValue()) || 0); // il primo giocatore può avere già dei gol
  await goal.locator('.rate-btn-plus').click();
  await expect(goal.locator('input')).toHaveValue(String(before + 1));
  await modal.locator('#sc-a').fill('9');
  await modal.locator('button', { hasText: 'Salva partita' }).click();
  await expect(page.locator('#toast')).toContainText('Salvato:', { timeout: 15_000 });
  const rows = writes.filter((w) => w.table === 'match_players' && w.method === 'PATCH');
  expect(rows.length).toBe(10);
  expect(rows.some((w) => (w.body as { rating: number }).rating === 7 && (w.body as { goals: number }).goals === before + 1)).toBe(true);
  const head = writes.find((w) => w.table === 'matches' && w.method === 'PATCH');
  expect((head?.body as { score_a: number }).score_a).toBe(9);
  await expect(page.locator('#match-modal')).toHaveCount(0); // si chiude da sola
  await noOverflow(page);
});

test('Chi ha gol ma niente voto: avviso e nessuna scrittura', async ({ page }) => {
  const writes = await login(page);
  const modal = await openLastMatch(page);
  await modal.locator('#edit-toggle-btn').click();
  await modal.locator('.rate-stepper input').first().fill('');
  const goal = modal.locator('.mcnt-row').first().locator('.goal-stepper').first();
  await goal.locator('.rate-btn-plus').click();
  await expect(goal).toHaveClass(/goal-warn/);
  await modal.locator('button', { hasText: 'Salva partita' }).click();
  await expect(page.locator('#toast')).toContainText('Metti il voto a:');
  expect(writes.length).toBe(0);
});

test('Pagella: titolo e descrizione dalla finestra, poi salvati', async ({ page }) => {
  const writes = await login(page);
  const modal = await openLastMatch(page);
  await modal.locator('#edit-toggle-btn').click();
  await modal.locator('.rate-stepper input').first().fill('6.5');
  await modal.locator('.pgt-add').first().click();
  const dlg = page.locator('#pgt-dialog');
  await expect(dlg).toBeVisible();
  await dlg.locator('#pgt-d-tit').fill('Il Muro');
  await dlg.locator('#pgt-d-desc').fill('Una *roccia*');
  await expect(dlg.locator('#pgt-d-n')).toHaveText('12');
  await dlg.locator('button', { hasText: 'Fatto' }).click();
  await expect(dlg).toHaveCount(0);
  await modal.locator('button', { hasText: 'Salva partita' }).click();
  await expect(page.locator('#toast')).toContainText('Salvato:', { timeout: 15_000 });
  expect(writes.some((w) => (w.body as { titolo?: string })?.titolo === 'Il Muro' && (w.body as { descrizione?: string }).descrizione === 'Una *roccia*')).toBe(true);
});

test('Elimina partita: chiede conferma e poi cancella', async ({ page }) => {
  const writes = await login(page);
  const modal = await openLastMatch(page);
  await modal.locator('#edit-toggle-btn').click();
  await modal.locator('button[aria-label="Elimina la partita"]').click();
  await expect(page.locator('#app-modal-title')).toHaveText('Eliminare la partita?');
  await page.locator('#app-modal-cancel').click(); // annulla: niente
  expect(writes.length).toBe(0);
  await modal.locator('button[aria-label="Elimina la partita"]').click();
  await page.locator('#app-modal-ok').click();
  await expect(page.locator('#toast')).toContainText('Partita eliminata', { timeout: 15_000 });
  expect(writes.map((w) => `${w.method} ${w.table}`)).toEqual(['DELETE matches']);
});

test('Gioca: Crea partita salva squadre e previsione', async ({ page }) => {
  const writes = await login(page);
  const res = await generateTeams(page);
  await res.locator('button', { hasText: 'Crea partita' }).click();
  const dlg = page.locator('#match-modal');
  await expect(dlg.locator('#match-modal-title')).toHaveText('📅 Nuova partita');
  await expect(dlg).toContainText('1ª proposta');
  await dlg.locator('#nm-scoreA').fill('4');
  await dlg.locator('#nm-scoreB').fill('3');
  await dlg.locator('button', { hasText: 'Crea partita' }).click();
  await expect(page.locator('#toast')).toContainText('Partita creata!', { timeout: 15_000 });
  const m = writes.find((w) => w.table === 'matches') as Write;
  expect(m.method).toBe('POST');
  const body = m.body as { score_a: number; score_b: number; pred_rank: number; pred: number };
  expect([body.score_a, body.score_b, body.pred_rank]).toEqual([4, 3, 1]);
  expect(typeof body.pred).toBe('number');
  const rows = (writes.find((w) => w.table === 'match_players') as Write).body as Array<{ team: string; match_id: string }>;
  expect(rows.length).toBe(10);
  expect(rows.filter((r) => r.team === 'A').length).toBe(5);
  expect(rows.every((r) => r.match_id === 'nuova-partita')).toBe(true);
  await noOverflow(page);
});

test('Gioca: senza accesso Crea partita spiega cosa fare', async ({ page }) => {
  await login(page, null);
  const res = await generateTeams(page);
  await res.locator('button', { hasText: 'Crea partita' }).click();
  await expect(page.locator('#toast')).toContainText("serve l'accesso");
});

test('WhatsApp: si incolla il messaggio, si controllano gli abbinamenti e si assegnano titolo e descrizione', async ({ page }) => {
  const writes = await login(page);
  const modal = await openLastMatch(page);
  await modal.locator('#edit-toggle-btn').click();
  const name = await modal.locator('.rate-stepper').first().evaluate((el) => (el.parentElement?.parentElement?.firstElementChild?.textContent ?? '').trim());
  // senza testo: avviso
  await modal.locator('button', { hasText: 'Analizza il messaggio' }).click();
  await expect(page.locator('#toast')).toContainText('Incolla prima il messaggio');
  await modal.locator('#wa-text').fill(`*BLU 8*\n*${name} 7*\nSempre al posto giusto.\nIL MURO\n`);
  await modal.locator('button', { hasText: 'Analizza il messaggio' }).click();
  const prev = modal.locator('#wa-preview');
  await expect(prev).toContainText('Trovate 1 pagelle');
  await expect(prev.locator('.wa-row')).toHaveCount(1);
  await expect(prev.locator('.wa-row .wa-written')).toContainText(name);
  await expect(prev.locator('.wa-det')).toContainText('IL MURO');
  await prev.locator('button', { hasText: 'Assegna titoli e descrizioni' }).click();
  await expect(page.locator('#toast')).toContainText('assegnati a 1 giocatori');
  await expect(prev.locator('.wa-row')).toHaveCount(0);
  // la pagella è nella scheda del giocatore (ancora da salvare)
  await expect(modal.locator('.pgt-view').first()).toContainText('IL MURO');
  // il giocatore ha già un voto nei dati veri? se no, serve metterlo per salvare
  await modal.locator('.rate-stepper input').first().fill('7');
  await modal.locator('button', { hasText: 'Salva partita' }).click();
  await expect(page.locator('#toast')).toContainText('Salvato:', { timeout: 15_000 });
  expect(writes.some((w) => (w.body as { titolo?: string })?.titolo === 'IL MURO' && /Sempre al posto giusto/.test((w.body as { descrizione?: string }).descrizione ?? ''))).toBe(true);
});

test('WhatsApp: messaggio senza pagelle', async ({ page }) => {
  await login(page);
  const modal = await openLastMatch(page);
  await modal.locator('#edit-toggle-btn').click();
  await modal.locator('#wa-text').fill('Ciao a tutti, stasera si gioca?');
  await modal.locator('button', { hasText: 'Analizza il messaggio' }).click();
  await expect(modal.locator('#wa-preview')).toContainText('Non ho trovato pagelle');
});

// ── Rosa: scheda giocatore modificabile, nuovo giocatore, foto (passo 3.7d) ────────────────────────────────────────────
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function openFirstPlayer(page: Page) {
  await page.goto('/');
  await expect(page.locator('#players-list .card-compact')).toHaveCount(22, { timeout: 20_000 });
  await page.locator('#players-list .card-compact .player-header').first().click();
  return page.locator('#match-modal');
}

test('Rosa: senza accesso la scheda è di sola lettura', async ({ page }) => {
  await login(page, null);
  const modal = await openFirstPlayer(page);
  await expect(modal.locator('.stat-input')).not.toHaveCount(0);
  await expect(modal.locator('input.stat-input')).toHaveCount(0);
  await expect(modal.locator('.role-toggle')).toHaveCount(0);
  await expect(page.getByText('+ Aggiungi giocatore')).toHaveCount(0);
});

test('Rosa: l\'amministratore cambia statistica e ruolo', async ({ page }) => {
  const writes = await login(page);
  const modal = await openFirstPlayer(page);
  await expect(modal.locator('.role-toggle')).toHaveCount(3);
  await expect(modal.locator('input.stat-input')).toHaveCount(11);
  const input = modal.locator('input.stat-input').first();
  await input.fill('9');
  await expect(modal.locator('.mini-bar-fill').first()).toHaveCSS('width', /.+/);
  await expect.poll(() => writes.filter((w) => w.table === 'players' && w.method === 'PATCH').length, { timeout: 10_000 }).toBeGreaterThan(0);
  const stats = (writes.find((w) => w.table === 'players') as Write).body as { stats: number[] };
  expect(stats.stats[0]).toBe(9);
  expect(stats.stats.length).toBe(11);
  // ruoli: si può togliere un ruolo solo se ne resta almeno uno
  const on = modal.locator('.role-toggle[class*="tog-"]');
  const n = await on.count();
  for (let i = 0; i < n + 1; i++) {
    const cur = modal.locator('.role-toggle[class*="tog-"]');
    if ((await cur.count()) === 0) break;
    await cur.first().click();
  }
  await expect(page.locator('#toast')).toContainText('Almeno un ruolo è richiesto');
  expect(await modal.locator('.role-toggle[class*="tog-"]').count()).toBe(1);
  await expect(modal.locator('.photo-edit')).toBeVisible();
  expect((await page.evaluate(() => document.documentElement.scrollWidth)) - (page.viewportSize() as { width: number }).width).toBeLessThanOrEqual(0);
});

test('Rosa: nuova foto, carica e salva', async ({ page }) => {
  const writes = await login(page);
  const modal = await openFirstPlayer(page);
  // se il giocatore ha già una foto si passa dal menu "Cambia"
  const photoEdit = modal.locator('.photo-edit');
  const hasPhoto = await photoEdit.locator('.has-photo').count();
  const chooser = page.waitForEvent('filechooser');
  await photoEdit.click();
  if (hasPhoto) await page.locator('#app-modal button', { hasText: 'Cambia' }).click();
  await (await chooser).setFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('#toast')).toContainText('Foto aggiornata', { timeout: 15_000 });
  expect(writes.some((w) => w.table === 'storage' && w.method === 'POST' && /^photos\/.+\.jpg$/.test(String(w.body)))).toBe(true);
  const upd = writes.find((w) => w.table === 'players' && w.method === 'PATCH') as Write;
  expect((upd.body as { photo_path: string }).photo_path).toMatch(/\.jpg$/);
});

test('Rosa: + Aggiungi giocatore', async ({ page }) => {
  const writes = await login(page);
  await page.goto('/');
  await expect(page.locator('#players-list .card-compact')).toHaveCount(22, { timeout: 20_000 });
  await page.getByText('+ Aggiungi giocatore').click();
  await expect(page.locator('#app-modal-title')).toHaveText('Nuovo giocatore');
  // nome vuoto: avviso
  await page.locator('#app-modal-ok').click();
  await expect(page.locator('#toast')).toContainText('Nome non valido');
  expect(writes.length).toBe(0);
  await page.getByText('+ Aggiungi giocatore').click();
  await page.locator('#app-modal-input').fill('  Marco ');
  await page.locator('#app-modal-ok').click();
  await expect(page.locator('#toast')).toContainText('Giocatore aggiunto', { timeout: 15_000 });
  const p = writes.find((w) => w.table === 'players') as Write;
  expect(p.method).toBe('POST');
  expect(p.body).toEqual({ name: 'Marco', roles: ['MED'], stats: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5] });
  const lp = writes.find((w) => w.table === 'league_players') as Write;
  expect((lp.body as { player_id: string }).player_id).toBe('nuovo-giocatore');
});

test('Gazzetta: senza accesso non ci sono i pulsanti', async ({ page }) => {
  await login(page, null);
  const modal = await openLastMatch(page);
  await expect(modal.locator('#edit-toggle-btn')).toHaveCount(0);
  await expect(modal.locator('.gaz-edit')).toHaveCount(0);
});

test('Gazzetta: carica (file + miniatura) e rimuovi', async ({ page }) => {
  const writes = await login(page);
  const modal = await openLastMatch(page);
  await modal.locator('#edit-toggle-btn').click();
  await expect(modal.locator('.gaz-edit')).toBeVisible();
  const had = await modal.locator('.gaz-thumb').count();
  const chooser = page.waitForEvent('filechooser');
  await modal.locator('.gaz-edit .btn').first().click();
  await (await chooser).setFiles({ name: 'g.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('#toast')).toContainText('Gazzetta salvata', { timeout: 15_000 });
  const files = writes.filter((w) => w.table === 'storage' && w.method === 'POST').map((w) => String(w.body));
  expect(files.some((f) => /^gazzette\/[^/]+\/[^/]+-\d+\.jpg$/.test(f))).toBe(true);
  expect(files.some((f) => /^gazzette\/[^/]+\/[^/]+-\d+-t\.jpg$/.test(f))).toBe(true);
  const row = writes.find((w) => w.table === 'gazzette') as Write;
  expect((row.body as { file_path: string }).file_path).toMatch(/^[^/]+\/[^/]+-\d+\.jpg$/);
  if (had) {
    await modal.locator('.gaz-edit .btn', { hasText: 'Rimuovi' }).click();
    await page.locator('#app-modal-ok').click();
    await expect(page.locator('#toast')).toContainText('Gazzetta rimossa', { timeout: 15_000 });
    expect(writes.some((w) => w.table === 'gazzette' && w.method === 'DELETE')).toBe(true);
  }
  await noOverflow(page);
});
