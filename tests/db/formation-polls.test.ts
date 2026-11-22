import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase } from './database';

const admin = '20000000-0000-4000-8000-000000000001';
const premium = '20000000-0000-4000-8000-000000000002';
const standard = '20000000-0000-4000-8000-000000000003';
const outsider = '20000000-0000-4000-8000-000000000004';
const league = '20000000-0000-4000-8000-000000000005';
const players = [6, 7, 8, 9].map((n) => `20000000-0000-4000-8000-00000000000${n}`);
const metrics = (a: number, b: number) => ({ sA: a, sB: b, diff: Math.abs(a - b), distrib: 0.2, roleFit: 0.8, score: 0.3 });
const options = [
  { team_a: [players[0], players[1]], team_b: [players[2], players[3]], metrics: metrics(6, 5.8), stats: Array(11).fill({ label: 'test', a: 6, b: 5.8 }), module_a: null, module_b: null, rank: 1 },
  { team_a: [players[0], players[2]], team_b: [players[1], players[3]], metrics: metrics(6.1, 6), stats: Array(11).fill({ label: 'test', a: 6.1, b: 6 }), module_a: null, module_b: null, rank: 2 },
];
let db: PGlite;
beforeAll(async () => { db = await createTestDatabase(); }, 60_000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec(`begin;
    insert into auth.users(id,email) values ('${admin}','admin@test.invalid'),('${premium}','premium@test.invalid'),
      ('${standard}','standard@test.invalid'),('${outsider}','outsider@test.invalid');
    update account_premium set expires_at=now()-interval '1 minute',trial_expires_at=now()-interval '1 minute' where user_id='${standard}';
    insert into leagues(id,name,owner_id,created_by) values ('${league}','Sondaggio','${admin}','${admin}');
    insert into league_members(league_id,user_id,role) values
      ('${league}','${admin}','admin'),('${league}','${premium}','member'),('${league}','${standard}','member');
    insert into players(id,name,user_id) values
      ('${players[0]}','Uno','${admin}'),('${players[1]}','Due',null),
      ('${players[2]}','Tre',null),('${players[3]}','Quattro',null);
    insert into league_players(league_id,player_id) values
      ('${league}','${players[0]}'),('${league}','${players[1]}'),
      ('${league}','${players[2]}'),('${league}','${players[3]}');
  `);
});
afterEach(async () => { await db.exec('rollback; reset role;'); });

async function asUser(id: string) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
  await db.exec('set local role authenticated');
}
async function createPoll() {
  await asUser(admin);
  const { rows } = await db.query<{ id: string }>('select create_match_with_formation_poll($1::jsonb,$2::jsonb) as id', [
    JSON.stringify({ league_id: league, date: '2026-12-30', play_time: '21:00', place: 'Campo Sole' }), JSON.stringify(options),
  ]);
  return rows[0]!.id;
}

test('tutti i membri vedono le opzioni, ma solo Premium può votare anche senza giocare', async () => {
  const id = await createPoll();
  await asUser(standard);
  const { rows: standardState } = await db.query<{ state: { is_open: boolean; has_premium: boolean; options: unknown[] } }>('select formation_poll_state($1::uuid) as state', [id]);
  expect(standardState[0]!.state).toMatchObject({ is_open: true, has_premium: false });
  expect(standardState[0]!.state.options).toHaveLength(2);
  await db.exec('savepoint denied');
  await expect(db.query('select submit_formation_vote($1::uuid,2::smallint)', [id])).rejects.toThrow(/Premium/);
  await db.exec('rollback to savepoint denied');
  await asUser(premium);
  await db.query('select submit_formation_vote($1::uuid,2::smallint)', [id]);
  await db.query('select submit_formation_vote($1::uuid,1::smallint)', [id]);
  expect((await db.query('select formation_poll_state($1::uuid) as state', [id])).rows[0]).toMatchObject({ state: { my_vote: 1 } });
  await asUser(outsider);
  expect((await db.query('select formation_poll_state($1::uuid) as state', [id])).rows[0]).toEqual({ state: null });
});

test('alla chiusura salva la formazione vincente una sola volta', async () => {
  const id = await createPoll();
  await asUser(premium);
  await db.query('select submit_formation_vote($1::uuid,2::smallint)', [id]);
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub','',true)");
  await db.query("update formation_polls set opened_at=now()-interval '25 hours',closes_at=now()-interval '1 hour' where match_id=$1", [id]);
  expect((await db.query('select finalize_formation_polls() as count')).rows).toEqual([{ count: 1 }]);
  expect((await db.query('select finalize_formation_polls() as count')).rows).toEqual([{ count: 0 }]);
  expect((await db.query('select winning_option from formation_polls where match_id=$1', [id])).rows).toEqual([{ winning_option: 2 }]);
  expect((await db.query("select player_id from match_players where match_id=$1 and team='A' order by position", [id])).rows)
    .toEqual([{ player_id: players[0] }, { player_id: players[2] }]);
  expect((await db.query('select pred_rank from matches where id=$1', [id])).rows).toEqual([{ pred_rank: 2 }]);
});

test('senza voti mantiene le squadre pubblicate dall’admin', async () => {
  const id = await createPoll();
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub','',true)");
  await db.query("update formation_polls set opened_at=now()-interval '25 hours',closes_at=now()-interval '1 hour' where match_id=$1", [id]);
  await db.query('select finalize_formation_polls()');
  expect((await db.query('select winning_option from formation_polls where match_id=$1', [id])).rows).toEqual([{ winning_option: 1 }]);
  expect((await db.query("select player_id from match_players where match_id=$1 and team='A' order by position", [id])).rows)
    .toEqual([{ player_id: players[0] }, { player_id: players[1] }]);
});

test('un pareggio conserva le squadre iniziali', async () => {
  const id = await createPoll();
  await asUser(admin);
  await db.query('select submit_formation_vote($1::uuid,1::smallint)', [id]);
  await asUser(premium);
  await db.query('select submit_formation_vote($1::uuid,2::smallint)', [id]);
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub','',true)");
  await db.query("update formation_polls set opened_at=now()-interval '25 hours',closes_at=now()-interval '1 hour' where match_id=$1", [id]);
  await db.query('select finalize_formation_polls()');
  expect((await db.query('select winning_option from formation_polls where match_id=$1', [id])).rows).toEqual([{ winning_option: 1 }]);
});

test('durante il sondaggio non si possono cambiare le squadre e dopo la scadenza non si può votare', async () => {
  const id = await createPoll();
  await asUser(admin);
  await db.exec('savepoint fixed_teams');
  await expect(db.query("update match_players set team='B' where match_id=$1 and player_id=$2", [id, players[0]]))
    .rejects.toThrow(/squadre sono in votazione/);
  await db.exec('rollback to savepoint fixed_teams');
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub','',true)");
  await db.query("update formation_polls set opened_at=now()-interval '25 hours',closes_at=now()-interval '1 hour' where match_id=$1", [id]);
  await asUser(premium);
  await db.exec('savepoint expired');
  await expect(db.query('select submit_formation_vote($1::uuid,2::smallint)', [id])).rejects.toThrow(/Sondaggio chiuso/);
  await db.exec('rollback to savepoint expired');
});
