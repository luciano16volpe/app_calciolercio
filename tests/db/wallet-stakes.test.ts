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
const rawBalance = async (user: string) => {
  await db.exec('reset role');
  return (await db.query<{ balance: number }>(
    'select coalesce(sum(amount),0)::integer as balance from wallet_transactions where league_id=$1 and user_id=$2',
    [league,user])).rows[0]!.balance;
};
async function settle(a: number, b: number, results: unknown[] = []) {
  await db.exec('reset role');
  await db.query('update matches set date=current_date-2,score_a=$2,score_b=$3 where id=$1', [match,a,b]);
  await db.query('insert into advanced_prediction_stat_confirmations(match_id,confirmed_by) values($1,$2) on conflict do nothing', [match,owner]);
  await db.query('select advanced_prediction_reconcile($1::uuid,$2::jsonb)', [match,JSON.stringify(results)]);
}

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

test('il montepremi paga la puntata giusta e lascia nel fondo gli arrotondamenti', async () => {
  await asUser(); await save('1',2,1);
  await asUser(owner); await save('X');
  await settle(2,1);
  expect(await rawBalance(bettor)).toBe(50);
  expect(await rawBalance(owner)).toBe(49);
  const pool=(await db.query<{ staked:number;paid:number;returned:number;remainder:number }>(
    'select staked,paid,returned,remainder from wallet_match_pools where match_id=$1',[match])).rows[0]!;
  expect(pool).toEqual({staked:3,paid:2,returned:0,remainder:1});
  await asUser();
  const receipt=(await db.query<{ receipt:{mine:{element_key:string;payout:number}[];remainder:number} }>(
    'select wallet_match_receipt($1::uuid) as receipt',[match])).rows[0]!.receipt;
  expect(receipt.mine.map(x=>[x.element_key,x.payout])).toEqual([['EXACT',1],['OUTCOME',1]]);
  expect(receipt.remainder).toBe(1);
});

test('nessun vincitore restituisce tutte le puntate', async () => {
  await asUser(); await save('2');
  await asUser(owner); await save('X');
  await settle(2,1);
  expect(await rawBalance(bettor)).toBe(50);
  expect(await rawBalance(owner)).toBe(50);
  expect((await db.query<{returned:number;paid:number}>(
    'select returned,paid from wallet_match_pools where match_id=$1',[match])).rows[0]).toEqual({returned:2,paid:0});
});

test('pronostico annullato viene rimborsato e non divide il premio', async () => {
  await asUser(); await save('1'); await select(true);
  await settle(2,1,[{assignment_id:assignment,outcome:'VOID'}]);
  expect(await rawBalance(bettor)).toBe(50);
  const rows=(await db.query<{element_key:string;outcome:string;payout:number}>(
    'select element_key,outcome,payout from wallet_settlements where match_id=$1 order by element_key',[match])).rows;
  expect(rows.map(x=>[x.element_key.startsWith('ASSIGNMENT:')?'ASSIGNMENT':x.element_key,x.outcome,x.payout]))
    .toEqual([['ASSIGNMENT','VOID',1],['OUTCOME','WON',1]]);
});

test('ricalcolo delle statistiche corregge il premio una sola volta', async () => {
  await asUser(); await save('1');
  await asUser(owner); await save('X');
  await settle(2,1);
  expect(await rawBalance(bettor)).toBe(51);
  await db.query('select advanced_prediction_reconcile($1::uuid,$2::jsonb)',[match,'[]']);
  expect(await rawBalance(bettor)).toBe(51);
  await settle(1,1);
  expect(await rawBalance(bettor)).toBe(49);
  expect(await rawBalance(owner)).toBe(51);
  await db.query('delete from matches where id=$1',[match]);
  expect(await rawBalance(bettor)).toBe(50);
  expect(await rawBalance(owner)).toBe(50);
});

