import { afterAll, beforeAll, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase } from './database';

let db: PGlite;
const admin = '00000000-0000-4000-8000-000000000011';
const player = '00000000-0000-4000-8000-000000000012';
beforeAll(async () => {
  db = await createTestDatabase();
  await db.exec(`insert into auth.users(id,email) values ('${admin}', 'admin@example.invalid'), ('${player}', 'player@example.invalid'); insert into platform_admins(user_id) values ('${admin}');`);
}, 60_000);
afterAll(async () => { await db?.close(); });

test('la richiesta Premium crea una lega solo dopo approvazione e attribuisce la proprietà al richiedente', async () => {
  await db.exec(`select set_config('request.jwt.claim.sub','${player}',false); set role authenticated`);
  const request = (await db.query<{ id: string }>("select request_league('Lega proposta',5,2) as id")).rows[0]!.id;
  await expect(db.query('select admin_decide_league_request($1,true)', [request])).rejects.toThrow(/Permesso negato/);
  await expect(db.query("insert into leagues(name) values ('Senza approvazione')")).rejects.toThrow();
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${admin}',false); set role authenticated`);
  const league = (await db.query<{ id: string }>('select admin_decide_league_request($1,true) as id', [request])).rows[0]!.id;
  await expect(db.query('select admin_decide_league_request($1,true)', [request])).rejects.toThrow(/non disponibile/);
  await db.exec('reset role');
  expect((await db.query('select owner_id, created_by from leagues where id = $1', [league])).rows[0]).toEqual({ owner_id: player, created_by: player });
  expect((await db.query('select user_id, role from league_members where league_id = $1', [league])).rows).toEqual([{ user_id: player, role: 'admin' }]);
  await db.exec(`update account_premium set expires_at = now() - interval '1 second', trial_expires_at = now() - interval '1 second' where user_id = '${player}';
    select set_config('request.jwt.claim.sub','${player}',false); set role authenticated`);
  expect((await db.query<{ allowed: boolean }>('select is_league_admin($1) as allowed', [league])).rows[0]?.allowed).toBe(true); // resta admin, ma non Premium
  expect((await db.query<{ allowed: boolean }>('select is_premium_league_admin($1) as allowed', [league])).rows[0]?.allowed).toBe(false);
  await expect(db.query('select request_league($1,5,null)', ['Lega scaduta'])).rejects.toThrow(/Premium/);
  expect((await db.query('select id from leagues where id = $1', [league])).rows).toHaveLength(1);
});
