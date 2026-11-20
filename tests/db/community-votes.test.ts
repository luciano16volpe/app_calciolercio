import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase } from './database';

const admin = '10000000-0000-4000-8000-000000000001';
const users = [1, 2, 3, 4].map((n) => `10000000-0000-4000-8000-00000000000${n + 1}`);
const players = [1, 2, 3, 4].map((n) => `10000000-0000-4000-8000-00000000001${n}`);
const league = '10000000-0000-4000-8000-000000000020';
const match = '10000000-0000-4000-8000-000000000030';
let db: PGlite;

beforeAll(async () => { db = await createTestDatabase(); }, 60_000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec(`begin;
    insert into auth.users(id,email) values
      ('${admin}','admin@test.invalid'),
      ('${users[0]}','u1@test.invalid'), ('${users[1]}','u2@test.invalid'),
      ('${users[2]}','u3@test.invalid'), ('${users[3]}','u4@test.invalid');
    insert into leagues(id,name,owner_id,created_by) values ('${league}','Voti','${admin}','${admin}');
    insert into league_members(league_id,user_id,role) values
      ('${league}','${admin}','admin'),
      ('${league}','${users[0]}','member'), ('${league}','${users[1]}','member'),
      ('${league}','${users[2]}','member');
    insert into players(id,name,created_by,user_id) values
      ('${players[0]}','Uno','${admin}','${users[0]}'),
      ('${players[1]}','Due','${admin}','${users[1]}'),
      ('${players[2]}','Tre','${admin}','${users[2]}'),
      ('${players[3]}','Admin giocatore','${admin}','${admin}');
    insert into league_players(league_id,player_id) values
      ('${league}','${players[0]}'), ('${league}','${players[1]}'),
      ('${league}','${players[2]}'), ('${league}','${players[3]}');
    insert into matches(id,league_id,date) values
      ('${match}','${league}',current_date);
    insert into match_players(match_id,player_id,team,position) values
      ('${match}','${players[0]}','A',0), ('${match}','${players[1]}','A',1),
      ('${match}','${players[2]}','B',0), ('${match}','${players[3]}','B',1);
    update matches set score_a=2,score_b=1 where id='${match}';
  `);
});
afterEach(async () => { await db.exec('rollback; reset role;'); });

async function asUser(id: string) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
  await db.exec('set local role authenticated');
}
async function fails(sql: string, args: unknown[], error: RegExp) {
  await db.exec('savepoint rejected');
  try { await expect(db.query(sql, args)).rejects.toThrow(error); }
  finally { await db.exec('rollback to savepoint rejected'); }
}
const activate = 'select enable_community_voting($1::uuid)';
const vote = 'select submit_community_votes($1::uuid,$2::jsonb)';
const ballot = (player: string, rating: number) => JSON.stringify([{ player_id: player, rating }]);

test('solo admin attiva; media, autovoto e modifiche dei voti', async () => {
  await asUser(users[0]!);
  await fails(activate, [match], /Permesso negato/);
  await asUser(admin);
  await db.query(activate, [match]);
  await asUser(users[0]!);
  await fails(vote, [match, ballot(players[0]!, 8)], /solo gli altri partecipanti/);
  await db.query(vote, [match, ballot(players[2]!, 7)]);
  await asUser(users[1]!);
  await db.query(vote, [match, ballot(players[2]!, 7.5)]);
  await asUser(admin);
  expect((await db.query('select rating from match_players where match_id=$1 and player_id=$2', [match, players[2]])).rows)
    .toEqual([{ rating: null }]);
  await asUser(users[0]!);
  await db.query(vote, [match, ballot(players[2]!, 8)]);
  await db.exec('reset role');
  await db.query("update community_vote_settings set started_at=now()-interval '25 hours' where match_id=$1", [match]);
  expect((await db.query('select finalize_community_votes() as completed')).rows).toEqual([{ completed: 1 }]);
  expect((await db.query('select rating from match_players where match_id=$1 and player_id=$2', [match, players[2]])).rows)
    .toEqual([{ rating: '7.8' }]);
  expect((await db.query('select finalize_community_votes() as completed')).rows).toEqual([{ completed: 0 }]);
});