test('classifica usa il guadagno netto e non il credito o la ricarica', async () => {
  await asUser(); await save('1');
  await asUser(owner); await save('X');
  const openRows=(await db.query<{rows:unknown[]}>(
    'select wallet_leaderboard($1::uuid,null) as rows',[league])).rows[0]!.rows;
  expect(openRows).toEqual([]);
  await settle(2,1);
  await asUser();
  const rows=(await db.query<{rows:{user_id:string;net:number;staked:number;won:number}[]}>(
    'select wallet_leaderboard($1::uuid,null) as rows',[league])).rows[0]!.rows;
  expect(rows.map(x=>[x.user_id,x.net,x.staked,x.won])).toEqual([
    [bettor,1,1,2],[owner,-1,1,0],
  ]);
  await asUser(outsider);
  await db.exec('savepoint denied_leaderboard');
  await expect(db.query('select wallet_leaderboard($1::uuid,null)',[league])).rejects.toThrow(/Permesso negato/);
  await db.exec('rollback to savepoint denied_leaderboard');
  await db.exec('savepoint denied_receipt');
  await expect(db.query('select wallet_match_receipt($1::uuid)',[match])).rejects.toThrow(/Permesso negato/);
  await db.exec('rollback to savepoint denied_receipt');
});

test('le scelte altrui diventano visibili solo alla chiusura', async () => {
  await asUser(); await save('1');
  await asUser(owner);
  const before=(await db.query<{board:{entries:unknown[]|null}[]}>(
    'select betting_board($1::uuid) as board',[league])).rows[0]!.board;
  expect(before[0]?.entries).toBeNull();
  await db.exec('reset role');
  await db.query('update matches set date=current_date-2 where id=$1',[match]);
  await asUser(owner);
  const after=(await db.query<{board:{entries:{user_id:string;outcome:string}[]}[]}>(
    'select betting_board($1::uuid) as board',[league])).rows[0]!.board;
  expect(after[0]?.entries.map(x=>[x.user_id,x.outcome])).toEqual([[bettor,'1']]);
});

test('resoconto evidenzia pronostico coraggioso e miglior guadagno', async () => {
  await asUser(); await select(true);
  await asUser(owner); await save('X');
  await settle(2,1,[{assignment_id:assignment,outcome:'WON'}]);
  await asUser(owner);
  const receipt=(await db.query<{receipt:{boldest:{description:string;weight:number};best:{net:number}}}>(
    'select wallet_match_receipt($1::uuid) as receipt',[match])).rows[0]!.receipt;
  expect(receipt.boldest).toMatchObject({description:'Prova',weight:1});
  expect(receipt.best.net).toBe(1);
});

test('chi annulla tutte le scelte prima della partita non entra in classifica', async () => {
  await asUser(); await save('1'); await save(null);
  await asUser(owner); await save('1');
  await settle(2,1);
  await asUser();
  const rows=(await db.query<{rows:{user_id:string}[]}>(
    'select wallet_leaderboard($1::uuid,null) as rows',[league])).rows[0]!.rows;
  expect(rows.map(x=>x.user_id)).toEqual([owner]);
});

test('un risultato incompleto non distribuisce il montepremi', async () => {
  await asUser(); await select(true);
  await db.exec('reset role');
  await db.query('update matches set date=current_date-2,score_a=2,score_b=1 where id=$1',[match]);
  await db.query('insert into advanced_prediction_stat_confirmations(match_id,confirmed_by) values($1,$2)',[match,owner]);
  await db.exec('savepoint incomplete_result');
  await expect(db.query('select advanced_prediction_reconcile($1::uuid,$2::jsonb)',[match,'[]']))
    .rejects.toThrow(/Risultati incompleti/);
  await db.exec('rollback to savepoint incomplete_result');
  expect((await db.query<{count:number}>('select count(*)::integer as count from wallet_match_pools')).rows[0]!.count).toBe(0);
  expect(await rawBalance(bettor)).toBe(49);
});
