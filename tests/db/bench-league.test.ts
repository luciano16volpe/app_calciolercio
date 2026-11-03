import { afterAll, beforeAll, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase } from './database';

let db: PGlite;
const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const la = '00000000-0000-4000-8000-000000000011';
const lb = '00000000-0000-4000-8000-000000000012';
const p = '00000000-0000-4000-8000-000000000021';
const q = '00000000-0000-4000-8000-000000000022';

beforeAll(async () => {
  db = await createTestDatabase();
  await db.exec(`insert into auth.users(id,email) values ('${a}','a@example.invalid'),('${b}','b@example.invalid');
    insert into leagues(id,name,owner_id,created_by) values ('${la}','A','${a}','${a}'),('${lb}','B','${b}','${b}');
    insert into league_members(league_id,user_id,role) values ('${la}','${a}','admin'),('${lb}','${b}','admin') on conflict (league_id,user_id) do update set role='admin';
    insert into players(id,name,created_by) values ('${p}','Marco','${a}'),('${q}','Luca','${a}');
    insert into league_players(league_id,player_id) values ('${la}','${p}'),('${lb}','${p}'),('${la}','${q}');`);
}, 60_000);
afterAll(async () => { await db?.close(); });

test('archivio e recupero sono limitati alla lega anche se il giocatore partecipa a un’altra', async () => {
  await db.exec(`select set_config('request.jwt.claim.sub','${a}',false); set role authenticated;`);
  await db.query('select remove_player_from_league($1,$2)', [la, p]);
  expect((await db.query('select player_id from bench_players($1)', [la])).rows).toEqual([{ player_id: p }]);
  await expect(db.query('select * from bench_players($1)', [lb])).rejects.toThrow(/Permesso negato/);
  await db.exec('reset role');
  await db.exec(`select set_config('request.jwt.claim.sub','${b}',false); set role authenticated;`);
  expect((await db.query('select * from bench_players($1)', [lb])).rows).toEqual([]);
  await expect(db.query('select add_player_to_league($1,$2)', [lb, p])).rejects.toThrow(/Panchina/);
  await expect(db.query('insert into league_players(league_id,player_id) values ($1,$2)', [lb, q])).rejects.toThrow(/row-level security/i);
  await expect(db.query('select * from bench_players()')).rejects.toThrow(/permission denied/i);
  await db.exec('reset role');
  await db.exec(`select set_config('request.jwt.claim.sub','${a}',false); set role authenticated;`);
  await db.query('select add_player_to_league($1,$2)', [la, p]);
  expect((await db.query('select * from bench_players($1)', [la])).rows).toEqual([]);
});
