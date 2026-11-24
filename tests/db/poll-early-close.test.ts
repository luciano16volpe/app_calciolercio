// Punto 6: chiusura anticipata dei due sondaggi da parte dell'admin (voto ai giocatori e scelta delle formazioni).
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase } from './database';

const admin = '40000000-0000-4000-8000-000000000001';
const voter = '40000000-0000-4000-8000-000000000002';
const spectator = '40000000-0000-4000-8000-000000000003';
const league = '40000000-0000-4000-8000-000000000005';
const game = '40000000-0000-4000-8000-000000000010';
const players = [6, 7, 8, 9].map((n) => `40000000-0000-4000-8000-00000000000${n}`);
const matchDate = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
const options = [
  { team_a: [players[0], players[1]], team_b: [players[2], players[3]], metrics: { sA: 6, sB: 6 }, stats: Array(11).fill({ label: 'test', a: 6, b: 6 }), rank: 1 },
  { team_a: [players[0], players[2]], team_b: [players[1], players[3]], metrics: { sA: 6.1, sB: 6 }, stats: Array(11).fill({ label: 'test', a: 6.1, b: 6 }), rank: 2 },
];
// nei test tutto accade in una sola transazione: i job di notifica si interrogano «tra un minuto»
const later = "clock_timestamp()+interval '1 minute'";

let db: PGlite;
beforeAll(async () => { db = await createTestDatabase(); }, 60_000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec(`begin;
    insert into auth.users(id,email) values
      ('${admin}','admin-close@test.invalid'),('${voter}','voter-close@test.invalid'),('${spectator}','spectator-close@test.invalid');
    insert into leagues(id,name,owner_id,created_by) values ('${league}','Chiusura','${admin}','${admin}');
    insert into league_members(league_id,user_id,role) values
      ('${league}','${admin}','admin'),('${league}','${voter}','member'),('${league}','${spectator}','member');
    insert into players(id,name,user_id) values
      ('${players[0]}','Uno','${admin}'),('${players[1]}','Due','${voter}'),
      ('${players[2]}','Tre',null),('${players[3]}','Quattro',null);
    insert into league_players(league_id,player_id) values
      ('${league}','${players[0]}'),('${league}','${players[1]}'),('${league}','${players[2]}'),('${league}','${players[3]}');
    insert into push_subscriptions(user_id,endpoint,p256dh,auth)
      select id,'https://example.invalid/close-'||id::text,'test','test' from auth.users where id in ('${admin}','${voter}','${spectator}');
  `);
});
afterEach(async () => { await db.exec('rollback; reset role;'); });

async function asUser(id: string) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
  await db.exec('set local role authenticated');
}
async function asSystem() {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub','',true)");
}
/** Legge le tabelle riservate come sistema e poi rimette l'utente che stava agendo. */
async function asRoot<T>(read: () => Promise<T>): Promise<T> {
  const { rows } = await db.query<{ uid: string }>("select coalesce(current_setting('request.jwt.claim.sub', true), '') as uid");
  await db.exec('reset role');
  try { return await read(); } finally { if (rows[0]!.uid) await asUser(rows[0]!.uid); }
}
async function denied(run: () => Promise<unknown>, message: RegExp) {
  await db.exec('savepoint check_denied');
  await expect(run()).rejects.toThrow(message);
  await db.exec('rollback to savepoint check_denied');
}

// ── Voto ai giocatori ──────────────────────────────────────────────────────
async function openVote() {
  await db.exec(`
    insert into matches(id,league_id,date,score_a,score_b) values ('${game}','${league}','${matchDate}',3,2);
    insert into match_players(match_id,player_id,team,position) values
      ('${game}','${players[0]}','A',0),('${game}','${players[1]}','A',1),('${game}','${players[2]}','B',0),('${game}','${players[3]}','B',1);
    update community_vote_settings set started_at=now()-interval '1 hour',enabled_by='${admin}' where match_id='${game}';`);
}
const voteState = async () => (await db.query<{ s: Record<string, unknown> }>('select community_vote_state($1::uuid) as s', [game])).rows[0]!.s;
const settings = () => asRoot(async () => (await db.query<{ finalized_at: string | null; closed_early_by: string | null }>(
  'select finalized_at, closed_early_by from community_vote_settings where match_id=$1', [game])).rows[0]!);
const ratings = () => asRoot(async () => (await db.query<{ player_id: string; rating: string | null }>(
  'select player_id, rating::text from match_players where match_id=$1 order by position, team', [game])).rows);

