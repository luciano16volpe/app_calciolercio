// Invito libero: l'amministratore crea un link con un indirizzo email; chi lo apre entra nella lega
// e si collega a un giocatore libero oppure se ne crea uno nuovo. Si prova col database vero (migrazioni, RLS, trigger).
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase } from './database';

const admin = '00000000-0000-4000-8000-000000000001';
const member = '00000000-0000-4000-8000-000000000003';
const newbie = '00000000-0000-4000-8000-000000000005';
const newbie2 = '00000000-0000-4000-8000-000000000006';
const veteran = '00000000-0000-4000-8000-000000000007';
const league = '00000000-0000-4000-8000-000000000011';
const free = '00000000-0000-4000-8000-000000000021';
const mine = '00000000-0000-4000-8000-000000000022';
let db: PGlite;

beforeAll(async () => { db = await createTestDatabase(); }, 60_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`begin;
    insert into auth.users(id, email) values
      ('${admin}', 'admin@example.invalid'), ('${member}', 'member@example.invalid'), ('${newbie}', 'nuovo@example.invalid'),
      ('${newbie2}', 'nuovo2@example.invalid'), ('${veteran}', 'veterano@example.invalid');
    insert into leagues(id, name, owner_id, created_by) values ('${league}', 'Lega Prova', '${admin}', '${admin}');
    insert into league_members(league_id, user_id, role) values ('${league}', '${admin}', 'admin'), ('${league}', '${member}', 'member')
      on conflict (league_id, user_id) do update set role = excluded.role;
    insert into players(id, name, created_by) values ('${free}', 'Gigi Libero', '${admin}');
    insert into players(id, name, user_id, created_by) values ('${mine}', 'Vecchio Lupo', '${veteran}', '${admin}');
    insert into league_players(league_id, player_id) values ('${league}', '${free}');
  `);
});
afterEach(async () => { await db.exec('rollback; reset role;'); });

async function asUser(id: string | null) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [id ?? '']);
  await db.exec(`set local role ${id ? 'authenticated' : 'anon'}`);
}
async function fails(sql: string, args: unknown[], message: RegExp) {
  await db.exec('savepoint failed_command');
  try { await expect(db.query(sql, args)).rejects.toThrow(message); }
  finally { await db.exec('rollback to savepoint failed_command'); }
}
const createSql = 'select create_league_invite($1::uuid, $2::text) as token';
const acceptSql = 'select * from accept_league_invite($1::text, $2::uuid, $3::text, $4::text[], $5::int[])';
const stats = [6, 7, 5, 8, 4, 6, 5, 7, 6, 3, 8];
async function invite(email = 'amico@example.com') {
  await asUser(admin);
  return (await db.query<{ token: string }>(createSql, [league, email])).rows[0]!.token;
}

test("solo l'amministratore crea il link; l'email deve essere valida", async () => {
  await asUser(member);
  await fails(createSql, [league, 'amico@example.com'], /Permesso negato/);
  await asUser(admin);
  await fails(createSql, [league, 'senza chiocciola'], /Indirizzo email non valido/);
  await fails(createSql, [league, ''], /Indirizzo email non valido/);
  const { rows } = await db.query<{ token: string }>(createSql, [league, '  Amico@Example.com ']);
  expect(rows[0]!.token).toMatch(/^[0-9a-f]{32}$/);
  expect((await db.query('select email from league_invites')).rows).toEqual([{ email: 'amico@example.com' }]);
});

test("l'anteprima funziona anche senza account; un nuovo link per lo stesso indirizzo annulla il vecchio", async () => {
  const first = await invite();
  await asUser(null);
  expect((await db.query('select * from league_invite_preview($1)', [first])).rows).toEqual([{ status: 'valid', league_name: 'Lega Prova' }]);
  expect((await db.query('select * from league_invite_preview($1)', ['inesistente'])).rows).toEqual([{ status: 'invalid', league_name: null }]);
  const second = await invite();
  expect(second).not.toBe(first);
  await asUser(null);
  expect((await db.query<{ status: string }>('select status from league_invite_preview($1)', [first])).rows[0]!.status).toBe('revoked');
  expect((await db.query<{ status: string }>('select status from league_invite_preview($1)', [second])).rows[0]!.status).toBe('valid');
});

test('chi non ha un giocatore se ne crea uno nuovo: va subito in Rosa, collegato al suo account', async () => {
  const tok = await invite();
  await asUser(newbie);
  const { rows } = await db.query<{ outcome: string; player_name: string }>(acceptSql, [tok, null, '  Nuovo Amico ', ['ATT', 'MED'], stats]);
  expect(rows[0]).toMatchObject({ outcome: 'created', player_name: 'Nuovo Amico', league_name: 'Lega Prova' });
  await db.exec('reset role');
  expect((await db.query('select name, roles, stats, user_id from players where name = $1', ['Nuovo Amico'])).rows)
    .toEqual([{ name: 'Nuovo Amico', roles: ['ATT', 'MED'], stats, user_id: newbie }]);
  expect((await db.query('select count(*)::int as n from league_players lp join players p on p.id = lp.player_id where p.user_id = $1 and lp.league_id = $2', [newbie, league])).rows[0]).toEqual({ n: 1 });
  expect((await db.query('select role from league_members where user_id = $1 and league_id = $2', [newbie, league])).rows).toEqual([{ role: 'member' }]);
});

