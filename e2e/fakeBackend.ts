// Un piccolo «database finto» in memoria, condiviso da più utenti (ognuno in un telefono emulato diverso), per provare un percorso
// completo senza toccare il database vero. Imita solo quello che serve allo scenario (leghe, ruoli, inviti, pagelle, registro attività)
// con le stesse regole di permesso. I permessi veri del database si provano in supabase/tests/*.sql.
import type { BrowserContext, Route } from '@playwright/test';

type Row = Record<string, unknown>;
export interface Audit extends Row { id: number; at: string; action: string; actor_id: string | null; actor_name: string | null }
interface Reply { status: number; body: unknown }

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const REF = 'ivrwqpuikbnvnxgvgegd';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const uid = () => crypto.randomUUID();
const err = (status: number, message: string, code = '42501'): Reply => ({ status, body: { code, message } });
const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const fakeJwt = (sub: string) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', exp: 4102444800 })}.firma`;

export class FakeBackend {
  users: Row[] = [];
  leagues: Row[] = [];
  members: Row[] = [];
  players: Row[] = [];
  lplayers: Row[] = [];
  matches: Row[] = [];
  mplayers: Row[] = [];
  invites: Row[] = [];
  requests: Row[] = [];
  supers = new Set<string>();
  audit: Audit[] = [];
  private tx = 100;
  private aid = 0;

  constructor() {
    // la lega pubblica (senza di lei l'app non trova niente da mostrare a chi non ha accesso)
    this.leagues.push({ id: 'pub', name: 'Lega pubblica', slug: 'lega-pubblica', is_public: true, invite_code: 'pubpubpu', owner_id: null, settings: {}, created_at: '2026-01-01' });
  }

  addUser(id: string, email: string, name: string): string {
    this.users.push({ id, email, display_name: name });
    return id;
  }
  userName = (id: string | null): string => String((this.users.find((u) => u.id === id)?.display_name as string) ?? '');
  private league = (id: string) => this.leagues.find((l) => l.id === id);
  private role = (lid: string, u: string | null) => (this.members.find((m) => m.league_id === lid && m.user_id === u)?.role as string | undefined) ?? null;
  private isAdmin = (lid: string, u: string | null) => this.role(lid, u) === 'admin';
  private visible = (l: Row, u: string | null) => l.is_public === true || this.role(l.id as string, u) !== null;
  private playerName = (id: string) => String((this.players.find((p) => p.id === id)?.name as string) ?? '?');
  private matchLabel = (id: string) => `partita del ${String(this.matches.find((m) => m.id === id)?.date ?? '').split('-').reverse().join('/')}`;

  /** Segna una riga nel registro, come farebbero i trigger del database. */
  private log(actor: string | null, action: string, entity: string, label: string, grp: string, leagueId: string | null, changes: unknown, ua = 'Scenario/1.0') {
    this.audit.unshift({
      id: ++this.aid, at: new Date().toISOString(), actor_id: actor, actor_name: actor ? this.userName(actor) : null, action, entity, entity_id: null, entity_label: label,
      league_id: leagueId, league_name: leagueId ? String(this.league(leagueId)?.name ?? '') : null, grp, tx: this.tx, changes, source: actor ? 'app' : 'sistema', ip: '203.0.113.50', user_agent: ua,
    });
  }