test('voto: solo l’admin può chiudere e il comando è raggiungibile anche da chi non ha giocato o non può votare', async () => {
  await openVote();
  await asUser(voter);
  expect(await voteState()).toMatchObject({ can_close: false, is_open: true });
  await denied(() => db.query('select close_community_voting($1::uuid)', [game]), /Permesso negato/);
  await asUser(spectator);
  await denied(() => db.query('select close_community_voting($1::uuid)', [game]), /Permesso negato/);
  await asUser(admin);
  expect(await voteState()).toMatchObject({ can_close: true, can_vote: true });
  // un admin che non ha giocato può comunque chiudere
  await asSystem();
  await db.query('delete from match_players where match_id=$1 and player_id=$2', [game, players[0]]);
  await asUser(admin);
  expect(await voteState()).toMatchObject({ can_close: true, can_vote: false });
});

test('voto: la chiusura anticipata pubblica le medie una sola volta e blocca altri voti', async () => {
  await openVote();
  await asUser(voter);
  await db.query('select submit_community_votes($1::uuid,$2::jsonb)', [game, JSON.stringify([{ player_id: players[0], rating: 7.5 }, { player_id: players[2], rating: 6 }])]);
  expect(await ratings()).toEqual(expect.arrayContaining([{ player_id: players[0], rating: null }]));
  await asUser(admin);
  await db.query('select close_community_voting($1::uuid)', [game]);
  const first = await settings();
  expect(first.finalized_at).not.toBeNull();
  expect(first.closed_early_by).toBe(admin);
  expect((await ratings()).find((r) => r.player_id === players[0])?.rating).toBe('7.5');
  expect((await ratings()).find((r) => r.player_id === players[2])?.rating).toBe('6.0');
  expect(await voteState()).toMatchObject({ is_open: false, finalized: true, can_close: false, can_vote: false, closed_early_by_name: 'admin-close' });
  // doppio tocco: nessun effetto, stessa data di chiusura
  await db.query('select close_community_voting($1::uuid)', [game]);
  expect((await settings()).finalized_at).toEqual(first.finalized_at);
  // dopo la chiusura nessuno può più cambiare voto
  await asUser(voter);
  await denied(() => db.query('select submit_community_votes($1::uuid,$2::jsonb)', [game, JSON.stringify([{ player_id: players[0], rating: 1 }])]), /chiusa/);
  expect((await ratings()).find((r) => r.player_id === players[0])?.rating).toBe('7.5');
  // il job notturno non ripubblica
  await asSystem();
  expect((await db.query('select finalize_community_votes(clock_timestamp()+interval \'2 days\') as n')).rows).toEqual([{ n: 0 }]);
});

test('voto: senza voti la chiusura anticipata lascia le pagelle vuote e segna comunque la chiusura', async () => {
  await openVote();
  await asUser(admin);
  await db.query('select close_community_voting($1::uuid)', [game]);
  expect((await ratings()).every((r) => r.rating === null)).toBe(true);
  expect((await settings()).finalized_at).not.toBeNull();
});

test('voto: una votazione mai attivata non si chiude e la scadenza naturale resta valida', async () => {
  await db.exec(`insert into matches(id,league_id,date,score_a,score_b) values ('${game}','${league}','${matchDate}',1,0);`);
  await db.exec(`delete from community_vote_settings where match_id='${game}'`);
  await asUser(admin);
  await denied(() => db.query('select close_community_voting($1::uuid)', [game]), /non è attiva/);
  await asSystem();
  await db.exec(`insert into match_players(match_id,player_id,team,position) values ('${game}','${players[1]}','A',0);
    insert into community_vote_settings(match_id,started_at,enabled_by) values ('${game}',now()-interval '25 hours','${admin}');`);
  expect((await db.query('select finalize_community_votes() as n')).rows).toEqual([{ n: 1 }]);
  expect((await settings()).closed_early_by).toBeNull();
});

test('voto: l’avviso «votazione aperta» non parte dopo la chiusura e quello delle medie arriva una volta sola', async () => {
  await openVote();
  await asUser(voter);
  await db.query('select submit_community_votes($1::uuid,$2::jsonb)', [game, JSON.stringify([{ player_id: players[0], rating: 7 }])]);
  await asSystem();
  expect((await db.query(`select user_id from push_community_vote_due_at(now())`)).rows.length).toBeGreaterThan(0);
  await asUser(admin);
  await db.query('select close_community_voting($1::uuid)', [game]);
  await asSystem();
  expect((await db.query(`select user_id from push_community_vote_due_at(${later})`)).rows).toHaveLength(0);
  const due = await db.query<{ user_id: string }>(`select distinct user_id from push_community_vote_published_due_at(${later})`);
  expect(due.rows.map((r) => r.user_id)).toEqual(expect.arrayContaining([admin, voter]));
  expect(due.rows.map((r) => r.user_id)).not.toContain(spectator);
  await db.query("insert into push_sent(kind,match_id,user_id) select 'community_vote_published',$1,user_id from push_community_vote_published_due_at(" + later + ')', [game]);
  expect((await db.query(`select user_id from push_community_vote_published_due_at(${later})`)).rows).toHaveLength(0);
});

