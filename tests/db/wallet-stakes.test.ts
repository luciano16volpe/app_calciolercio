import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase } from './database';

const id = (n: number) => `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = id(1), bettor = id(2), outsider = id(3), league = id(10), match = id(20);
const player = id(30), target = id(31), assignment = id(40);
let db: PGlite;

beforeAll(async () => { db = await createTestDatabase(); }, 90_000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec(`begin;
    insert into auth.users(id,email) values ('${owner}','owner@test.invalid'),('${bettor}','bettor@test.invalid'),('${outsider}','other@test.invalid');
    insert into leagues(id,name,owner_id,created_by) values ('${league}','Bet','${owner}','${owner}');
    insert into league_members(league_id,user_id,role) values ('${league}','${owner}','admin'),('${league}','${bettor}','member');
    insert into advanced_prediction_league_settings(league_id,enabled) values ('${league}',true);
    insert into players(id,name,user_id) values ('${player}','Scommettitore','${bettor}'),('${target}','Bersaglio','${owner}');
    insert into league_players(league_id,player_id) values ('${league}','${player}'),('${league}','${target}');
    insert into matches(id,league_id,date,play_time,betting_enabled) values ('${match}','${league}',current_date+2,'21:00',true);
    insert into match_players(match_id,player_id,team,position) values ('${match}','${target}','A',0);
    insert into advanced_prediction_assignments(id,league_id,match_id,season_key,predictor_player_id,target_player_id,
      template_id,template_code,template_version,category,description,condition_snapshot,parameters_snapshot,
      configuration_version,rules_snapshot,difficulty,weight,estimation_method)
      select '${assignment}','${league}','${match}','2026-AUT','${player}','${target}',1,'TEST',1,'GOALS','Prova',
        '{}'::jsonb,'{}'::jsonb,version,rules,'COMMON',1,'DEFAULT'
      from advanced_prediction_configurations where version=5;`);
});
afterEach(async () => { await db.exec('rollback; reset role;'); });

async function asUser(user = bettor) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
  await db.exec('set local role authenticated');
}
const balance = async () => (await db.query<{ s: { balance: number } }>(
  'select wallet_state($1::uuid) as s', [league])).rows[0]!.s.balance;
const stakeCount = async () => {
  await db.exec('reset role');
  return (await db.query<{ n: number }>(
    'select count(*)::int as n from wallet_stakes where match_id=$1 and user_id=$2', [match,bettor])).rows[0]!.n;
};
const save = async (outcome: string | null, a: number | null = null, b: number | null = null) =>
  db.query('select save_match_prediction($1::uuid,$2::text,$3::smallint,$4::smallint)', [match,outcome,a,b]);
const select = async (chosen: boolean) => db.query('select advanced_prediction_select($1::uuid,$2::boolean)', [assignment,chosen]);

test('1-X-2 ed esatto costano uno ciascuno; correzioni gratuite, cancellazioni rimborsate', async () => {
  await asUser();
  await db.query('select wallet_state($1::uuid)', [league]);
  await save('1');
  expect(await balance()).toBe(49);
  await save('X');
  expect(await balance()).toBe(49);
  await save('1',2,1);
  expect(await balance()).toBe(48);
  await save('1',3,2);
  expect(await balance()).toBe(48);
  await save('1');
  expect(await balance()).toBe(49);
  await save(null);
  await save(null);
  expect(await balance()).toBe(50);
  expect(await stakeCount()).toBe(0);
  expect((await db.query("select kind,amount from wallet_transactions where kind in ('STAKE','REFUND') order by created_at,id")).rows).toHaveLength(4);
});

test('ogni pronostico sui giocatori costa uno, senza doppio addebito', async () => {
  await asUser();
  await select(true);
  expect(await balance()).toBe(49);
  await select(true);
  expect(await balance()).toBe(49);
  await select(false);
  await select(false);
  expect(await balance()).toBe(50);
  expect(await stakeCount()).toBe(0);
});

test('saldo insufficiente rifiuta esatto e pronostici senza salvare scelte parziali', async () => {
  await asUser();
  await db.query('select wallet_state($1::uuid)', [league]);
  await db.exec('reset role');
  await db.query(`insert into wallet_transactions(league_id,user_id,amount,kind,week_start)
    values($1,$2,0,'TOPUP',date_trunc('week',now() at time zone 'Europe/Rome')::date),($1,$2,-49,'STAKE',null)`, [league,bettor]);
  await asUser();
  await save('1');
  expect(await balance()).toBe(0);
  await db.exec('savepoint insufficient');
  await expect(save('1',2,1)).rejects.toThrow(/Dollalerci insufficienti/);
  await db.exec('rollback to savepoint insufficient');
  await db.exec('savepoint insufficient_assignment');
  await expect(select(true)).rejects.toThrow(/Dollalerci insufficienti/);
  await db.exec('rollback to savepoint insufficient_assignment');
  await db.exec('reset role');
  expect((await db.query<{ score_a: number | null }>('select score_a from match_predictions where match_id=$1 and user_id=$2', [match,bettor])).rows[0]?.score_a).toBeNull();
  expect((await db.query<{ status: string }>('select status from advanced_prediction_assignments where id=$1', [assignment])).rows[0]?.status).toBe('AVAILABLE');
  expect(await stakeCount()).toBe(1);
});

test('formazione modificata e partita cancellata restituiscono solo puntate realmente pagate', async () => {
  await asUser();
  await save('1',2,1);
  await select(true);
  expect(await balance()).toBe(47);
  await db.exec('reset role');
  await db.query("update advanced_prediction_assignments set status='VOID',selected_at=null where id=$1", [assignment]);
  expect(await balance()).toBe(48);
  await db.query('delete from matches where id=$1', [match]);
  expect(await balance()).toBe(50);
});

test('scommesse precedenti e utenti esterni non ricevono crediti indebiti', async () => {
  await db.query("insert into match_predictions(match_id,user_id,outcome) values($1,$2,'1')", [match,bettor]);
  await asUser();
  await db.query('select wallet_state($1::uuid)', [league]);
  await save(null);
  expect(await balance()).toBe(50);
  await asUser(outsider);
  await db.exec('savepoint outsider');
  await expect(save('1')).rejects.toThrow(/Partita non disponibile/);
  await db.exec('rollback to savepoint outsider');
});