  // ── preparazione di dati (come se fossero già lì) ────────────────────────
  /** Giocatori e una partita già giocata con le pagelle (voti), nella lega indicata. */
  seedMatch(leagueId: string, blue: string[], white: string[], date: string): string {
    const ids = (names: string[]) => names.map((n) => {
      let p = this.players.find((x) => x.name === n && this.lplayers.some((lp) => lp.league_id === leagueId && lp.player_id === x.id));
      if (!p) {
        p = { id: uid(), name: n, roles: ['MED'], stats: Array(11).fill(5), photo_path: null, user_id: null };
        this.players.push(p);
        this.lplayers.push({ league_id: leagueId, player_id: p.id, aliases: [], archived: false });
      }
      return p.id as string;
    });
    const a = ids(blue);
    const b = ids(white);
    const mid = uid();
    this.matches.push({ id: mid, league_id: leagueId, date, notes: null, score_a: null, score_b: null, pred: null, pred_rank: null });
    [...a.map((p, i) => [p, 'A', i]), ...b.map((p, i) => [p, 'B', i])].forEach(([p, t, i]) =>
      this.mplayers.push({ match_id: mid, player_id: p, team: t, position: i, rating: 6, goals: 0, assist: 0, autogol: 0, meta: 0, rigori_sbagliati: 0, titolo: null, descrizione: null }));
    return mid;
  }

