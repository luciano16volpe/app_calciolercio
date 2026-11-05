import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase } from './database';

let db: PGlite;
const admin='00000000-0000-4000-8000-000000000081', editor='00000000-0000-4000-8000-000000000082';
const league='00000000-0000-4000-8000-000000000083', match='00000000-0000-4000-8000-000000000084';
const a='00000000-0000-4000-8000-000000000085', b='00000000-0000-4000-8000-000000000086', sub='00000000-0000-4000-8000-000000000087', outside='00000000-0000-4000-8000-000000000088';
let targetDate: string;
const original = { date:'', time:'21:00', place:'Campo', notes:'', teamA:[a], teamB:[b] };
beforeAll(async () => { db=await createTestDatabase(); },60_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  const dates=(await db.query<{today:string;next:string}>("select current_date::text as today, (current_date+7)::text as next")).rows[0]!;
  original.date=dates.today;
  targetDate=dates.next;
  await db.exec(`begin;
    insert into auth.users(id,email) values('${admin}','admin@example.invalid'),('${editor}','editor@example.invalid');
    delete from account_premium where user_id='${admin}';
    insert into leagues(id,name) values('${league}','Programma');
    insert into league_members(league_id,user_id,role) values('${league}','${admin}','admin'),('${league}','${editor}','redazione');
    insert into players(id,name) values('${a}','Uno'),('${b}','Due'),('${sub}','Sostituto'),('${outside}','Esterno');
    insert into league_players(league_id,player_id) values('${league}','${a}'),('${league}','${b}'),('${league}','${sub}');
    insert into matches(id,league_id,date,play_time,place,pred,pred_rank) values('${match}','${league}','${original.date}','21:00','Campo',0.1,1);
    insert into match_players(match_id,player_id,team,position) values('${match}','${a}','A',0),('${match}','${b}','B',0);
    select set_config('request.jwt.claim.sub','${admin}',true); set local role authenticated;`);
});
afterEach(async () => { await db.exec('rollback; reset role;'); });
const save = (teamA=[sub], teamB=[b], snapshot=original) => db.query(
  'select update_planned_match($1,$2,$3,$4,$5,$6,$7,$8)',
  [match,targetDate,'20:00','Campo nuovo','Serale',teamA,teamB,snapshot]);

test('admin Standard cambia programma e sostituisce dalla propria Rosa in una transazione', async () => {
  await save();
  expect((await db.query('select date::text,play_time::text,place,pred,pred_rank from matches where id=$1',[match])).rows[0]).toEqual({date:targetDate,play_time:'20:00:00',place:'Campo nuovo',pred:null,pred_rank:0});
  expect((await db.query('select player_id,team from match_players where match_id=$1 order by team',[match])).rows).toEqual([{player_id:sub,team:'A'},{player_id:b,team:'B'}]);
});
test('il cambio del solo programma conserva la previsione iniziale', async () => {
  await save([a],[b]);
  expect((await db.query('select pred_rank from matches where id=$1',[match])).rows[0]).toEqual({pred_rank:1});
});
test('il rinvio alla stagione successiva resta visibile anche per un admin Standard', async () => {
  const next=(await db.query<{date:string}>("select (current_season_start()+interval '4 months')::date::text as date")).rows[0]!.date;
  await db.query('select update_planned_match($1,$2,$3,$4,$5,$6,$7,$8)',[match,next,'21:00','Campo','',[a],[b],original]);
  expect((await db.query('select date::text from matches where id=$1',[match])).rows).toEqual([{date:next}]);
});
test('scambia i giocatori fra le squadre', async () => {
  await save([b],[a]);
  expect((await db.query('select player_id,team from match_players where match_id=$1 order by team',[match])).rows).toEqual([{player_id:b,team:'A'},{player_id:a,team:'B'}]);
});
test.each([['esterno',[outside],[b]],['duplicato',[a],[a]],['squadra vuota',[],[b]]] as const)('rifiuta %s e non modifica programma o squadre', async (_name, teamA, teamB) => {
  await db.exec('savepoint invalid');
  await expect(save([...teamA],[...teamB])).rejects.toThrow();
  await db.exec('rollback to savepoint invalid');
  expect((await db.query('select place from matches where id=$1',[match])).rows[0]).toEqual({place:'Campo'});
  expect((await db.query('select player_id from match_players where match_id=$1',[match])).rows).toHaveLength(2);
});
test('rifiuta dati vecchi dopo una modifica di un altro amministratore', async () => {
  await save();
  await expect(save()).rejects.toThrow(/modificata/);
});
test.each(['risultato','voto','gol','testo'])('non cambia squadre quando esiste già un %s', async (kind) => {
  if(kind==='risultato') await db.query('update matches set score_a=0 where id=$1',[match]);
  else if(kind==='voto') await db.query('update match_players set rating=6 where match_id=$1',[match]);
  else if(kind==='gol') await db.query('update match_players set goals=1 where match_id=$1',[match]);
  else await db.query("update match_players set titolo='Testo' where match_id=$1",[match]);
  await expect(save()).rejects.toThrow(/risultati o pagelle/);
});
test('la redazione non può modificare il programma né i convocati', async () => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${editor}',true); set local role authenticated;`);
  await expect(save()).rejects.toThrow(/permesso/);
});
