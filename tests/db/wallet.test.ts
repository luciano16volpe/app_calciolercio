import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase } from './database';

const owner = '20000000-0000-4000-8000-000000000001';
const friend = '20000000-0000-4000-8000-000000000002';
const outsider = '20000000-0000-4000-8000-000000000003';
const league = '20000000-0000-4000-8000-000000000010';
let db: PGlite;

beforeAll(async () => { db = await createTestDatabase(); }, 60_000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec(`begin;
    insert into auth.users(id,email) values ('${owner}','o@test.invalid'),('${friend}','f@test.invalid'),('${outsider}','x@test.invalid');
    insert into leagues(id,name,owner_id,created_by) values ('${league}','Conto','${owner}','${owner}');
    insert into league_members(league_id,user_id,role) values ('${league}','${owner}','admin'),('${league}','${friend}','member');`);
});
afterEach(async () => { await db.exec('rollback; reset role;'); });

async function asUser(id: string) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
  await db.exec('set local role authenticated');
}
const state = async () => (await db.query<{ s: { balance: number; topped_up: number; first_time: boolean } }>('select wallet_state($1::uuid) as s', [league])).rows[0]!.s;
const spend = async (user: string, amount: number) => {
  await db.exec('reset role');
  await db.query("insert into wallet_transactions(league_id,user_id,amount,kind) values($1,$2,$3,'STAKE')", [league, user, -amount]);
  await asUser(user);
};

test('si parte con 50 dollalerci, assegnati una volta sola', async () => {
  await asUser(friend);
  expect(await state()).toMatchObject({ balance: 50, topped_up: 0, first_time: true });
  expect(await state()).toMatchObject({ balance: 50, first_time: false });
  await db.exec('reset role');
  expect((await db.query('select count(*)::int as n from wallet_transactions where kind=$1', ['INITIAL'])).rows[0]).toEqual({ n: 1 });
});

test('chi ha meno di 20 torna a 20, una sola volta a settimana', async () => {
  await asUser(friend);
  await state();
  await spend(friend, 45);               // restano 5
  expect(await state()).toMatchObject({ balance: 20, topped_up: 15 });
  await spend(friend, 20);               // di nuovo a 0, ma la ricarica di questa settimana è già stata fatta
  expect(await state()).toMatchObject({ balance: 0, topped_up: 0 });
  await db.exec('reset role');
  await db.query("update wallet_transactions set week_start=week_start-7 where kind='TOPUP'");
  await asUser(friend);
  expect(await state()).toMatchObject({ balance: 20, topped_up: 20 });
});

test('chi ha 20 o più non riceve ricariche', async () => {
  await asUser(friend);
  await state();
  await spend(friend, 30);               // restano 20
  expect(await state()).toMatchObject({ balance: 20, topped_up: 0 });
});

test('solo i membri della lega hanno un conto e nessuno scrive i movimenti a mano', async () => {
  await asUser(outsider);
  await db.exec('savepoint no');
  await expect(db.query('select wallet_state($1::uuid)', [league])).rejects.toThrow(/Permesso negato/);
  await db.exec('rollback to savepoint no');
  await asUser(friend);
  await expect(db.query("insert into wallet_transactions(league_id,user_id,amount,kind) values($1,$2,100,'PAYOUT')", [league, friend])).rejects.toThrow();
});