  // ── lettura (GET) ────────────────────────────────────────────────────────
  private table(name: string): Row[] {
    const t: Record<string, Row[]> = { leagues: this.leagues, league_members: this.members, players: this.players, league_players: this.lplayers, matches: this.matches, match_players: this.mplayers, audit_log: this.audit, albo: [], gazzette: [], app_settings: [], player_claims: [] };
    return t[name] ?? [];
  }
  private matchesFilter(row: Row, key: string, expr: string): boolean {
    const val = row[key];
    const [op, ...rest] = expr.split('.');
    const arg = rest.join('.');
    if (op === 'eq') return String(val) === arg;
    if (op === 'neq') return String(val) !== arg;
    if (op === 'is') return arg === 'null' ? val === null || val === undefined : String(val) === arg;
    if (op === 'in') return arg.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')).includes(String(val));
    if (op === 'gte') return String(val) >= arg;
    if (op === 'lt') return String(val) < arg;
    return true;
  }
  private embed(row: Row, select: string): Row {
    const out: Row = { ...row };
    const re = /(\w+)\(([^()]*(?:\([^()]*\))?[^()]*)\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(select))) {
      const rel = m[1] as string;
      const target = rel === 'leagues' ? this.league(String(row.league_id)) : rel === 'matches' ? this.matches.find((x) => x.id === row.match_id) : rel === 'players' ? this.players.find((x) => x.id === row.player_id) : undefined;
      out[rel] = target ? this.embed(target, m[2] as string) : null;
    }
    return out;
  }
  private get(name: string, q: URLSearchParams, actor: string | null, single: boolean): Reply {
    let rows = this.table(name);
    if (name === 'leagues') rows = rows.filter((l) => this.visible(l, actor));
    if (name === 'league_members') rows = rows.filter((m) => m.user_id === actor || this.role(m.league_id as string, actor) !== null);
    if (name === 'audit_log' && !(actor && this.supers.has(actor))) rows = [];
    for (const [k, v] of q) {
      if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
      rows = rows.filter((r) => this.matchesFilter(r, k, v));
    }
    const order = q.get('order');
    if (order) {
      const [col, dir] = order.split(',')[0]!.split('.');
      rows = [...rows].sort((a, b) => (String(a[col as string]) < String(b[col as string]) ? -1 : String(a[col as string]) > String(b[col as string]) ? 1 : 0) * (dir === 'desc' ? -1 : 1));
    }
    const off = Number(q.get('offset') ?? 0);
    const lim = Number(q.get('limit') ?? 1000);
    rows = rows.slice(off, off + lim);
    const sel = q.get('select') ?? '*';
    const out = rows.map((r) => this.embed(r, sel));
    return single ? (out[0] ? { status: 200, body: out[0] } : err(406, 'JSON object requested, multiple (or no) rows returned', 'PGRST116')) : { status: 200, body: out };
  }

  // ── scrittura (POST/PATCH/DELETE su tabelle) ─────────────────────────────
  private write(method: string, name: string, q: URLSearchParams, body: unknown, actor: string | null, ua: string, single: boolean): Reply {
    if (!actor) return err(401, 'Devi prima accedere');
    const arr = (Array.isArray(body) ? body : [body]) as Row[];
    if (method === 'POST' && name === 'leagues') {
      for (const b of arr) {
        const l = { id: b.id ?? uid(), name: b.name, slug: slugify(String(b.name)), is_public: !!b.is_public, invite_code: uid().slice(0, 8), owner_id: actor, settings: b.settings ?? {}, created_at: new Date().toISOString() };
        this.leagues.push(l);
        this.members.push({ league_id: l.id, user_id: actor, role: 'admin', joined_at: new Date().toISOString() });
        this.log(actor, 'leagues.insert', 'leagues', String(l.name), 'leghe', l.id as string, l, ua);
        this.log(actor, 'league_members.insert', 'league_members', this.userName(actor), 'leghe', l.id as string, { role: 'admin' }, ua);
      }
      return { status: 201, body: null };
    }
    if (method === 'POST' && name === 'players') {
      if (!this.members.some((m) => m.user_id === actor && m.role === 'admin')) return err(403, 'new row violates row-level security policy for table "players"');
      const p = { id: uid(), name: arr[0]!.name, roles: arr[0]!.roles ?? ['MED'], stats: arr[0]!.stats ?? Array(11).fill(5), photo_path: null, user_id: null, created_by: actor };
      this.players.push(p);
      this.log(actor, 'players.insert', 'players', String(p.name), 'giocatori', null, { name: p.name }, ua);
      return { status: 201, body: single ? { id: p.id } : [{ id: p.id }] };
    }
    if (method === 'POST' && name === 'league_players') {
      for (const b of arr) {
        if (!this.isAdmin(String(b.league_id), actor)) return err(403, 'new row violates row-level security policy for table "league_players"');
        this.lplayers.push({ league_id: b.league_id, player_id: b.player_id, aliases: [], archived: false });
        this.log(actor, 'league_players.insert', 'league_players', this.playerName(String(b.player_id)), 'giocatori', b.league_id as string, null, ua);
      }
      return { status: 201, body: null };
    }
    if (method === 'PATCH' && name === 'match_players') {
      const rows = this.mplayers.filter((r) => [...q].every(([k, v]) => ['select'].includes(k) || this.matchesFilter(r, k, v)));
      for (const r of rows) {
        const lid = String(this.matches.find((m) => m.id === r.match_id)?.league_id);
        const patch = body as Row;
        const role = this.role(lid, actor);
        const onlyText = Object.keys(patch).every((k) => k === 'titolo' || k === 'descrizione');
        if (role !== 'admin' && !(role === 'redazione' && onlyText)) return err(403, 'Permesso negato: la redazione può modificare solo titolo e descrizione', 'P0001');
        const ch: Row = {};
        for (const [k, v] of Object.entries(patch)) if (r[k] !== v) { ch[k] = [r[k] ?? null, v ?? null]; r[k] = v; }
        if (Object.keys(ch).length) this.log(actor, 'match_players.update', 'match_players', `${this.playerName(String(r.player_id))} · ${this.matchLabel(String(r.match_id))}`, 'partite', lid, ch, ua);
      }
      return { status: 204, body: null };
    }
    if (method === 'PATCH' && name === 'matches') {
      for (const r of this.matches.filter((x) => [...q].every(([k, v]) => this.matchesFilter(x, k, v)))) {
        if (!this.isAdmin(String(r.league_id), actor)) return err(403, 'Permesso negato');
        const ch: Row = {};
        for (const [k, v] of Object.entries(body as Row)) if ((r[k] ?? null) !== (v ?? null)) { ch[k] = [r[k] ?? null, v ?? null]; r[k] = v; }
        if (Object.keys(ch).length) this.log(actor, 'matches.update', 'matches', this.matchLabel(String(r.id)), 'partite', r.league_id as string, ch, ua);
      }
      return { status: 204, body: null };
    }
    if (method === 'DELETE' && name === 'league_members') return { status: 204, body: null };
    return err(404, `Il database finto non gestisce ${method} ${name}`, 'FAKE');
  }

  // ── funzioni (rpc) ───────────────────────────────────────────────────────
  private rpc(fn: string, a: Row, actor: string | null, ua: string): Reply {
    const need = (): Reply | null => (actor ? null : err(401, 'Devi prima accedere'));
    const l = a.l as string;
    switch (fn) {
      case 'is_super_admin': return { status: 200, body: !!actor && this.supers.has(actor) };
      case 'log_event': return { status: 200, body: null };
      case 'player_history': return { status: 200, body: [] };
      case 'claims_pending': return { status: 200, body: [] };
      case 'players_unclaimed': return { status: 200, body: this.lplayers.filter((lp) => lp.league_id === l).map((lp) => this.players.find((p) => p.id === lp.player_id)!).filter((p) => !p.user_id).map((p) => ({ player_id: p.id, name: p.name })) };
      case 'join_league': {
        const e = need(); if (e) return e;
        const lg = this.leagues.find((x) => x.invite_code === String(a.code).trim());
        if (!lg) return err(400, 'Codice non valido', 'P0001');
        const id = lg.id as string;
        if (!this.role(id, actor)) {
          this.members.push({ league_id: id, user_id: actor, role: 'member', joined_at: new Date().toISOString() });
          this.log(actor, 'league_members.insert', 'league_members', this.userName(actor), 'leghe', id, { role: 'member' }, ua);
          // chi entra porta con sé il suo giocatore (niente doppioni)
          const mine = this.players.find((p) => p.user_id === actor);
          if (mine && !this.lplayers.some((lp) => lp.league_id === id && lp.player_id === mine.id)) {
            this.lplayers.push({ league_id: id, player_id: mine.id, aliases: [], archived: false });
            this.log(actor, 'league_players.insert', 'league_players', String(mine.name), 'giocatori', id, null, ua);
          }
        }
        return { status: 200, body: id };
      }
      case 'league_member_list': {
        if (!this.isAdmin(l, actor)) return err(400, 'Permesso negato: solo l’amministratore vede i membri', 'P0001');
        const owner = this.league(l)?.owner_id;
        return { status: 200, body: this.members.filter((m) => m.league_id === l).map((m) => ({
          user_id: m.user_id, role: m.role, display_name: this.userName(m.user_id as string), email: this.users.find((u) => u.id === m.user_id)?.email, joined_at: m.joined_at,
          is_owner: m.user_id === owner, admin_request_id: this.requests.find((r) => r.league_id === l && r.user_id === m.user_id && r.status === 'pending')?.id ?? null })) };
      }
      case 'set_member_role': {
        const owner = this.league(l)?.owner_id;
        if (!this.isAdmin(l, actor)) return err(400, 'Permesso negato: solo l’amministratore cambia i ruoli', 'P0001');
        if (a.r === 'admin' && actor !== owner) return err(400, 'Solo il creatore della lega può nominare un amministratore: puoi proporlo', 'P0001');
        const m = this.members.find((x) => x.league_id === l && x.user_id === a.u)!;
        const old = m.role;
        if (old !== a.r) { m.role = a.r; this.log(actor, 'league_members.role', 'league_members', this.userName(a.u as string), 'leghe', l, { role: [old, a.r] }, ua); }
        return { status: 200, body: null };
      }
      case 'propose_admin': {
        const owner = this.league(l)?.owner_id;
        if (!this.isAdmin(l, actor)) return err(400, 'Permesso negato: solo un amministratore può proporre', 'P0001');
        if (owner === actor) return err(400, 'Sei il creatore: puoi nominare direttamente l’amministratore', 'P0001');
        const r = { id: uid(), league_id: l, user_id: a.u, requested_by: actor, status: 'pending' };
        this.requests.push(r);
        this.log(actor, 'league_admin_requests.propose', 'league_admin_requests', this.userName(a.u as string), 'leghe', l, null, ua);
        return { status: 200, body: r.id };
      }
      case 'admin_requests_list': {
        if (!this.isAdmin(l, actor)) return err(400, 'Permesso negato', 'P0001');
        return { status: 200, body: this.requests.filter((r) => r.league_id === l && r.status === 'pending').map((r) => ({ id: r.id, user_id: r.user_id, display_name: this.userName(r.user_id as string), email: null, requested_by_name: this.userName(r.requested_by as string), created_at: '2026-11-01' })) };
      }
      case 'decide_admin_request': {
        const r = this.requests.find((x) => x.id === a.c);
        if (!r) return err(400, 'Proposta non trovata', 'P0001');
        if (this.league(r.league_id as string)?.owner_id !== actor) return err(400, 'Permesso negato: solo il creatore della lega decide', 'P0001');
        r.status = a.approve ? 'approved' : 'rejected';
        this.log(actor, `league_admin_requests.${String(r.status)}`, 'league_admin_requests', this.userName(r.user_id as string), 'leghe', r.league_id as string, null, ua);
        if (a.approve) {
          const m = this.members.find((x) => x.league_id === r.league_id && x.user_id === r.user_id)!;
          const old = m.role; m.role = 'admin';
          this.log(actor, 'league_members.role', 'league_members', this.userName(r.user_id as string), 'leghe', r.league_id as string, { role: [old, 'admin'] }, ua);
        }
        return { status: 200, body: null };
      }
      case 'create_player_invite': {
        if (!this.isAdmin(a.l as string, actor)) return err(400, 'Permesso negato: solo l’amministratore crea gli inviti', 'P0001');
        const inv = { token: uid().replace(/-/g, ''), player_id: a.p, league_id: a.l, revoked: false, used_at: null, expires_at: '2099-01-01', created_at: new Date().toISOString() };
        this.invites.forEach((i) => { if (i.player_id === a.p && i.league_id === a.l && !i.used_at) i.revoked = true; });
        this.invites.push(inv);
        this.log(actor, 'player_invites.create', 'player_invites', this.playerName(String(a.p)), 'account', a.l as string, null, ua);
        return { status: 200, body: inv.token };
      }
      case 'league_players_status': {
        if (!this.isAdmin(l, actor)) return err(400, 'Permesso negato', 'P0001');
        return { status: 200, body: this.lplayers.filter((lp) => lp.league_id === l).map((lp) => {
          const p = this.players.find((x) => x.id === lp.player_id)!;
          const inv = this.invites.find((i) => i.player_id === p.id && i.league_id === l && !i.revoked && !i.used_at);
          return { player_id: p.id, name: p.name, linked: !!p.user_id, linked_name: p.user_id ? this.userName(p.user_id as string) : null, invite_token: inv?.token ?? null, invite_created: inv?.created_at ?? null, invite_expires: inv?.expires_at ?? null };
        }) };
      }
      case 'invite_preview': {
        const i = this.invites.find((x) => x.token === a.tok);
        if (!i) return { status: 200, body: [{ status: 'invalid', player_name: null, league_name: null }] };
        return { status: 200, body: [{ status: i.used_at ? 'used' : i.revoked ? 'revoked' : 'valid', player_name: this.playerName(String(i.player_id)), league_name: String(this.league(String(i.league_id))?.name) }] };
      }
      case 'accept_player_invite': {
        const e = need(); if (e) return e;
        const i = this.invites.find((x) => x.token === a.tok);
        if (!i) return err(400, 'Link non valido: chiedi un nuovo invito', 'P0001');
        const p = this.players.find((x) => x.id === i.player_id)!;
        const lg = this.league(String(i.league_id))!;
        const out = { player_id: p.id, player_name: p.name, league_id: lg.id, league_name: lg.name, league_slug: lg.slug };
        if (p.user_id === actor) return { status: 200, body: [out] };
        if (i.used_at) return err(400, 'Questo link è già stato usato', 'P0001');
        if (i.revoked) return err(400, 'Questo link non è più valido: chiedi un nuovo invito', 'P0001');
        p.user_id = actor;
        i.used_at = new Date().toISOString();
        if (!this.role(lg.id as string, actor)) this.members.push({ league_id: lg.id, user_id: actor, role: 'member', joined_at: new Date().toISOString() });
        this.log(actor, 'player_invites.used', 'player_invites', String(p.name), 'account', lg.id as string, null, ua);
        this.log(actor, 'players.link', 'players', String(p.name), 'account', lg.id as string, { user_id: [null, actor] }, ua);
        this.log(actor, 'league_members.insert', 'league_members', this.userName(actor), 'leghe', lg.id as string, { role: 'member' }, ua);
        return { status: 200, body: [out] };
      }
      default: return err(404, `Il database finto non conosce la funzione ${fn}`, 'FAKE');
    }
  }

  /** Risponde a una richiesta del telefono di `actor` (null = nessun accesso). */
  handle(method: string, url: URL, body: unknown, headers: Record<string, string>, actor: string | null): Reply {
    this.tx++;
    const ua = headers['user-agent'] ?? '';
    const name = url.pathname.split('/').pop() as string;
    const isRpc = url.pathname.includes('/rpc/');
    if (isRpc) return this.rpc(name, (body ?? {}) as Row, actor, ua);
    const single = (headers.accept ?? '').includes('vnd.pgrst.object');
    if (method === 'GET') return this.get(name, url.searchParams, actor, single);
    return this.write(method, name, url.searchParams, body, actor, ua, single);
  }

  /** Collega un telefono (contesto del browser) a questo database finto, come `userId` (o senza accesso). */
  async attach(ctx: BrowserContext, userId: string | null): Promise<void> {
    if (userId) {
      const u = this.users.find((x) => x.id === userId)!;
      await ctx.addInitScript(([ref, jwt, id, email, name]) => {
        localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
          access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 99999999, expires_at: 4102444800,
          user: { id, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: { display_name: name }, created_at: '2026-01-01T00:00:00Z' },
        }));
      }, [REF, fakeJwt(userId), userId, String(u.email), String(u.display_name)] as const);
    }
    const actorOf = (auth: string | undefined): string | null => {
      const m = /^Bearer ([^.]+)\.([^.]+)\./.exec(auth ?? '');
      if (!m) return null;
      try {
        const p = JSON.parse(Buffer.from(m[2] as string, 'base64url').toString()) as { sub?: string; role?: string };
        return p.role === 'authenticated' ? (p.sub ?? null) : null;
      } catch {
        return null;
      }
    };
    await ctx.route('**/rest/v1/**', async (r: Route) => {
      const req = r.request();
      if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
      let body: unknown = null;
      try { body = req.postDataJSON(); } catch { /* nessun corpo */ }
      const h = req.headers();
      const out = this.handle(req.method(), new URL(req.url()), body, h, actorOf(h.authorization));
      return r.fulfill({ status: out.status, headers: CORS, contentType: 'application/json', body: out.body === null || out.status === 204 ? '' : JSON.stringify(out.body) });
    });
    await ctx.route('**/auth/v1/**', async (r: Route) => {
      const req = r.request();
      if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
      const path = new URL(req.url()).pathname;
      const reply = (b: unknown, s = 200) => r.fulfill({ status: s, headers: CORS, contentType: 'application/json', body: JSON.stringify(b) });
      let body: Row = {};
      try { body = (req.postDataJSON() ?? {}) as Row; } catch { /* nessun corpo */ }
      if (path.endsWith('/signup')) {
        const meta = ((body.data ?? {}) as Row);
        const id = this.addUser(uid(), String(body.email), String(meta.display_name ?? body.email));
        return reply({ access_token: fakeJwt(id), refresh_token: 'r', token_type: 'bearer', expires_in: 99999999, expires_at: 4102444800,
          user: { id, aud: 'authenticated', role: 'authenticated', email: body.email, app_metadata: {}, user_metadata: { display_name: meta.display_name }, created_at: '2026-01-01T00:00:00Z' } });
      }
      return reply({});
    });
  }
}
