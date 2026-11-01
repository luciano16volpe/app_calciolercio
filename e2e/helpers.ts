// Aiuti comuni per le prove sulle schermate di menu, leghe, ruoli e inviti.
// L'accesso è simulato (nessun account vero) e tutte le scritture vengono intercettate e registrate: sul database vero non si scrive niente.
// Le letture della lega pubblica vanno ai dati veri (serve la rete); la lega finta `L2` è sempre vuota.
import { expect, type Page, type Route } from '@playwright/test';

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
  /** ruolo che ho nella lega pubblica vera (San Marcello); senza = nessuno */
  publicRole?: 'admin' | 'redazione' | 'member';
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
}

/** Funzioni del database che solo leggono: non contano come scritture. */
const READ_RPCS = new Set(['is_super_admin', 'league_member_list', 'admin_requests_list', 'claims_pending', 'league_players_status', 'invite_preview', 'admin_list_leagues', 'admin_list_users', 'admin_league_admins', 'audit_list', 'players_unclaimed']);

const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Prepara l'accesso simulato e le risposte; restituisce l'elenco delle scritture fatte dall'app. */
export async function setup(page: Page, opts: Opts = {}): Promise<Write[]> {
  const { loggedIn = true } = opts;
  const mine: Mine[] = [...(opts.mine ?? [])];
  const writes: Write[] = [];
  const rpc: Record<string, unknown> = { league_member_list: [], admin_requests_list: [], claims_pending: [], league_players_status: [], is_super_admin: false, ...opts.rpc };
  let pub: MockLeague | null = null;
  if (loggedIn) {
    await page.addInitScript(([ref, jwt]) => {
      localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
        access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 99999999, expires_at: 4102444800,
        user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: { display_name: 'Luciano' }, created_at: '2026-01-01T00:00:00Z' },
      }));
    }, [REF, FAKE_JWT]);
  }
  // la lega pubblica vera si legge dalla risposta (serve per dare un ruolo finto al suo interno)
  page.on('response', (resp) => {
    const u = resp.url();
    if (!u.includes('/rest/v1/leagues?') || !decodeURIComponent(u).includes('is_public=eq.true')) return;
    resp.json().then((rows: MockLeague[]) => { pub = rows[0] ?? pub; }, () => undefined);
  });
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
      if (table === 'player_stats_history') return json(r, opts.history ?? []);
      if (table === 'players' && q.includes('user_id=eq')) return json(r, opts.mePlayer ?? null);
      if (table === 'league_members') {
        if (q.includes('leagues(')) {
          const all = [...mine];
          if (opts.publicRole && pub) all.push({ role: opts.publicRole, leagues: pub });
          return json(r, all);
        }
        const hit = mine.find((m) => q.includes(`league_id=eq.${m.leagues.id}`));
        if (hit) return json(r, { role: hit.role });
        if (opts.publicRole && pub && q.includes(`league_id=eq.${pub.id}`)) return json(r, { role: opts.publicRole });
        return json(r, null);
      }
      if (table === 'leagues') {
        const bySlug = mine.find((m) => q.includes(`slug=eq.${m.leagues.slug}`));
        if (bySlug) return json(r, bySlug.leagues);
      }
      if (q.includes('L2')) return json(r, table === 'league_players' ? (opts.l2Players ?? []) : []);
      const h = { ...req.headers() };
      h.authorization = `Bearer ${h.apikey}`;
      return r.continue({ headers: h });
    }
    let body: unknown = null;
    try { body = req.postDataJSON(); } catch { /* nessun corpo */ }
    if (!READ_RPCS.has(table)) writes.push({ method: req.method(), table, body });
    if (table in (opts.rpcError ?? {})) return json(r, { code: 'P0001', message: (opts.rpcError as Record<string, string>)[table] }, 400);
    if (table === 'leagues' && req.method() === 'POST') {
      const b = body as { id: string; name: string; is_public: boolean };
      mine.push({ role: 'admin', leagues: { id: b.id, name: b.name, slug: slugify(b.name), is_public: b.is_public, invite_code: 'abc12345', owner_id: 'u1' } });
    }
    if (table in rpc) return json(r, rpc[table]);
    if (table === 'join_league') return json(r, 'L2');
    return r.fulfill({ status: req.method() === 'POST' ? 201 : 204, headers: CORS, contentType: 'application/json', body: '' });
  });
  return writes;
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
  if (players > 0) await expect(page.locator('#players-list .card-compact')).toHaveCount(players, { timeout: 20_000 });
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
  await page.locator(itemId).click();
  await expect(page.locator(sheetId)).toBeVisible();
}
