// Aiuti comuni per le prove sulle schermate di menu, leghe, ruoli e inviti.
// L'accesso è simulato (nessun account vero) e tutte le scritture vengono intercettate e registrate: sul database vero non si scrive niente.
// Tutte le letture usano fixture locali; la lega finta `L2` è vuota salvo i dati impostati dal test.
import { expect, type Locator, type Page, type Route } from '@playwright/test';
import { FakeBackend } from './fakeBackend';

const REF = 'ivrwqpuikbnvnxgvgegd';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const FAKE_JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp: 4102444800 })}.firma`;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
export const json = (r: Route, body: unknown, status = 200) => r.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) });

export interface MockLeague { id: string; name: string; slug: string; is_public: boolean; invite_code: string; owner_id: string | null }
export interface Mine { role: string; leagues: MockLeague }
export interface Write { method: string; table: string; body: unknown }

export const L2: MockLeague = { id: 'L2', name: 'Lega di prova', slug: 'lega-di-prova', is_public: false, invite_code: 'abc12345', owner_id: 'u1' };
export const mineAs = (role: string, over: Partial<MockLeague> = {}): Mine[] => [{ role, leagues: { ...L2, ...over } }];

export interface Opts {
  loggedIn?: boolean;
  /** le mie leghe finte (oltre alla lega pubblica vera) */
  mine?: Mine[];
  /** ruolo che ho in San Marcello (i dati veri di prova); se non detto, membro; `false` = non ne faccio parte */
  publicRole?: 'admin' | 'redazione' | 'member' | false;
  /** risposte delle funzioni del database (nome → corpo); `is_super_admin: true` = amministratore supremo */
  rpc?: Record<string, unknown>;
  /** errori delle funzioni del database (nome → messaggio) */
  rpcError?: Record<string, string>;
  /** il giocatore a cui sono già collegato */
  mePlayer?: { id: string; name: string } | null;
  /** le mie richieste ("missing" = tabella non trovata) */
  claims?: Array<{ player_id: string; league_id: string; status: string; created_at: string; players: { name: string } }> | 'missing';
  profileRows?: unknown[];
  history?: unknown[];
  /** dati di una riga della tabella `players` per la lega finta (guide e simili) */
  l2Players?: Array<{ player_id: string; aliases: string[] }>;
  /** righe del registro attività (le restituisce a pagine, secondo offset e limit); le richieste fatte si annotano in `auditQueries` */
  audit?: unknown[];
  auditQueries?: string[];
}

/** Funzioni del database che solo leggono: non contano come scritture. */
const READ_RPCS = new Set(['my_feature_modes', 'my_premium_status', 'admin_premium_statuses', 'is_super_admin', 'league_member_list', 'admin_requests_list', 'claims_pending', 'league_players_status', 'invite_preview', 'admin_list_leagues', 'admin_list_users', 'admin_league_admins', 'audit_list', 'players_unclaimed', 'player_history']);

const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Prepara l'accesso simulato e le risposte; restituisce l'elenco delle scritture fatte dall'app. */
export async function setup(page: Page, opts: Opts = {}): Promise<Write[]> {
  const { loggedIn = true } = opts;
  const mine: Mine[] = [...(opts.mine ?? [])];
  const writes: Write[] = [];
  const rpc: Record<string, unknown> = { my_feature_modes: ['compare', 'couples', 'records', 'statistics', 'history', 'albo'].map((feature) => ({ feature, mode: 'standard', allowed: true })), my_premium_status: [{ active: false, expires_at: null, trial: false, trial_expires_at: null, lifetime: false }], admin_premium_statuses: [], league_member_list: [], admin_requests_list: [], claims_pending: [], league_players_status: [], players_unclaimed: [], player_history: opts.history ?? [], is_super_admin: false, ...opts.rpc };
  // database finto: le letture vengono da qui (San Marcello con i dati veri di prova, più le leghe finte `mine`); le scritture si registrano soltanto
  const be = new FakeBackend();
  const smRole = opts.publicRole === undefined ? 'member' : opts.publicRole;
  const stamp = '2026-01-01T00:00:00Z';
  if (smRole) {
    be.leagues.push({ id: 'SM', name: 'San Marcello', slug: 'san-marcello', is_public: false, invite_code: 'smsmsmsm', owner_id: null, settings: {}, created_at: stamp });
    be.seedFixtures('SM');
    be.members.push({ league_id: 'SM', user_id: 'u1', role: smRole, joined_at: stamp });
  }
  const addFake = (m: Mine) => {
    be.leagues.push({ ...m.leagues, settings: {}, created_at: stamp });
    be.members.push({ league_id: m.leagues.id, user_id: 'u1', role: m.role, joined_at: '2026-02-01T00:00:00Z' });
  };
  mine.forEach(addFake);
  // caricamenti di file (foto, Gazzette): si registrano e basta
  await page.route('**/storage/v1/object/**', async (r) => {
    const req = r.request();
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET') return r.fallback();
    writes.push({ method: req.method(), table: 'storage', body: new URL(req.url()).pathname.split('/object/')[1] });
    return json(r, { Key: 'ok' });
  });
  // le immagini (Gazzette, foto) sono sempre una piccola immagine finta
  await page.route('**/storage/v1/object/public/**', (r) =>
    r.fulfill({ status: 200, headers: CORS, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') }));
  await page.route('**/storage/v1/object/sign/gazzette/**', (r) =>
    json(r, { signedURL: '/object/public/gazzette/test.jpg?token=fake' }));
  if (loggedIn) {
    await page.addInitScript(([ref, jwt]) => {
      localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
        access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 99999999, expires_at: 4102444800,
        user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: { display_name: 'Luciano' }, created_at: '2026-01-01T00:00:00Z' },
      }));
    }, [REF, FAKE_JWT]);
  }
  await page.route('**/auth/v1/**', (r) => json(r, {}));
  await page.route('**/rest/v1/**', async (r) => {
    const req = r.request();
    const url = new URL(req.url());
    const table = url.pathname.split('/').pop() as string;
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    const q = decodeURIComponent(url.search);
    if (req.method() === 'GET') {
      if (table === 'player_claims') {
        if (opts.claims === 'missing') return json(r, { code: 'PGRST205', message: "Could not find the table 'public.player_claims' in the schema cache" }, 404);
        return json(r, opts.claims ?? []);
      }
      if (table === 'match_players' && q.includes('leagues')) return json(r, opts.profileRows ?? []);
      if (table === 'audit_log') {
        opts.auditQueries?.push(q);
        const off = Number(url.searchParams.get('offset') ?? 0);
        const lim = Number(url.searchParams.get('limit') ?? 1000);
        return json(r, (opts.audit ?? []).slice(off, off + lim));
      }
      if (table === 'player_stats_history') return json(r, opts.history ?? []);
      if (table === 'players' && q.includes('user_id=eq')) return json(r, opts.mePlayer ?? null);
      const out = be.handle('GET', url, null, req.headers(), loggedIn ? 'u1' : null);
      return json(r, out.body, out.status);
    }
    let body: unknown = null;
    try { body = req.postDataJSON(); } catch { /* nessun corpo */ }
    if (!READ_RPCS.has(table)) writes.push({ method: req.method(), table, body });
    if (table in (opts.rpcError ?? {})) return json(r, { code: 'P0001', message: (opts.rpcError as Record<string, string>)[table] }, 400);
    if (table === 'leagues' && req.method() === 'POST') {
      const b = body as { id: string; name: string; is_public: boolean };
      const made: Mine = { role: 'admin', leagues: { id: b.id, name: b.name, slug: slugify(b.name), is_public: false, invite_code: 'abc12345', owner_id: 'u1' } };
      mine.push(made);
      addFake(made);
    }
    if (req.method() === 'POST' && (table === 'matches' || table === 'players')) return json(r, { id: table === 'players' ? 'nuovo-giocatore' : 'nuova-partita' }, 201);
    if (table in rpc) return json(r, rpc[table]);
    if (table === 'create_match_with_teams') return json(r, 'nuova-partita');
    if (table === 'create_player_in_league') return json(r, 'nuovo-giocatore');
    if (table === 'join_league') return json(r, 'L2');
    return r.fulfill({ status: req.method() === 'POST' ? 201 : 204, headers: CORS, contentType: 'application/json', body: '' });
  });
  return writes;
}

/** Un giocatore dei dati di prova (il primo in ordine di nome): id e nome. */
export function fixturePlayer(): { id: string; name: string } {
  const b = new FakeBackend();
  b.seedFixtures('SM');
  const p = [...b.players].sort((x, y) => String(x.name).localeCompare(String(y.name)))[0] as { id: string; name: string };
  return { id: p.id, name: p.name };
}

export const lastWrite = (writes: Write[], table: string): Write => {
  const w = [...writes].reverse().find((x) => x.table === table);
  if (!w) throw new Error(`Nessuna scrittura su "${table}" (viste: ${writes.map((x) => x.table).join(', ') || 'nessuna'})`);
  return w;
};

export const noOverflow = async (page: Page) =>
  expect((await page.evaluate(() => document.documentElement.scrollWidth)) - (page.viewportSize() as { width: number }).width).toBeLessThanOrEqual(0);

/** Apre la pagina (rosa vera: 22 giocatori nella lega pubblica) o l'indirizzo dato. */
export async function openApp(page: Page, path = '/', players = 22) {
  await page.goto(path);
  if (players > 0) {
    const requested = path.match(/\/l\/[^/]+\/([a-z]+)/)?.[1];
    if (!requested) {
      await expect(page.locator('#page-profilo.active #myplayer-card')).toBeVisible({ timeout: 20_000 });
      await page.locator('.bottom-nav').getByRole('button', { name: 'Rosa', exact: true }).click();
    }
    if (!requested || requested === 'rosa') {
      await expect(page.locator('#players-list .card-compact')).toHaveCount(players, { timeout: 20_000 });
      await expect(page.locator('#page-rosa.active')).toBeVisible();
    } else {
      const id = requested === 'gioca' ? 'partita' : requested;
      await expect(page.locator('#page-' + id + '.active')).toBeVisible({ timeout: 20_000 });
    }
  }
}

export async function openMenu(page: Page) {
  await page.locator('#menu-button').click();
  await expect(page.locator('#menu-drawer')).toBeVisible();
}

/** Impostazioni dell'app (versione, formazioni, forma, account): dal menu ☰. */
export async function openSettings(page: Page) {
  await openApp(page);
  await openMenu(page);
  await page.locator('#menu-app-settings').click();
  await expect(page.locator('#page-settings')).toBeVisible();
}

/** Apre una voce del menu (id del bottone) e aspetta il pannello. */
export async function openPanel(page: Page, itemId: string, sheetId: string) {
  await openMenu(page);
  if (['#menu-compare', '#menu-couples', '#menu-albo', '#menu-records'].includes(itemId)) await page.locator('#menu-players').click();
  if (['#menu-create', '#menu-audit', '#menu-platform-leagues', '#menu-platform-users', '#menu-premium', '#menu-game-settings'].includes(itemId) && await page.locator('#menu-superadmin').count()) await page.locator('#menu-superadmin').click();
  if (['#menu-invites', '#menu-claims', '#menu-bench', '#menu-proposals', '#menu-members', '#menu-merge'].includes(itemId)) await page.locator('#menu-league-admin').click();
  await page.locator(itemId).click();
  await expect(page.locator(sheetId)).toBeVisible();
}

/** Apre «Il mio profilo» dal footer (è una pagina, come Rosa e Partite). */
export async function openProfile(page: Page) {
  await page.locator('.bottom-nav').getByRole('button', { name: 'Il mio profilo', exact: true }).click();
  await expect(page.locator('#page-profilo.active')).toBeVisible();
}

/** Il testo di un elemento quando non cambia più (il numero della figurina sale contando per meno di un secondo). */
export async function settledText(locator: Locator): Promise<string> {
  let last = '';
  await expect.poll(async () => {
    const now = await locator.innerText();
    const same = now === last;
    last = now;
    return same;
  }, { intervals: [250] }).toBe(true);
  return last;
}