test('alla chiusura scarta un minimo e un massimo solo con almeno cinque voti', async () => {
  const extraUsers = ['10000000-0000-4000-8000-000000000041', '10000000-0000-4000-8000-000000000042'];
  const extraPlayers = ['10000000-0000-4000-8000-000000000051', '10000000-0000-4000-8000-000000000052'];
  await db.exec(`
    insert into auth.users(id,email) values
      ('${extraUsers[0]}','extra1@test.invalid'), ('${extraUsers[1]}','extra2@test.invalid');
    insert into league_members(league_id,user_id,role) values
      ('${league}','${extraUsers[0]}','member'), ('${league}','${extraUsers[1]}','member');
    insert into players(id,name,created_by,user_id) values
      ('${extraPlayers[0]}','Extra uno','${admin}','${extraUsers[0]}'),
      ('${extraPlayers[1]}','Extra due','${admin}','${extraUsers[1]}');
    insert into league_players(league_id,player_id) values
      ('${league}','${extraPlayers[0]}'), ('${league}','${extraPlayers[1]}');
    insert into match_players(match_id,player_id,team,position) values
      ('${match}','${extraPlayers[0]}','A',2), ('${match}','${extraPlayers[1]}','B',2);
  `);
  await asUser(admin);
  await db.query(activate, [match]);

  for (const [voter, rating] of [
    [users[0], 1], [users[1], 7], [admin, 7.5], [extraUsers[0], 8], [extraUsers[1], 10],
  ] as const) {
    await asUser(voter!);
    await db.query(vote, [match, ballot(players[2]!, rating)]);
  }
  for (const [voter, rating] of [
    [users[0], 1], [users[2], 7], [admin, 8], [extraUsers[0], 10],
  ] as const) {
    await asUser(voter!);
    await db.query(vote, [match, ballot(players[1]!, rating)]);
  }

  await db.exec('reset role');
  await db.query("update community_vote_settings set started_at=now()-interval '25 hours' where match_id=$1", [match]);
  await db.query('select finalize_community_votes()');
  const { rows } = await db.query<{ player_id: string; rating: string }>(
    'select player_id,rating from match_players where match_id=$1 and player_id in ($2,$3) order by player_id',
    [match, players[1], players[2]]);
  expect(rows).toEqual([
    { player_id: players[1], rating: '6.5' },
    { player_id: players[2], rating: '7.5' },
  ]);
});

test('solo partecipanti della lega; scadenza dall’apertura; pagelle admin non cancellano la media', async () => {
  await asUser(admin);
  await db.query(activate, [match]);
  await asUser(users[3]!);
  await fails(vote, [match, ballot(players[0]!, 7)], /Non fai parte della lega/);
  await asUser(users[0]!);
  await db.query(vote, [match, ballot(players[1]!, 8)]);
  await asUser(admin);
  await db.query('select save_match_ratings($1::uuid,$2::jsonb)', [match, JSON.stringify([
    { player_id: players[1], rating: 5, goals: 2, assist: 0, autogol: 0, meta: 0, rigori_sbagliati: 0, titolo: '', descrizione: '', write_text: false },
  ])]);
  expect((await db.query('select rating,goals from match_players where match_id=$1 and player_id=$2', [match, players[1]])).rows)
    .toEqual([{ rating: null, goals: 2 }]);
  await db.exec('reset role');
  await db.query("update community_vote_settings set started_at=now()-interval '25 hours' where match_id=$1", [match]);
  await asUser(users[1]!);
  await fails(vote, [match, ballot(players[0]!, 7)], /chiusa/);
  await db.exec('reset role');
  await db.query('select finalize_community_votes()');
  expect((await db.query('select rating,goals from match_players where match_id=$1 and player_id=$2', [match, players[1]])).rows)
    .toEqual([{ rating: '8.0', goals: 2 }]);
});

test('l’admin può aprire il voto anche oltre 24 ore dal risultato', async () => {
  await db.query("update match_stamps set result_at=now()-interval '25 hours' where match_id=$1", [match]);
  await asUser(admin);
  const before = await db.query<{ state: { can_activate: boolean } }>(
    'select community_vote_state($1::uuid) as state', [match]);
  expect(before.rows[0]!.state.can_activate).toBe(true);
  await db.query(activate, [match]);
  await db.exec('reset role');
  const { rows } = await db.query<{ started_at: Date; result_at: Date; hours: number }>(`
    select c.started_at,s.result_at,extract(epoch from (c.started_at + interval '24 hours' - c.started_at))/3600 as hours
      from community_vote_settings c join match_stamps s on s.match_id=c.match_id where c.match_id=$1`, [match]);
  expect(rows[0]!.started_at.getTime()).toBeGreaterThan(rows[0]!.result_at.getTime());
  expect(Number(rows[0]!.hours)).toBe(24);
});

