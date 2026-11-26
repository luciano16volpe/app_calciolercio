import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { createTestDatabase } from './database';

const id=(n:number)=>`70000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('la migrazione paga una partita già consolidata durante il punto 2', async () => {
  const db=await createTestDatabase('20270112000000_dollalerci_puntate.sql');
  const league=id(1),match=id(2),winner=id(3),loser=id(4);
  try {
    await db.exec(`
      insert into auth.users(id,email) values ('${winner}','winner@test.invalid'),('${loser}','loser@test.invalid');
      insert into leagues(id,name,owner_id,created_by) values ('${league}','Bet','${winner}','${winner}');
      insert into league_members(league_id,user_id,role) values ('${league}','${winner}','admin'),('${league}','${loser}','member');
      insert into advanced_prediction_league_settings(league_id,enabled) values ('${league}',true);
      insert into matches(id,league_id,date,play_time,betting_enabled) values ('${match}','${league}',current_date+2,'21:00',true);
    `);
    for(const [user,outcome] of [[winner,'1'],[loser,'X']]){
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
      await db.exec('set role authenticated');
      await db.query('select save_match_prediction($1::uuid,$2::text)',[match,outcome]);
      await db.exec('reset role');
    }
    await db.query('update matches set date=current_date-2,score_a=2,score_b=1 where id=$1',[match]);
    await db.query('insert into advanced_prediction_stat_confirmations(match_id,confirmed_by) values($1,$2)',[match,winner]);
    await db.query('select advanced_prediction_reconcile($1::uuid,$2::jsonb)',[match,'[]']);
    const migration=readFileSync('supabase/migrations/20270113000000_dollalerci_montepremi.sql','utf8');
    await db.exec(migration);
    const pool=(await db.query<{staked:number;paid:number}>(
      'select staked,paid from wallet_match_pools where match_id=$1',[match])).rows[0];
    expect(pool).toEqual({staked:2,paid:2});
    const balance=(await db.query<{balance:number}>(
      'select coalesce(sum(amount),0)::integer as balance from wallet_transactions where user_id=$1',[winner])).rows[0]!.balance;
    expect(balance).toBe(51);
  } finally { await db.close(); }
});
