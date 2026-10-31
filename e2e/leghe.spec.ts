// Leghe (passo 4.1): cambio lega, creare una lega, entrare con il codice, codice d'invito, uscire.
// Nessuna scrittura vera: l'accesso è simulato e le scritture vengono intercettate e registrate.
import { expect, test, type Page, type Route } from '@playwright/test';

const REF = 'ivrwqpuikbnvnxgvgegd';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const FAKE_JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp: 4102444800 })}.firma`;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const json = (r: Route, body: unknown, status = 200) => r.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) });

interface Write { method: string; table: string; body: unknown }
interface Opts {
  loggedIn?: boolean;
  mine?: Array<{ role: string; leagues: { id: string; name: string; is_public: boolean; invite_code: string } }>;
  /** elenco dei membri restituito dal database ('missing' = migrazione non ancora applicata) */
  members?: Array<{ user_id: string; role: string; display_name: string | null; email: string | null; joined_at: string }> | 'missing';
  failRole?: boolean;
  /** il giocatore a cui sono già collegato */
  mePlayer?: { id: string; name: string } | null;
  /** le mie richieste ("missing" = migrazione 4.3 non applicata) */
  claims?: Array<{ player_id: string; league_id: string; status: string; created_at: string; players: { name: string } }> | 'missing';
  /** richieste in attesa viste dall'amministratore */
  pendingClaims?: Array<{ id: string; player_id: string; player_name: string; user_id: string; display_name: string | null; email: string | null; created_at: string }>;
}

/** Accesso simulato; le letture vanno ai dati veri, tranne le leghe "mie" e la lega finta `L2` (vuota) se presente in `mine`. */
async function setup(page: Page, opts: Opts = {}) {
  const { loggedIn = true, mine = [], members = [] } = opts;
  const writes: Write[] = [];
  if (loggedIn) {
    await page.addInitScript(([ref, jwt]) => {
      localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
        access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 99999999, expires_at: 4102444800,
        user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
      }));
    }, [REF, FAKE_JWT]);
  }
  await page.route('**/auth/v1/**', (r) => json(r, {}));
  await page.route('**/rest/v1/**', async (r) => {
    const req = r.request();
    const url = new URL(req.url());
    const table = url.pathname.split('/').pop() as string;
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET') {
      if (table === 'player_claims') {
        if (opts.claims === 'missing') return json(r, { code: 'PGRST205', message: "Could not find the table 'public.player_claims' in the schema cache" }, 404);
        return json(r, opts.claims ?? []);
      }
      if (table === 'players' && url.search.includes('user_id=eq')) return json(r, opts.mePlayer ?? null);
      const fake = url.search.includes('L2');
      if (table === 'league_members') {
        if (url.search.includes('leagues')) return json(r, mine);
        return json(r, { role: mine[0]?.role ?? null });
      }
      if (table === 'leagues' && fake) return json(r, mine[0]?.leagues ?? null);
      if (fake || (mine.length && ['league_players', 'matches', 'albo'].includes(table) && url.search.includes('L2'))) return json(r, []);
      const h = { ...req.headers() };
      h.authorization = `Bearer ${h.apikey}`;
      return r.continue({ headers: h });
    }
    let body: unknown = null;
    try { body = req.postDataJSON(); } catch { /* nessun corpo */ }
    if (table === 'league_member_list') {
      if (members === 'missing') return json(r, { code: 'PGRST202', message: 'Could not find the function public.league_member_list(l) in the schema cache' }, 404);
      return json(r, members);
    }
    if (table === 'claims_pending') return json(r, opts.pendingClaims ?? []);
    writes.push({ method: req.method(), table, body });
    if (table === 'set_member_role' && opts.failRole) return json(r, { code: 'P0001', message: 'Deve restare almeno un amministratore' }, 400);
    if (table === 'join_league') return json(r, 'L2');
    return r.fulfill({ status: req.method() === 'POST' ? 201 : 204, headers: CORS, contentType: 'application/json', body: '' });
  });
  return writes;
}

async function openSettings(page: Page) {
  await page.goto('/');
  await expect(page.locator('#players-list .card-compact')).toHaveCount(22, { timeout: 20_000 });
  await page.locator('header .logo').click();
  await expect(page.locator('#leagues-card')).toBeVisible();
}
const noOverflow = async (page: Page) =>
  expect((await page.evaluate(() => document.documentElement.scrollWidth)) - (page.viewportSize() as { width: number }).width).toBeLessThanOrEqual(0);

test('Leghe: senza accesso si vede la lega pubblica e non si può creare', async ({ page }) => {
  await setup(page, { loggedIn: false });
  await openSettings(page);
  await expect(page.locator('.league-row')).toHaveCount(1);
  await expect(page.locator('.league-row').first()).toContainText('Pubblica');
  await expect(page.locator('#league-create')).toHaveCount(0);
  await expect(page.locator('#invite-box')).toHaveCount(0);
  await noOverflow(page);
});

test('Leghe: crea una lega', async ({ page }) => {
  const writes = await setup(page);
  await openSettings(page);
  await page.locator('#league-create').click();
  await page.locator('#app-modal-ok').click();
  await expect(page.locator('#toast')).toContainText('Nome non valido');
  await page.locator('#league-create').click();
  await page.locator('#app-modal-input').fill('  Calcetto del giovedì ');
  await page.locator('#app-modal-ok').click();
  await expect(page.locator('#toast')).toContainText('Lega creata', { timeout: 15_000 });
  const w = writes.find((x) => x.table === 'leagues') as Write;
  expect(w.method).toBe('POST');
  const body = w.body as { id: string; name: string };
  expect(body.name).toBe('Calcetto del giovedì');
  expect(await page.evaluate(() => localStorage.getItem('calciolercio-league'))).toBe(body.id);
});

test('Leghe: entra con il codice', async ({ page }) => {
  const writes = await setup(page);
  await openSettings(page);
  await page.locator('#league-join').click();
  await page.locator('#app-modal-input').fill(' abc12345 ');
  await page.locator('#app-modal-ok').click();
  await expect(page.locator('#toast')).toContainText('Sei dentro la lega', { timeout: 15_000 });
  expect((writes.find((x) => x.table === 'join_league') as Write).body).toEqual({ code: 'abc12345' });
});

test('Leghe: cambia lega (vuota), codice d\'invito per l\'amministratore, esci', async ({ page }) => {
  const mine = [{ role: 'admin', leagues: { id: 'L2', name: 'Lega di prova', is_public: false, invite_code: 'abc12345' } }];
  const writes = await setup(page, { mine });
  await openSettings(page);
  await expect(page.locator('.league-row')).toHaveCount(2);
  await page.locator('.league-pick', { hasText: 'Lega di prova' }).click();
  await expect(page.locator('.league-pick[aria-pressed="true"]')).toContainText('Lega di prova');
  await expect(page.locator('#invite-code')).toHaveText('abc12345');
  expect(await page.evaluate(() => localStorage.getItem('calciolercio-league'))).toBe('L2');
  // una lega senza giocatori né partite non rompe le schermate
  for (const tab of ['Rosa', 'Gioca', 'Partite', 'Classifiche']) {
    await page.locator('.bottom-nav').getByText(tab, { exact: true }).click();
    await expect(page.getByText('Non riesco a caricare i dati')).toHaveCount(0);
  }
  await page.locator('header .logo').click();
  await page.getByRole('button', { name: 'Esci da Lega di prova' }).click();
  await page.locator('#app-modal-ok').click();
  await expect(page.locator('#toast')).toContainText('Sei uscito dalla lega', { timeout: 15_000 });
  expect(writes.some((x) => x.table === 'league_members' && x.method === 'DELETE')).toBe(true);
  await noOverflow(page);
});

const MINE_ADMIN = [{ role: 'admin', leagues: { id: 'L2', name: 'Lega di prova', is_public: false, invite_code: 'abc12345' } }];
const MEMBERS = [
  { user_id: 'u1', role: 'admin', display_name: 'Luciano', email: 'admin@example.com', joined_at: '2026-01-01' },
  { user_id: 'u2', role: 'member', display_name: 'Marco', email: 'marco@example.com', joined_at: '2026-01-02' },
];

test('Membri: l\'amministratore vede la lista, cambia ruolo e toglie un membro', async ({ page }) => {
  const writes = await setup(page, { mine: MINE_ADMIN, members: MEMBERS });
  await openSettings(page);
  await page.locator('.league-pick', { hasText: 'Lega di prova' }).click();
  await expect(page.locator('#members-card')).toBeVisible();
  await expect(page.locator('.member-row')).toHaveCount(2);
  await expect(page.locator('.member-row').first()).toContainText('(tu)');
  await page.getByLabel('Ruolo di Marco').selectOption('redazione');
  await expect(page.locator('#toast')).toContainText('Ruolo cambiato');
  expect((writes.find((x) => x.table === 'set_member_role') as Write).body).toEqual({ l: 'L2', u: 'u2', r: 'redazione' });
  await expect(page.getByRole('button', { name: 'Togli Luciano' })).toHaveCount(0); // non ci si toglie da soli da qui
  await page.getByRole('button', { name: 'Togli Marco' }).click();
  await page.locator('#app-modal-ok').click();
  await expect(page.locator('#toast')).toContainText('Membro tolto');
  expect((writes.find((x) => x.table === 'remove_member') as Write).body).toEqual({ l: 'L2', u: 'u2' });
  await noOverflow(page);
});

test('Membri: l\'ultimo amministratore non si può declassare (errore del database mostrato)', async ({ page }) => {
  await setup(page, { mine: MINE_ADMIN, members: MEMBERS, failRole: true });
  await openSettings(page);
  await page.locator('.league-pick', { hasText: 'Lega di prova' }).click();
  await page.getByLabel('Ruolo di Luciano').selectOption('member');
  await expect(page.locator('#toast')).toContainText('Deve restare almeno un amministratore');
});

test('Membri: se la migrazione manca si spiega cosa fare', async ({ page }) => {
  await setup(page, { mine: MINE_ADMIN, members: 'missing' });
  await openSettings(page);
  await page.locator('.league-pick', { hasText: 'Lega di prova' }).click();
  await expect(page.locator('#members-error')).toContainText('20261101000000_membri.sql');
});

test('Questo sono io: scelgo il mio nome e mando la richiesta', async ({ page }) => {
  const writes = await setup(page);
  await openSettings(page);
  await expect(page.locator('#myplayer-card')).toBeVisible();
  await page.locator('#myplayer-send').click();
  await expect(page.locator('#toast')).toContainText('Scegli il tuo nome');
  expect(writes.length).toBe(0);
  expect(await page.locator('#myplayer-select option').count()).toBeGreaterThan(20); // rosa vera: 22 + "scegli"
  await page.locator('#myplayer-select').selectOption({ index: 1 });
  await page.locator('#myplayer-send').click();
  await expect(page.locator('#toast')).toContainText('Richiesta inviata');
  const w = writes.find((x) => x.table === 'request_claim') as Write;
  expect(Object.keys(w.body as object).sort()).toEqual(['l', 'p']);
  await noOverflow(page);
});

test('Questo sono io: richiesta in attesa, già collegato e scollega', async ({ page }) => {
  await setup(page, { claims: [{ player_id: 'p1', league_id: 'x', status: 'pending', created_at: '2026-11-01', players: { name: 'Marco' } }] });
  await openSettings(page);
  await expect(page.locator('#myplayer-pending')).toContainText('Marco');
  await expect(page.locator('#myplayer-select')).toHaveCount(0);
});

test('Questo sono io: collegato, si può scollegare', async ({ page }) => {
  const writes = await setup(page, { mePlayer: { id: 'p1', name: 'Marco' } });
  await openSettings(page);
  await expect(page.locator('#myplayer-name')).toHaveText('Marco');
  await page.getByRole('button', { name: 'Scollega' }).click();
  await page.locator('#app-modal-ok').click();
  await expect(page.locator('#toast')).toContainText('Scollegato');
  expect(writes.some((x) => x.table === 'unlink_me')).toBe(true);
});

test('Questo sono io: se la migrazione manca si spiega cosa fare', async ({ page }) => {
  await setup(page, { claims: 'missing' });
  await openSettings(page);
  await expect(page.locator('#myplayer-error')).toContainText('20261102000000_questo_sono_io.sql');
});

test('Questo sono io: l\'amministratore conferma e rifiuta', async ({ page }) => {
  const pendingClaims = [
    { id: 'c1', player_id: 'p1', player_name: 'Marco', user_id: 'u2', display_name: 'Marchino', email: 'm@example.com', created_at: '2026-11-01' },
    { id: 'c2', player_id: 'p2', player_name: 'Luca', user_id: 'u3', display_name: null, email: 'l@example.com', created_at: '2026-11-02' },
  ];
  const writes = await setup(page, { mine: MINE_ADMIN, members: MEMBERS, pendingClaims });
  await openSettings(page);
  await page.locator('.league-pick', { hasText: 'Lega di prova' }).click();
  await expect(page.locator('.claim-row')).toHaveCount(2);
  await expect(page.locator('.claim-row').first()).toContainText('Marchino dice di essere Marco');
  await expect(page.locator('.claim-row').nth(1)).toContainText('l@example.com');
  await page.getByRole('button', { name: 'Conferma Marchino come Marco' }).click();
  await expect(page.locator('#toast')).toContainText('Marchino è ora Marco');
  expect((writes.find((x) => x.table === 'review_claim') as Write).body).toEqual({ c: 'c1', approve: true });
  await page.getByRole('button', { name: 'Rifiuta l@example.com' }).click();
  await expect(page.locator('#toast')).toContainText('Richiesta rifiutata');
  expect(writes.filter((x) => x.table === 'review_claim')[1]?.body).toEqual({ c: 'c2', approve: false });
});

test('Membri: chi non è amministratore non vede la scheda', async ({ page }) => {
  await setup(page, { mine: [{ role: 'member', leagues: { id: 'L2', name: 'Lega di prova', is_public: false, invite_code: 'abc12345' } }] });
  await openSettings(page);
  await page.locator('.league-pick', { hasText: 'Lega di prova' }).click();
  await expect(page.locator('.league-pick[aria-pressed="true"]')).toContainText('Lega di prova');
  await expect(page.locator('#members-card')).toHaveCount(0);
  await expect(page.locator('#invite-box')).toHaveCount(0);
});
