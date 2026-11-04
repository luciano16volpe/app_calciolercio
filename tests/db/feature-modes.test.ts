import { afterAll, beforeAll, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase } from './database';

let db: PGlite;
const admin = '00000000-0000-4000-8000-000000000041';
const user = '00000000-0000-4000-8000-000000000042';
beforeAll(async () => {
  db = await createTestDatabase();
  await db.exec(`insert into auth.users(id,email) values ('${admin}','admin@example.invalid'),('${user}','user@example.invalid');
    insert into platform_admins(user_id) values ('${admin}'); delete from account_premium where user_id='${user}';`);
}, 60_000);
afterAll(async () => { await db?.close(); });

test('solo il super amministratore cambia modalità; beta è visibile soltanto a lui', async () => {
  await db.exec(`select set_config('request.jwt.claim.sub','${user}',false); set role authenticated`);
  await expect(db.query("select admin_set_feature_mode('couples','standard')")).rejects.toThrow(/Permesso negato/);
  expect((await db.query<{ allowed: boolean }>("select feature_allowed('couples') as allowed")).rows[0]?.allowed).toBe(false);
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${admin}',false); set role authenticated`);
  await db.query("select admin_set_feature_mode('couples','standard')");
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${user}',false); set role authenticated`);
  expect((await db.query<{ allowed: boolean }>("select feature_allowed('couples') as allowed")).rows[0]?.allowed).toBe(true);
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${admin}',false); set role authenticated`);
  await db.query("select admin_set_feature_mode('couples','beta')");
  expect((await db.query<{ allowed: boolean }>("select feature_allowed('couples') as allowed")).rows[0]?.allowed).toBe(true);
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${user}',false); set role authenticated`);
  expect((await db.query("select feature from my_feature_modes() where feature='couples'")).rows).toEqual([]);
  expect((await db.query<{ allowed: boolean }>("select feature_allowed('couples') as allowed")).rows[0]?.allowed).toBe(false);
});
