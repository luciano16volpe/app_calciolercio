import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase } from './database';

const admin = '00000000-0000-4000-8000-000000000001';
const editor = '00000000-0000-4000-8000-000000000002';
const member = '00000000-0000-4000-8000-000000000003';
const otherAdmin = '00000000-0000-4000-8000-000000000004';
const league = '00000000-0000-4000-8000-000000000011';
const otherLeague = '00000000-0000-4000-8000-000000000012';
const p1 = '00000000-0000-4000-8000-000000000021';
const p2 = '00000000-0000-4000-8000-000000000022';
const outsider = '00000000-0000-4000-8000-000000000023';
const match = '00000000-0000-4000-8000-000000000031';
let db: PGlite;

beforeAll(async () => { db = await createTestDatabase(); }, 60_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`begin;
    insert into auth.users(id, email) values
      ('${admin}', 'admin@example.invalid'), ('${editor}', 'editor@example.invalid'),
      ('${member}', 'member@example.invalid'), ('${otherAdmin}', 'other@example.invalid');
    insert into leagues(id, name, owner_id, created_by) values
      ('${league}', 'Atomic Saves', '${admin}', '${admin}'),
      ('${otherLeague}', 'Other League', '${otherAdmin}', '${otherAdmin}');
    insert into league_members(league_id, user_id, role) values
      ('${league}', '${admin}', 'admin'), ('${league}', '${editor}', 'redazione'),
      ('${league}', '${member}', 'member'), ('${otherLeague}', '${otherAdmin}', 'admin')
      on conflict (league_id, user_id) do update set role = excluded.role;
    insert into players(id, name, created_by) values
      ('${p1}', 'Uno', '${admin}'), ('${p2}', 'Due', '${admin}'), ('${outsider}', 'Altro', '${otherAdmin}');
    insert into league_players(league_id, player_id) values
      ('${league}', '${p1}'), ('${league}', '${p2}'), ('${otherLeague}', '${outsider}');
    insert into matches(id, league_id, date, score_a, score_b, play_time, place)
      values ('${match}', '${league}', '2026-10-28', 2, 1, '21:00', 'Campo');
    insert into match_players(match_id, player_id, team, position, rating, goals, titolo, descrizione) values
      ('${match}', '${p1}', 'A', 0, 6, 1, 'Originale', 'Testo originale'),
      ('${match}', '${p2}', 'B', 0, 7, 0, 'Secondo', 'Altro testo');
  `);
});
afterEach(async () => { await db.exec('rollback; reset role;'); });

async function asUser(id: string | null) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [id ?? '']);
  await db.exec(`set local role ${id ? 'authenticated' : 'anon'}`);
}
async function snapshot() {
  await db.exec('reset role');
  return (await db.query(`select
    (select jsonb_agg(to_jsonb(t) order by id) from players t) as players,
    (select jsonb_agg(to_jsonb(t) order by league_id, player_id) from league_players t) as roster,
    (select jsonb_agg(to_jsonb(t) order by id) from matches t) as matches,
    (select jsonb_agg(to_jsonb(t) order by match_id, player_id) from match_players t) as ratings,
    (select jsonb_agg(to_jsonb(t) order by match_id) from match_editors t) as editors,
    (select jsonb_agg(to_jsonb(t) order by id) from audit_log t) as audit`)).rows;
}
async function fails(sql: string, args: unknown[], message: RegExp) {
  await db.exec('savepoint failed_command');
  try { await expect(db.query(sql, args)).rejects.toThrow(message); }
  finally { await db.exec('rollback to savepoint failed_command'); }
}
const matchData = { league_id: league, date: '2026-11-01', play_time: '20:00', place: 'Campo Sole', notes: '', score_a: null, score_b: null, pred: 0.5, pred_rank: 1 };
const row = (id = p1, extra: Record<string, unknown> = {}) => ({
  player_id: id, rating: 8, goals: 2, assist: 0, autogol: 0, meta: 0, rigori_sbagliati: 0,
  titolo: 'Nuovo', descrizione: 'Nuovo testo', write_text: true, ...extra,
});
const createMatchSql = 'select create_match_with_teams($1::jsonb, $2::uuid[], $3::uuid[]) as id';
const ratingsSql = 'select save_match_ratings($1::uuid, $2::jsonb, $3::jsonb, $4::uuid[])';
const textsSql = 'select save_match_texts($1::uuid, $2::jsonb)';
const playerSql = 'select create_player_in_league($1::uuid, $2::text) as id';