// ── Scelta delle formazioni ────────────────────────────────────────────────
async function createPoll() {
  await asUser(admin);
  const { rows } = await db.query<{ id: string }>('select create_match_with_formation_poll($1::jsonb,$2::jsonb) as id', [
    JSON.stringify({ league_id: league, date: matchDate, play_time: '21:00', place: 'Campo Sole' }), JSON.stringify(options)]);
  return rows[0]!.id;
}
const pollRow = (id: string) => asRoot(async () => (await db.query<{ finalized_at: string | null; winning_option: number | null; closed_early_by: string | null }>(
  'select finalized_at, winning_option, closed_early_by from formation_polls where match_id=$1', [id])).rows[0]!);
const teamA = (id: string) => asRoot(async () => (await db.query<{ player_id: string }>(
  "select player_id from match_players where match_id=$1 and team='A' order by position", [id])).rows.map((r) => r.player_id));

test('formazioni: solo l’admin chiude; la scelta più votata diventa definitiva subito e una sola volta', async () => {
  const id = await createPoll();
  await asUser(voter);
  await db.query('select submit_formation_vote($1::uuid,2::smallint)', [id]);
  expect((await db.query('select formation_poll_state($1::uuid) as s', [id])).rows[0]).toMatchObject({ s: { can_close: false, is_open: true } });
  await denied(() => db.query('select close_formation_poll($1::uuid)', [id]), /Permesso negato/);
  await asUser(spectator);
  await denied(() => db.query('select close_formation_poll($1::uuid)', [id]), /Permesso negato/);
  await asUser(admin);
  expect((await db.query('select formation_poll_state($1::uuid) as s', [id])).rows[0]).toMatchObject({ s: { can_close: true } });
  await db.query('select close_formation_poll($1::uuid)', [id]);
  const first = await pollRow(id);
  expect(first).toMatchObject({ winning_option: 2, closed_early_by: admin });
  expect(first.finalized_at).not.toBeNull();
  expect(await teamA(id)).toEqual([players[0], players[2]]);
  expect((await db.query('select formation_poll_state($1::uuid) as s', [id])).rows[0]).toMatchObject({
    s: { is_open: false, can_close: false, winning_option: 2, closed_early_by_name: 'admin-close' } });
  // doppio tocco: nessun cambiamento
  await db.query('select close_formation_poll($1::uuid)', [id]);
  expect(await pollRow(id)).toEqual(first);
  // dopo la chiusura nessuno può cambiare scelta
  await asUser(voter);
  await denied(() => db.query('select submit_formation_vote($1::uuid,1::smallint)', [id]), /Sondaggio chiuso/);
  expect((await pollRow(id)).winning_option).toBe(2);
  // il job a scadenza non rifinalizza
  await asSystem();
  await db.query("update formation_polls set closes_at=closes_at where match_id=$1", [id]);
  expect((await db.query("select finalize_formation_polls(clock_timestamp()+interval '2 days') as n")).rows).toEqual([{ n: 0 }]);
});

test('formazioni: senza voti, o in pareggio, resta la formazione dell’admin', async () => {
  const empty = await createPoll();
  await asUser(admin);
  await db.query('select close_formation_poll($1::uuid)', [empty]);
  expect(await pollRow(empty)).toMatchObject({ winning_option: 1, closed_early_by: admin });
  expect(await teamA(empty)).toEqual([players[0], players[1]]);
});

test('formazioni: i convocati ricevono l’avviso delle squadre definitive una volta sola, gli altri no', async () => {
  const id = await createPoll();
  await asUser(admin);
  await db.query('select close_formation_poll($1::uuid)', [id]);
  await asSystem();
  const due = await db.query<{ user_id: string; match_id: string }>(`select distinct user_id, match_id from push_formation_published_due_at(${later})`);
  expect(due.rows.map((r) => r.user_id).sort()).toEqual([admin, voter].sort());
  expect(due.rows.every((r) => r.match_id === id)).toBe(true);
  await db.query(`insert into push_sent(kind,match_id,user_id) select 'formation_published',match_id,user_id from push_formation_published_due_at(${later})`);
  expect((await db.query(`select user_id from push_formation_published_due_at(${later})`)).rows).toHaveLength(0);
});

test('registro attività: la chiusura anticipata resta scritta con chi l’ha fatta', async () => {
  const id = await createPoll();
  await asUser(admin);
  await db.query('select close_formation_poll($1::uuid)', [id]);
  await asSystem();
  const rows = (await db.query<{ action: string; actor_id: string }>("select action, actor_id from audit_log where action like '%close_early'")).rows;
  expect(rows).toEqual([{ action: 'formation_polls.close_early', actor_id: admin }]);
});
