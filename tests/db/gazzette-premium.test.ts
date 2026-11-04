import { afterAll, beforeAll, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase } from './database';

let db: PGlite;
const editor = '00000000-0000-4000-8000-000000000061';
const reader = '00000000-0000-4000-8000-000000000062';
const outsider = '00000000-0000-4000-8000-000000000063';
const league = '00000000-0000-4000-8000-000000000064';
const match = '00000000-0000-4000-8000-000000000065';
const path = `${league}/${match}-123.jpg`;

beforeAll(async () => {
  db = await createTestDatabase();
  await db.exec(`insert into auth.users(id,email) values ('${editor}','editor@example.invalid'),('${reader}','reader@example.invalid'),('${outsider}','outsider@example.invalid');
    delete from account_premium where user_id='${editor}';
    insert into leagues(id,name) values ('${league}','Test');
    insert into league_members(league_id,user_id,role) values ('${league}','${editor}','redazione'), ('${league}','${reader}','member');
    insert into matches(id,league_id,date) values ('${match}','${league}',current_season_start());
    insert into storage.objects(bucket_id,name) values ('gazzette','${path}');
    grant select on storage.objects to authenticated;
    alter table storage.objects enable row level security;`);
}, 60_000);
afterAll(async () => { await db?.close(); });

test('pubblicazione nella propria lega e lettura solo ai membri Premium', async () => {
  await db.exec(`select set_config('request.jwt.claim.sub','${editor}',false); set role authenticated`);
  await db.query('select publish_gazzetta($1,$2)', [match, path]);
  expect((await db.query('select * from gazzette')).rows).toHaveLength(0);
  expect((await db.query("select * from storage.objects where bucket_id='gazzette'")).rows).toHaveLength(0);
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${outsider}',false); set role authenticated`);
  await expect(db.query('select publish_gazzetta($1,$2)', [match, path])).rejects.toThrow(/Permesso negato/);
  expect((await db.query('select * from gazzette')).rows).toHaveLength(0);
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${reader}',false); set role authenticated`);
  expect((await db.query('select * from gazzette')).rows).toHaveLength(1);
  expect((await db.query("select * from storage.objects where bucket_id='gazzette'")).rows).toHaveLength(1);
});