// Ogni test usa tutte le migrazioni del progetto, incluse RLS, audit e firma della redazione.
test('crea partita e squadre con posizioni e previsioni', async () => {
  await asUser(admin);
  const { rows } = await db.query<{ id: string }>(createMatchSql, [JSON.stringify(matchData), [p1], [p2]]);
  const id = rows[0]!.id;
  expect((await db.query('select player_id, team, position from match_players where match_id = $1 order by team', [id])).rows)
    .toEqual([{ player_id: p1, team: 'A', position: 0 }, { player_id: p2, team: 'B', position: 0 }]);
  expect((await db.query('select place, pred_rank from matches where id = $1', [id])).rows).toEqual([{ place: 'Campo Sole', pred_rank: 1 }]);
});

test('un duplicato nelle squadre annulla partita, convocazioni e audit', async () => {
  const before = await snapshot();
  await asUser(admin);
  await fails(createMatchSql, [JSON.stringify(matchData), [p1], [p1]], /duplicate key/);
  expect(await snapshot()).toEqual(before);
});

test('rifiuta squadre vuote e giocatori fuori rosa', async () => {
  const before = await snapshot();
  await asUser(admin);
  await fails(createMatchSql, [JSON.stringify(matchData), [], [p2]], /non vuote/);
  await fails(createMatchSql, [JSON.stringify(matchData), [p1], [outsider]], /solo giocatori della rosa/);
  expect(await snapshot()).toEqual(before);
});

test('crea giocatore e appartenenza con i valori iniziali consueti', async () => {
  await asUser(admin);
  const { rows } = await db.query<{ id: string }>(playerSql, [league, '  Marco  ']);
  const id = rows[0]!.id;
  expect((await db.query('select name, roles, stats, created_by from players where id = $1', [id])).rows)
    .toEqual([{ name: 'Marco', roles: ['MED'], stats: Array(11).fill(5), created_by: admin }]);
  expect((await db.query('select player_id from league_players where league_id = $1 and player_id = $2', [league, id])).rows).toHaveLength(1);
});

test('un errore di inserimento in rosa annulla anche giocatore e audit', async () => {
  await db.exec(`create function pg_temp.reject_roster() returns trigger language plpgsql as
    $$ begin raise exception 'Errore rosa simulato'; end $$;
    create trigger test_reject_roster before insert on league_players for each row execute function pg_temp.reject_roster();`);
  const before = await snapshot();
  await asUser(admin);
  await fails(playerSql, [league, 'Marco'], /Errore rosa simulato/);
  expect(await snapshot()).toEqual(before);
});

test('salva pagelle e intestazione insieme, preservando testi non toccati', async () => {
  await asUser(admin);
  const header = { score_a: 9, score_b: 3, notes: 'Note', play_time: '20:00', place: 'Nuovo campo' };
  await db.query(ratingsSql, [match, JSON.stringify([row(p1, { write_text: false }), row(p2)]), JSON.stringify(header), [p1]]);
  expect((await db.query('select rating::float, goals, titolo, descrizione from match_players where match_id = $1 and player_id = $2', [match, p1])).rows)
    .toEqual([{ rating: 8, goals: 2, titolo: 'Originale', descrizione: 'Testo originale' }]);
  expect((await db.query('select score_a, score_b, place from matches where id = $1', [match])).rows)
    .toEqual([{ score_a: 9, score_b: 3, place: 'Nuovo campo' }]);
});

test('senza intestazione conserva risultato, note, ora e luogo', async () => {
  await asUser(admin);
  const before = (await db.query('select score_a, score_b, notes, play_time, place from matches where id = $1', [match])).rows;
  await db.query(ratingsSql, [match, JSON.stringify([row(p1), row(p2)]), null, []]);
  expect((await db.query('select score_a, score_b, notes, play_time, place from matches where id = $1', [match])).rows).toEqual(before);
});

test('errore nell intestazione annulla voti, testi, firma, notifiche e audit', async () => {
  const before = await snapshot();
  await asUser(admin);
  await fails(ratingsSql, [match, JSON.stringify([row(p1), row(p2)]), JSON.stringify({ score_a: 100, score_b: 3 }), []], /matches_score_a_check/);
  expect(await snapshot()).toEqual(before);
});