test('non attivabile se esiste già un voto editoriale', async () => {
  await db.query('update match_players set rating=7 where match_id=$1 and player_id=$2', [match, players[0]]);
  await asUser(admin);
  await fails(activate, [match], /redazione/);
});

test('una correzione del risultato non sposta la scadenza', async () => {
  await asUser(admin);
  await db.query(activate, [match]);
  await db.exec('reset role');
  const before = (await db.query<{ started_at: Date }>('select started_at from community_vote_settings where match_id=$1', [match])).rows[0]!.started_at;
  await asUser(admin);
  await db.query('update matches set score_a=3 where id=$1', [match]);
  await db.exec('reset role');
  const after = (await db.query<{ started_at: Date }>('select started_at from community_vote_settings where match_id=$1', [match])).rows[0]!.started_at;
  expect(after).toEqual(before);
});

test('l’admin che ha giocato vota gli altri ma non se stesso', async () => {
  await asUser(admin);
  await db.query(activate, [match]);
  const { rows } = await db.query<{ state: { can_vote: boolean; my_player_id: string } }>(
    'select community_vote_state($1::uuid) as state', [match]);
  expect(rows[0]!.state.can_vote).toBe(true);
  expect(rows[0]!.state.my_player_id).toBe(players[3]);
  await fails(vote, [match, ballot(players[3]!, 9)], /solo gli altri partecipanti/);
  await db.query(vote, [match, ballot(players[0]!, 8)]);
  expect((await db.query('select rating from match_players where match_id=$1 and player_id=$2', [match, players[0]])).rows)
    .toEqual([{ rating: null }]);
});

test('il partecipante cambia solo il voto, anche se invia campi statistici extra', async () => {
  await db.query(`update match_players set goals=2,assist=1,autogol=1,meta=3,rigori_sbagliati=1,
    titolo='Titolo admin',descrizione='Testo admin' where match_id=$1 and player_id=$2`, [match, players[1]]);
  const sql = `select goals,assist,autogol,meta,rigori_sbagliati,titolo,descrizione
    from match_players where match_id=$1 and player_id=$2`;
  const before = (await db.query(sql, [match, players[1]])).rows;
  await asUser(admin);
  await db.query(activate, [match]);
  await asUser(users[0]!);
  await db.query(vote, [match, JSON.stringify([{
    player_id: players[1], rating: 8, goals: 20, assist: 20, autogol: 20,
    meta: 20, rigori_sbagliati: 20, titolo: 'Alterato', descrizione: 'Alterata',
  }])]);
  await db.exec('reset role');
  expect((await db.query(sql, [match, players[1]])).rows).toEqual(before);
  expect((await db.query('select rating from match_players where match_id=$1 and player_id=$2', [match, players[1]])).rows)
    .toEqual([{ rating: null }]);
  await db.query("update community_vote_settings set started_at=now()-interval '25 hours' where match_id=$1", [match]);
  await db.query('select finalize_community_votes()');
  expect((await db.query(sql, [match, players[1]])).rows).toEqual(before);
  expect((await db.query('select rating from match_players where match_id=$1 and player_id=$2', [match, players[1]])).rows)
    .toEqual([{ rating: '8.0' }]);
});

test('solo admin legge i voti individuali tramite il tasto della partita', async () => {
  await asUser(admin);
  await db.query(activate, [match]);
  await asUser(users[0]!);
  await db.query(vote, [match, ballot(players[1]!, 7.5)]);
  await fails('select community_vote_details($1::uuid)', [match], /Permesso negato/);
  await fails('select * from community_votes where match_id=$1', [match], /permission denied/);
  await asUser(users[1]!);
  await fails('select community_vote_details($1::uuid)', [match], /Permesso negato/);
  await asUser(admin);
  const { rows } = await db.query<{ details: { voter_name: string; target_name: string; rating: number }[] }>(
    'select community_vote_details($1::uuid) as details', [match]);
  expect(rows[0]!.details).toEqual([{ voter_name: 'Uno', target_name: 'Due', rating: 7.5 }]);
});