test('il link vale per una persona sola; la stessa persona che lo riapre non crea doppioni', async () => {
  const tok = await invite();
  await asUser(newbie);
  await db.query(acceptSql, [tok, null, 'Nuovo Amico', ['MED'], stats]);
  const again = await db.query<{ outcome: string }>(acceptSql, [tok, null, 'Altro Nome', ['DIF'], stats]);
  expect(again.rows[0]!.outcome).toBe('has_player');
  await asUser(newbie2);
  await fails(acceptSql, [tok, null, 'Terzo', ['MED'], stats], /già stato usato/);
  await db.exec('reset role');
  expect((await db.query('select count(*)::int as n from players where user_id = $1', [newbie])).rows[0]).toEqual({ n: 1 });
});

test('chi sceglie un giocatore libero manda la richiesta «Questo sono io» e entra come membro', async () => {
  const tok = await invite();
  await asUser(newbie);
  expect((await db.query<{ player_id: string; name: string }>('select * from league_invite_players($1)', [tok])).rows).toEqual([{ player_id: free, name: 'Gigi Libero' }]);
  const { rows } = await db.query<{ outcome: string }>(acceptSql, [tok, free, null, null, null]);
  expect(rows[0]!.outcome).toBe('claim_sent');
  await db.exec('reset role');
  expect((await db.query('select status, user_id from player_claims where player_id = $1', [free])).rows).toEqual([{ status: 'pending', user_id: newbie }]);
  expect((await db.query('select user_id from players where id = $1', [free])).rows).toEqual([{ user_id: null }]); // il collegamento lo decide l'amministratore
});

test('chi ha già un giocatore entra con quello, senza crearne un altro', async () => {
  const tok = await invite();
  await asUser(veteran);
  const { rows } = await db.query<{ outcome: string; player_name: string }>(acceptSql, [tok, null, 'Doppione', ['MED'], stats]);
  expect(rows[0]).toMatchObject({ outcome: 'has_player', player_name: 'Vecchio Lupo' });
  await db.exec('reset role');
  expect((await db.query('select count(*)::int as n from players where name = $1', ['Doppione'])).rows[0]).toEqual({ n: 0 });
  expect((await db.query('select count(*)::int as n from league_players where league_id = $1 and player_id = $2', [league, mine])).rows[0]).toEqual({ n: 1 });
});

test('nome già usato, ruoli o statistiche non validi: niente viene salvato e il link resta valido', async () => {
  const tok = await invite();
  await asUser(newbie);
  await fails(acceptSql, [tok, null, 'gigi   libero', ['MED'], stats], /già usato/);
  await fails(acceptSql, [tok, null, 'Nuovo', [], stats], /ruolo/);
  await fails(acceptSql, [tok, null, 'Nuovo', ['PORTIERE'], stats], /Ruolo non valido|invalid input/);
  await fails(acceptSql, [tok, null, 'Nuovo', ['MED'], [5, 5, 5]], /11 statistiche/);
  await fails(acceptSql, [tok, null, 'Nuovo', ['MED'], [...stats.slice(0, 10), 11]], /11 statistiche/);
  await db.exec('reset role');
  expect((await db.query('select count(*)::int as n from league_members where user_id = $1', [newbie])).rows[0]).toEqual({ n: 0 });
  expect((await db.query('select used_at from league_invites where token = $1', [tok])).rows).toEqual([{ used_at: null }]);
});

test('link scaduto o inesistente non si usa; chi non è loggato non può accettare', async () => {
  const tok = await invite();
  await db.exec('reset role');
  await db.query("update league_invites set expires_at = now() - interval '1 minute' where token = $1", [tok]);
  await asUser(newbie);
  await fails(acceptSql, [tok, null, 'Nuovo', ['MED'], stats], /scaduto/);
  await fails(acceptSql, ['inesistente', null, 'Nuovo', ['MED'], stats], /non valido/);
  await asUser(null);
  await fails(acceptSql, [tok, null, 'Nuovo', ['MED'], stats], /permission denied|Devi prima accedere/);
});

test("solo l'amministratore vede gli inviti creati", async () => {
  await invite('uno@example.com');
  await asUser(member);
  expect((await db.query('select * from league_invites')).rows).toEqual([]);
  await asUser(admin);
  expect((await db.query('select email from league_invites')).rows).toEqual([{ email: 'uno@example.com' }]);
});
