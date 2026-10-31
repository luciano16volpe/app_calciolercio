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
  await page.route('**/rest/v1/**', async (r: Route) => {
    const req = r.request();
    const table = new URL(req.url()).pathname.split('/').pop() as string;
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET') {
      if (table === 'league_members') return r.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ role }) });
      const h = { ...req.headers() };
      h.authorization = `Bearer ${h.apikey}`; // le letture pubbliche non devono portare il finto accesso
      return r.continue({ headers: h });
    }
    let body: unknown = null;
    try { body = req.postDataJSON(); } catch { /* nessun corpo */ }
    writes.push({ method: req.method(), table, body });
    const created = req.method() === 'POST' && table === 'matches';
    return r.fulfill({ status: created ? 201 : 204, headers: CORS, contentType: 'application/json', body: created ? JSON.stringify({ id: 'nuova-partita' }) : '' });
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
