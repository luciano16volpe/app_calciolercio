import { afterAll, beforeAll, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase } from './database';

let db: PGlite;
const admin = '00000000-0000-4000-8000-000000000001';
const user = '00000000-0000-4000-8000-000000000002';
beforeAll(async () => {
  db = await createTestDatabase();
  await db.exec(`insert into auth.users(id,email) values ('${admin}','admin@example.invalid'),('${user}','user@example.invalid');
    insert into platform_admins(user_id) values ('${admin}');`);
}, 60_000);
afterAll(async () => { await db?.close(); });

test('solo il super amministratore attiva e rinnova; la scadenza determina lo stato', async () => {
  await db.exec(`select set_config('request.jwt.claim.sub','${user}',false); set role authenticated`);
  expect((await db.query('select active, expires_at from my_premium_status()')).rows).toEqual([{ active: false, expires_at: null }]);
  await expect(db.query('select admin_extend_premium($1, 1)', [user])).rejects.toThrow(/Permesso negato/);
  await expect(db.query('select admin_end_premium($1)', [user])).rejects.toThrow(/Permesso negato/);
  await expect(db.query('select * from admin_premium_statuses()')).rejects.toThrow(/Permesso negato/);
  await expect(db.query('insert into account_premium(user_id, expires_at) values ($1, now())', [user])).rejects.toThrow(/permission denied/);
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${admin}',false); set role authenticated`);
  await expect(db.query('select admin_extend_premium($1, 0)', [user])).rejects.toThrow(/Durata non valida/);
  const first = await db.query<{ expires: Date }>('select admin_extend_premium($1, 1) as expires', [user]);
  const second = await db.query<{ expires: Date }>('select admin_extend_premium($1, 2) as expires', [user]);
  expect(new Date(second.rows[0]!.expires).getTime()).toBeGreaterThan(new Date(first.rows[0]!.expires).getTime());
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${user}',false); set role authenticated`);
  expect((await db.query<{ active: boolean }>('select active from my_premium_status()')).rows[0]?.active).toBe(true);
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${admin}',false); set role authenticated`);
  await db.query('select admin_end_premium($1)', [user]);
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${user}',false); set role authenticated`);
  expect((await db.query<{ active: boolean }>('select active from my_premium_status()')).rows[0]?.active).toBe(false);
  await db.exec(`reset role; update account_premium set expires_at = now() - interval '1 month' where user_id = '${user}';
    select set_config('request.jwt.claim.sub','${admin}',false); set role authenticated`);
  await db.query('select admin_extend_premium($1, 1)', [user]);
  expect((await db.query<{ active: boolean }>('select active from admin_premium_statuses() where user_id = $1', [user])).rows[0]?.active).toBe(true);
});
