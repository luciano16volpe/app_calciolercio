import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase } from './database';

const admin = '30000000-0000-4000-8000-000000000001';
const teammate = '30000000-0000-4000-8000-000000000002';
const nonplayer = '30000000-0000-4000-8000-000000000003';
const outsider = '30000000-0000-4000-8000-000000000004';
const league = '30000000-0000-4000-8000-000000000005';
const players = [6, 7, 8, 9].map((n) => `30000000-0000-4000-8000-00000000000${n}`);
const matchDate = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
const options = [
  { team_a: [players[0], players[1]], team_b: [players[2], players[3]], metrics: { sA: 6, sB: 6 }, stats: Array(11).fill({ label: 'test', a: 6, b: 6 }), rank: 1 },
  { team_a: [players[0], players[2]], team_b: [players[1], players[3]], metrics: { sA: 6.1, sB: 6 }, stats: Array(11).fill({ label: 'test', a: 6.1, b: 6 }), rank: 2 },
];
let db: PGlite;
beforeAll(async () => { db = await createTestDatabase(); }, 60_000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec(`begin;
    insert into auth.users(id,email) values
      ('${admin}','admin-formation@test.invalid'),('${teammate}','teammate@test.invalid'),
      ('${nonplayer}','nonplayer@test.invalid'),('${outsider}','outsider-formation@test.invalid');
    insert into leagues(id,name,owner_id,created_by) values ('${league}','Sondaggio','${admin}','${admin}');
    insert into league_members(league_id,user_id,role) values
      ('${league}','${admin}','admin'),('${league}','${teammate}','member'),('${league}','${nonplayer}','member');
    insert into players(id,name,user_id) values
      ('${players[0]}','Uno','${admin}'),('${players[1]}','Due','${teammate}'),
      ('${players[2]}','Tre',null),('${players[3]}','Quattro',null);
    insert into league_players(league_id,player_id) values
      ('${league}','${players[0]}'),('${league}','${players[1]}'),
      ('${league}','${players[2]}'),('${league}','${players[3]}');
    insert into push_subscriptions(user_id,endpoint,p256dh,auth)
      select id,'https://example.invalid/formation-'||id::text,'test','test'
      from auth.users where id in ('${admin}','${teammate}','${nonplayer}','${outsider}');
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
    JSON.stringify({ league_id: league, date: matchDate, play_time: '21:00', place: 'Campo Sole' }), JSON.stringify(options),
  ]);
  await db.exec('reset role; set constraints all immediate; set constraints all deferred;');
  return rows[0]!.id;
}
async function finalize(id: string) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub','',true)");
  await db.query("update formation_polls set opened_at=now()-interval '25 hours',closes_at=now()-interval '1 hour' where match_id=$1", [id]);
  await db.query('select finalize_formation_polls()');
  await db.exec('set constraints all immediate; set constraints all deferred;');
}

test('notifica solo i convocati abilitati dopo la pubblicazione, anche senza voti', async () => {
  const id = await createPoll();
  expect((await db.query('select notify_created from push_invite_created where match_id=$1', [id])).rows)
    .toEqual([{ notify_created: false }]);
  expect((await db.query('select count(*)::integer as n from push_formation_published_due_at(now()) where match_id=$1', [id])).rows)
    .toEqual([{ n: 0 }]);
  await db.query('insert into push_prefs(user_id,reminder) values($1,false)', [teammate]);
  await finalize(id);
  expect((await db.query('select winning_option from formation_polls where match_id=$1', [id])).rows)
    .toEqual([{ winning_option: 1 }]);
  expect((await db.query("select user_id from push_due() where match_id=$1 and kind='formation_published'", [id])).rows)
    .toEqual([{ user_id: admin }]);
  await db.query('insert into push_prefs(user_id,enabled) values($1,false)', [admin]);
  expect((await db.query("select count(*)::integer as n from push_formation_published_due_at(now()) where match_id=$1", [id])).rows)
    .toEqual([{ n: 0 }]);
  await db.query('update push_prefs set enabled=true where user_id=$1', [admin]);
  await db.query('update push_prefs set reminder=true where user_id=$1', [teammate]);
  expect((await db.query("select user_id from push_formation_published_due_at(now()) where match_id=$1 order by user_id", [id])).rows)
    .toEqual([{ user_id: admin }, { user_id: teammate }]);
  await db.query("insert into push_sent(kind,match_id,user_id) values('formation_published',$1,$2)", [id, admin]);
  expect((await db.query("select user_id from push_formation_published_due_at(now()) where match_id=$1", [id])).rows)
    .toEqual([{ user_id: teammate }]);
});

test('la scelta vincente non genera anche una notifica di modifica programma', async () => {
  const id = await createPoll();
  await asUser(teammate);
  await db.query('select submit_formation_vote($1::uuid,2::smallint)', [id]);
  await finalize(id);
  expect((await db.query('select winning_option from formation_polls where match_id=$1', [id])).rows)
    .toEqual([{ winning_option: 2 }]);
  expect((await db.query('select count(*)::integer as n from push_program_changes where match_id=$1', [id])).rows)
    .toEqual([{ n: 2 }]);
  await db.query("update formation_polls set finalized_at=now()-interval '2 minutes' where match_id=$1", [id]);
  await db.query("update push_program_changes set changed_at=now()-interval '2 minutes' where match_id=$1", [id]);
  const { rows } = await db.query<{ kind: string }>('select kind from push_due() where match_id=$1', [id]);
  expect(rows.map((r) => r.kind)).toContain('formation_published');
  expect(rows.some((r) => r.kind.startsWith('change:'))).toBe(false);
});