test('un voto non valido nella seconda pagella annulla anche la prima', async () => {
  const before = await snapshot();
  await asUser(admin);
  await fails(ratingsSql, [match, JSON.stringify([row(p1), row(p2, { rating: 11 })]), null, []], /match_players_rating_check/);
  expect(await snapshot()).toEqual(before);
});

test('chi non ha voto viene azzerato, con testi conservati solo se non toccati', async () => {
  await asUser(admin);
  await db.query(ratingsSql, [match, JSON.stringify([row(p1)]), null, [p2]]);
  expect((await db.query('select rating, goals, titolo from match_players where match_id = $1 and player_id = $2', [match, p2])).rows)
    .toEqual([{ rating: null, goals: 0, titolo: 'Secondo' }]);
  await db.query(ratingsSql, [match, JSON.stringify([row(p1)]), null, []]);
  expect((await db.query('select titolo, descrizione from match_players where match_id = $1 and player_id = $2', [match, p2])).rows)
    .toEqual([{ titolo: null, descrizione: null }]);
});

test('rifiuta pagelle duplicate o di giocatori estranei senza modifiche', async () => {
  const before = await snapshot();
  await asUser(admin);
  for (const rows of [[row(p1), row(p1)], [row(outsider)]]) {
    await fails(ratingsSql, [match, JSON.stringify(rows), null, []], /duplicato o non presente/);
  }
  expect(await snapshot()).toEqual(before);
});

test('redazione salva testi in blocco e non puo cambiare voti ne risultato', async () => {
  await asUser(editor);
  await db.query(textsSql, [match, JSON.stringify([{ player_id: p1, titolo: 'Redazione', descrizione: 'Testo', rating: 10, goals: 99 }])]);
  expect((await db.query('select rating::float, goals, titolo from match_players where match_id = $1 and player_id = $2', [match, p1])).rows)
    .toEqual([{ rating: 6, goals: 1, titolo: 'Redazione' }]);
  expect((await db.query('select score_a from matches where id = $1', [match])).rows).toEqual([{ score_a: 2 }]);
  await fails(ratingsSql, [match, JSON.stringify([row(p1)]), null, []], /permesso negato/);
});

test('un testo per giocatore inesistente annulla anche i testi precedenti e firma', async () => {
  const before = await snapshot();
  await asUser(editor);
  await fails(textsSql, [match, JSON.stringify([{ player_id: p1, titolo: 'Modificato' }, { player_id: outsider, titolo: 'No' }])], /non presente/);
  expect(await snapshot()).toEqual(before);
});

test('testi duplicati sono rifiutati', async () => {
  const before = await snapshot();
  await asUser(editor);
  await fails(textsSql, [match, JSON.stringify([{ player_id: p1 }, { player_id: p1 }])], /duplicato/);
  expect(await snapshot()).toEqual(before);
});

for (const [name, user] of [['membro', member], ['amministratore di altra lega', otherAdmin]] as const) {
  test(`${name}: tutti i comandi sono negati senza scritture`, async () => {
    const before = await snapshot();
    await asUser(user);
    await fails(createMatchSql, [JSON.stringify(matchData), [p1], [p2]], /Permesso negato/);
    await fails(playerSql, [league, 'Marco'], /Permesso negato/);
    await fails(ratingsSql, [match, JSON.stringify([row(p1)]), null, []], /permesso negato/);
    await fails(textsSql, [match, JSON.stringify([{ player_id: p1, titolo: 'No' }])], /permesso negato/);
    expect(await snapshot()).toEqual(before);
  });
}

test('redazione non puo creare giocatori o partite', async () => {
  const before = await snapshot();
  await asUser(editor);
  await fails(createMatchSql, [JSON.stringify(matchData), [p1], [p2]], /Permesso negato/);
  await fails(playerSql, [league, 'Marco'], /Permesso negato/);
  expect(await snapshot()).toEqual(before);
});

test('senza accesso nessun comando e eseguibile', async () => {
  await asUser(null);
  for (const [sql, args] of [
    [createMatchSql, [JSON.stringify(matchData), [p1], [p2]]],
    [playerSql, [league, 'Marco']], [ratingsSql, [match, '[]', null, []]], [textsSql, [match, '[]']],
  ] as const) await fails(sql, [...args], /permission denied for function/);
});