test('apertura del voto: push ai partecipanti attivi, una volta sola e non dopo la scadenza', async () => {
  await db.query(`insert into push_subscriptions(user_id,endpoint,p256dh,auth) values
    ($1,'https://example.invalid/admin','p','a'),
    ($2,'https://example.invalid/uno','p','a'),
    ($3,'https://example.invalid/due','p','a'),
    ($4,'https://example.invalid/tre','p','a'),
    ($5,'https://example.invalid/estraneo','p','a')`, [admin, ...users]);
  await db.query('insert into push_prefs(user_id,ratings) values($1,false)', [users[1]]);
  await db.query('insert into push_prefs(user_id,enabled) values($1,false)', [users[2]]);
  const due = `select user_id from push_community_vote_due_at($1::timestamptz) where match_id=$2 order by user_id`;
  const openedAt = (await db.query<{ now: Date }>('select now() as now')).rows[0]!.now;
  expect((await db.query(due, [new Date(openedAt.getTime() + 1000), match])).rows).toEqual([]);
  await asUser(admin);
  await db.query(activate, [match]);
  await fails(due, [new Date(openedAt.getTime() + 1000), match], /permission denied/);
  await db.exec('reset role');
  expect((await db.query(due, [new Date(openedAt.getTime() + 1000), match])).rows)
    .toEqual([{ user_id: admin }, { user_id: users[0] }]);
  expect((await db.query("select user_id from push_due() where kind='community_vote_open' and match_id=$1 order by user_id", [match])).rows)
    .toEqual([{ user_id: admin }, { user_id: users[0] }]);
  await db.exec('set local role service_role');
  expect((await db.query("select user_id from push_due() where kind='community_vote_open' and match_id=$1 order by user_id", [match])).rows)
    .toEqual([{ user_id: admin }, { user_id: users[0] }]);
  await db.exec('reset role');
  await db.query("insert into push_sent(kind,match_id,user_id) values('community_vote_open',$1,$2)", [match, admin]);
  expect((await db.query(due, [new Date(openedAt.getTime() + 1000), match])).rows)
    .toEqual([{ user_id: users[0] }]);
  expect((await db.query(due, [new Date(openedAt.getTime() + 25 * 3600_000), match])).rows).toEqual([]);
});

test('migrazione: ritira le medie anticipate senza perdere i voti e le pubblica alla chiusura', async () => {
  const oldDb = await createTestDatabase('20261211000000_notifica_apertura_voti.sql');
  try {
    await oldDb.exec(`
      insert into auth.users(id,email) values ('${admin}','admin@test.invalid'),('${users[0]}','uno@test.invalid');
      insert into leagues(id,name,owner_id,created_by) values ('${league}','Voti','${admin}','${admin}');
      insert into league_members(league_id,user_id,role) values
        ('${league}','${admin}','admin'),('${league}','${users[0]}','member');
      insert into players(id,name,user_id) values
        ('${players[0]}','Uno','${users[0]}'),('${players[3]}','Admin','${admin}');
      insert into league_players(league_id,player_id) values
        ('${league}','${players[0]}'),('${league}','${players[3]}');
      insert into matches(id,league_id,date,score_a,score_b) values ('${match}','${league}',current_date,1,0);
      insert into match_players(match_id,player_id,team,position,rating) values
        ('${match}','${players[0]}','A',0,null),('${match}','${players[3]}','B',0,7);
      insert into community_vote_settings(match_id,started_at,enabled_by) values
        ('${match}',now()-interval '1 hour','${admin}');
      insert into community_votes(match_id,voter_user_id,target_player_id,rating) values
        ('${match}','${users[0]}','${players[3]}',7);
    `);
    await oldDb.exec(readFileSync('supabase/migrations/20261212000000_pubblica_voti_alla_chiusura.sql', 'utf8'));
    expect((await oldDb.query('select rating from match_players where match_id=$1 and player_id=$2', [match, players[3]])).rows)
      .toEqual([{ rating: null }]);
    expect((await oldDb.query('select rating from community_votes where match_id=$1', [match])).rows)
      .toEqual([{ rating: '7.0' }]);
    await oldDb.query("update community_vote_settings set started_at=now()-interval '25 hours' where match_id=$1", [match]);
    expect((await oldDb.query('select finalize_community_votes() as completed')).rows).toEqual([{ completed: 1 }]);
    expect((await oldDb.query('select rating from match_players where match_id=$1 and player_id=$2', [match, players[3]])).rows)
      .toEqual([{ rating: '7.0' }]);
  } finally { await oldDb.close(); }
}, 60_000);
