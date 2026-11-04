import { afterAll, beforeAll, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase } from './database';

let db: PGlite;
const admin = '00000000-0000-4000-8000-000000000001';
const user = '00000000-0000-4000-8000-000000000002';
beforeAll(async () => {
  db = await createTestDatabase();
  await db.exec(`insert into auth.users(id,email) values ('${admin}','admin@example.invalid'),('${user}','user@example.invalid');
    insert into platform_admins(user_id) values ('${admin}');
    delete from account_premium where user_id = '${user}';`);
}, 60_000);
afterAll(async () => { await db?.close(); });

test('solo il super amministratore attiva e rinnova; la scadenza determina lo stato', async () => {
  await db.exec(`select set_config('request.jwt.claim.sub','${user}',false); set role authenticated`);
  expect((await db.query('select active, expires_at from my_premium_status()')).rows).toEqual([{ active: false, expires_at: null }]);
  await expect(db.query('select admin_extend_premium($1, 1)', [user])).rejects.toThrow(/Permesso negato/);
  await expect(db.query('select admin_end_premium($1)', [user])).rejects.toThrow(/Permesso negato/);
  await expect(db.query('select admin_grant_lifetime_premium($1)', [user])).rejects.toThrow(/Permesso negato/);
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

test('Premium a vita non ha scadenza e può essere revocato dal super amministratore', async () => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${admin}',false); set role authenticated`);
  await db.query('select admin_grant_lifetime_premium($1)', [user]);
  await expect(db.query('select admin_extend_premium($1, 1)', [user])).rejects.toThrow(/vita/);
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${user}',false); set role authenticated`);
  expect((await db.query('select active, lifetime, expires_at from my_premium_status()')).rows[0]).toEqual({ active: true, lifetime: true, expires_at: null });
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${admin}',false); set role authenticated`);
  await db.query('select admin_end_premium($1)', [user]);
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${user}',false); set role authenticated`);
  expect((await db.query('select active, lifetime from my_premium_status()')).rows[0]).toEqual({ active: false, lifetime: false });
});

test('alla registrazione parte una sola prova di un mese legata all’account', async () => {
  const newcomer = '00000000-0000-4000-8000-000000000003';
  await db.exec(`reset role; insert into auth.users(id,email,created_at) values ('${newcomer}', 'new@example.invalid', now());
    select set_config('request.jwt.claim.sub','${newcomer}',false); set role authenticated`);
  const result = await db.query<{ active: boolean; trial: boolean; correct_duration: boolean }>(
    `select active, trial, trial_expires_at between now() + interval '1 month' - interval '5 seconds' and now() + interval '1 month' + interval '5 seconds' as correct_duration from my_premium_status()`,
  );
  expect(result.rows[0]).toEqual({ active: true, trial: true, correct_duration: true });
});

test('admin senza Premium: gestisce partite e rosa, non impostazioni lega, eliminazioni e Gazzette', async () => {
  const lapsed = '00000000-0000-4000-8000-000000000071';
  const lg = '00000000-0000-4000-8000-000000000072';
  const mt = '00000000-0000-4000-8000-000000000073';
  const pl = '00000000-0000-4000-8000-000000000074';
  await db.exec(`reset role; insert into auth.users(id,email) values ('${lapsed}','lapsed@example.invalid');
    update account_premium set expires_at = now() - interval '1 day', trial_expires_at = null where user_id = '${lapsed}';
    insert into leagues(id,name) values ('${lg}','Scaduta');
    insert into league_members(league_id,user_id,role) values ('${lg}','${lapsed}','admin') on conflict (league_id,user_id) do update set role='admin';
    insert into matches(id,league_id,date) values ('${mt}','${lg}', current_date);
    insert into players(id,name,created_by) values ('${pl}','Rossi','${lapsed}');
    insert into league_players(league_id,player_id) values ('${lg}','${pl}');
    select set_config('request.jwt.claim.sub','${lapsed}',false); set role authenticated`);
  expect((await db.query<{ ok: boolean }>('select is_league_admin($1) as ok', [lg])).rows[0]?.ok).toBe(true);
  expect((await db.query<{ ok: boolean }>('select can_edit_player($1) as ok', [pl])).rows[0]?.ok).toBe(true);
  expect((await db.query<{ ok: boolean }>('select can_delete_player($1) as ok', [pl])).rows[0]?.ok).toBe(false);
  expect((await db.query('update leagues set name = $2 where id = $1 returning id', [lg, 'Nuova'])).rows).toHaveLength(0);
  expect((await db.query('update matches set score_a = 1, score_b = 0 where id = $1 returning id', [mt])).rows).toHaveLength(1);
  await expect(db.query('select publish_gazzetta($1,$2)', [mt, `${lg}/${mt}-1.jpg`])).rejects.toThrow(/Permesso negato/);
  await db.exec(`reset role; update account_premium set lifetime = true where user_id = '${lapsed}'; select set_config('request.jwt.claim.sub','${lapsed}',false); set role authenticated`);
  expect((await db.query('update leagues set name = $2 where id = $1 returning id', [lg, 'Nuova'])).rows).toHaveLength(1);
});
