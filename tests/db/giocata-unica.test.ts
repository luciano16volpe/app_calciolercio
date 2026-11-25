// Giocata unica: 1-X-2 (3 punti), risultato esatto (5 punti) e i pronostici sui giocatori contano nello stesso punteggio.
import { afterAll, beforeAll, beforeEach, afterEach, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase } from './database';

const id = (n: number) => `50000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const league = id(1), game = id(2);
const users = { adm: id(10), c: id(11), d: id(12), e: id(13), f: id(14), g: id(15) };
const pl = { adm: id(20), c: id(21), d: id(22), e: id(23), f: id(24), g: id(25), t: id(26) };

let db: PGlite;
beforeAll(async () => { db = await createTestDatabase(); }, 90_000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec(`begin;
    insert into auth.users(id,email) values ${Object.values(users).map((u, i) => `('${u}','u${i}@test.invalid')`).join(',')};
    insert into leagues(id,name,owner_id,created_by) values ('${league}','Giocata','${users.adm}','${users.adm}');
    insert into advanced_prediction_league_settings(league_id,enabled) values ('${league}',true);
    insert into players(id,name,user_id) values
      ('${pl.adm}','Admin','${users.adm}'),('${pl.c}','Ce','${users.c}'),('${pl.d}','De','${users.d}'),
      ('${pl.e}','E','${users.e}'),('${pl.f}','Effe','${users.f}'),('${pl.g}','Gi','${users.g}'),('${pl.t}','Bersaglio',null);
    insert into league_players(league_id,player_id) select '${league}',id from players;
    insert into matches(id,league_id,date,play_time,score_a,score_b) values ('${game}','${league}',current_date-1,'20:00',3,2);
    insert into advanced_prediction_stat_confirmations(match_id) values ('${game}');
    insert into advanced_prediction_match_rules(match_id,configuration_version,rules_snapshot)
      select '${game}',version,rules from advanced_prediction_configurations where version=4;
  `);
});
afterEach(async () => { await db.exec('rollback'); });

const summary = async (player: string) => (await db.query<{ won: number; lost: number; base: number; mult: number; fin: number }>(
  `select won_count as won,lost_count as lost,base_units as base,multiplier_basis_points as mult,final_units::int as fin
   from advanced_prediction_match_summaries where match_id=$1 and predictor_player_id=$2`, [game, player])).rows[0];

test('le regole nuove prevedono i punti della giocata e il moltiplicatore a 7 elementi', async () => {
  const { rows } = await db.query<{ r: { matchPoints: { outcome: number; exact: number }; maxAssignments: number; multipliers: { wins: number }[] } }>(
    'select rules as r from advanced_prediction_configurations where version=4');
  expect(rows[0]!.r.matchPoints).toEqual({ outcome: 3, exact: 5 });
  expect(rows[0]!.r.maxAssignments).toBe(5);
  expect(rows[0]!.r.multipliers.map((t) => t.wins)).toEqual([7, 6, 5, 3]);
});

test('1-X-2 e risultato esatto si sommano e sbagliare non toglie punti', async () => {
  await db.exec(`insert into match_predictions(match_id,user_id,outcome,score_a,score_b) values
    ('${game}','${users.c}','1',3,2),   -- esito giusto + esatto giusto
    ('${game}','${users.d}','1',4,0),   -- esito giusto, esatto sbagliato
    ('${game}','${users.e}','2',null,null); -- esito sbagliato, niente esatto
    select advanced_prediction_reconcile('${game}','[]'::jsonb);`);
  expect(await summary(pl.c)).toEqual({ won: 2, lost: 0, base: 80000, mult: 10000, fin: 80000 });
  expect(await summary(pl.d)).toEqual({ won: 1, lost: 1, base: 30000, mult: 10000, fin: 30000 });
  expect(await summary(pl.e)).toEqual({ won: 0, lost: 1, base: 0, mult: 10000, fin: 0 });
  expect(await summary(pl.g)).toBeUndefined(); // senza giocata nessuna riga
});

test('1-X-2, esatto e 3 pronostici sui giocatori: contano per il moltiplicatore (5 su 5 = x1,5)', async () => {
  const rules = (await db.query<{ r: unknown }>('select rules_snapshot as r from advanced_prediction_match_rules where match_id=$1', [game])).rows[0]!.r;
  await db.exec(`insert into match_predictions(match_id,user_id,outcome,score_a,score_b) values ('${game}','${users.f}','1',3,2);
    insert into advanced_prediction_generations(match_id,predictor_player_id,assignment_count) values ('${game}','${pl.f}',3);`);
  for (let i = 1; i <= 3; i += 1) {
    await db.query(`insert into advanced_prediction_assignments(league_id,match_id,season_key,predictor_player_id,target_player_id,template_id,
        template_code,template_version,category,description,condition_snapshot,parameters_snapshot,configuration_version,rules_snapshot,
        difficulty,weight,estimation_method,selected_at,status)
      values ($1,$2,'2026-AUT',$3,$4,$5::smallint,'T'||$5::smallint::text,1,'GOALS','prova','{}'::jsonb,'{}'::jsonb,4,$6::jsonb,'COMMON',1,'DEFAULT',now(),'SELECTED')`,
    [league, game, pl.f, pl.t, i, JSON.stringify(rules)]);
  }
  const results = (await db.query<{ i: string }>('select id as i from advanced_prediction_assignments where match_id=$1', [game])).rows
    .map((r) => ({ assignment_id: r.i, outcome: 'WON', reason: 'prova' }));
  await db.query('select advanced_prediction_reconcile($1::uuid,$2::jsonb)', [game, JSON.stringify(results)]);
  // 3 punti (esito) + 5 (esatto) + 3 giocatori da 1 punto = 11; 5 indovinati su 5 → x1,5
  expect(await summary(pl.f)).toEqual({ won: 5, lost: 0, base: 110000, mult: 15000, fin: 165000 });
});

test('le partite con le vecchie regole non contano 1-X-2 ed esatto', async () => {
  await db.exec(`update advanced_prediction_match_rules set configuration_version=2,
      rules_snapshot=(select rules from advanced_prediction_configurations where version=2) where match_id='${game}';
    insert into match_predictions(match_id,user_id,outcome,score_a,score_b) values ('${game}','${users.c}','1',3,2);
    select advanced_prediction_reconcile('${game}','[]'::jsonb);`);
  expect(await summary(pl.c)).toBeUndefined();
});
