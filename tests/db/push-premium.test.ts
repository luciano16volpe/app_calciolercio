import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase } from './database';

let db: PGlite;
const ids=Array.from({ length: 12 },(_,i)=>`00000000-0000-4000-8000-${String(100+i).padStart(12,'0')}`);
const [standard,premium,reserve,league,match,a,b,c]=ids as [string,string,string,string,string,string,string,string];
const at=(time: string)=>`2026-11-05 ${time}+01`;
beforeAll(async()=>{ db=await createTestDatabase(); },60_000);
afterAll(async()=>{ await db?.close(); });
beforeEach(async()=>{
  await db.exec(`begin;
    insert into auth.users(id,email) values('${standard}','standard@example.invalid'),('${premium}','premium@example.invalid'),('${reserve}','reserve@example.invalid');
    delete from account_premium where user_id in ('${standard}','${reserve}');
    insert into leagues(id,name) values('${league}','Notifiche');
    insert into league_members(league_id,user_id,role) values('${league}','${standard}','admin'),('${league}','${premium}','member'),('${league}','${reserve}','member');
    insert into players(id,name,user_id) values('${a}','Uno','${standard}'),('${b}','Due','${premium}'),('${c}','Tre','${reserve}');
    insert into league_players(league_id,player_id) values('${league}','${a}'),('${league}','${b}'),('${league}','${c}');
    insert into matches(id,league_id,date,play_time,place) values('${match}','${league}','2026-11-05','21:00','Campo');
    insert into match_players(match_id,player_id,team,position) values('${match}','${a}','A',0),('${match}','${b}','B',0);
    insert into push_subscriptions(user_id,endpoint,p256dh,auth) values
      ('${standard}','https://example.invalid/standard','p','a'),('${premium}','https://example.invalid/premium','p','a'),('${reserve}','https://example.invalid/reserve','p','a');
    set constraints all immediate; set constraints all deferred;
  `);
});
afterEach(async()=>{ await db.exec('rollback; reset role;'); });
async function asUser(id: string) { await db.exec(`reset role; select set_config('request.jwt.claim.sub','${id}',true); set local role authenticated;`); }
async function due(time: string) { await db.exec('reset role'); return (await db.query<{kind:string;user_id:string;team:string}>('select kind,user_id,team from push_due_at($1)',[at(time)])).rows; }
async function flush() { await db.exec('reset role; set constraints all immediate; set constraints all deferred;'); }

test('Standard attiva e sospende tutte le notifiche, ma non modifica tipi o anticipo',async()=>{
  await asUser(standard);
  expect((await db.query('select customizable,enabled from my_push_prefs()')).rows[0]).toEqual({customizable:false,enabled:true});
  await db.exec('savepoint denied');
  await expect(db.query("select set_push_pref('result',false)")).rejects.toThrow(/Premium/);
  await db.exec('rollback to savepoint denied');
  await expect(db.query('select set_push_reminder(60)')).rejects.toThrow(/Premium/);
  await db.exec('rollback to savepoint denied');
  await db.query('select set_push_enabled(false)');
  expect((await due('08:00')).some(r=>r.user_id===standard)).toBe(false);
  await asUser(standard); await db.query('select set_push_enabled(true)');
  expect((await due('08:00')).some(r=>r.user_id===standard)).toBe(true);
});

test('nessun promemoria Standard prima delle 7 o dopo il calcio di inizio',async()=>{
  expect((await due('06:59')).filter(r=>r.kind==='reminder')).toHaveLength(0);
  expect((await due('07:00')).filter(r=>r.kind==='reminder')).toHaveLength(2);
  expect((await due('21:00')).filter(r=>r.kind==='reminder')).toHaveLength(0);
});

test('Premium sceglie anticipo; dopo la scadenza torna alle 7 preservando i tipi disattivati',async()=>{
  await asUser(premium); await db.query('select set_push_reminder(120)'); await db.query("select set_push_pref('ratings',false)");
  expect((await due('08:00')).some(r=>r.user_id===premium)).toBe(false);
  expect((await due('19:00')).some(r=>r.user_id===premium&&r.kind==='reminder')).toBe(true);
  await db.query('delete from account_premium where user_id=$1',[premium]);
  expect((await due('08:00')).some(r=>r.user_id===premium&&r.kind==='reminder')).toBe(true);
  await asUser(premium);
  expect((await db.query('select ratings,reminder_minutes,customizable from my_push_prefs()')).rows[0]).toEqual({ratings:false,reminder_minutes:120,customizable:false});
});

test('le disattivazioni precedenti non vengono riattivate da Standard',async()=>{
  await db.query('insert into push_prefs(user_id,reminder,result) values($1,false,false)',[standard]);
  expect((await due('08:00')).some(r=>r.user_id===standard)).toBe(false);
  await asUser(standard); await db.query('select set_push_enabled(false)'); await db.query('select set_push_enabled(true)');
  expect((await db.query('select reminder,result from my_push_prefs()')).rows[0]).toEqual({reminder:false,result:false});
});

test('anticipo 24 ore: il promemoria può partire il giorno prima e una sola volta',async()=>{
  await asUser(premium); await db.query('select set_push_reminder(1440)'); await db.exec('reset role');
  const before=(await db.query('select * from push_due_at($1) where user_id=$2',['2026-11-04 20:59+01',premium])).rows;
  expect(before).toHaveLength(0);
  expect((await db.query('select * from push_due_at($1) where user_id=$2',['2026-11-04 21:00+01',premium])).rows).toHaveLength(1);
  await db.query("insert into push_sent(kind,match_id,user_id) values('reminder',$1,$2)",[match,premium]);
  expect((await due('19:00')).some(r=>r.user_id===premium&&r.kind==='reminder')).toBe(false);
});

test('anticipo attraversando il cambio di ora: due ore reali prima, con fuso italiano',async()=>{
  await db.query("update matches set date='2026-10-25',play_time='03:30' where id=$1",[match]);
  await asUser(premium); await db.query('select set_push_reminder(120)'); await db.exec('reset role');
  expect((await db.query('select * from push_due_at($1) where user_id=$2',['2026-10-25 02:29+02',premium])).rows).toHaveLength(0);
  expect((await db.query('select * from push_due_at($1) where user_id=$2',['2026-10-25 02:30+02',premium])).rows).toHaveLength(1);
});

test('senza ora di gioco un anticipo Premium usa il promemoria Standard',async()=>{
  await asUser(premium); await db.query('select set_push_reminder(120)'); await db.exec('reset role');
  await db.query('update matches set play_time=null where id=$1',[match]);
  expect((await due('07:00')).some(r=>r.user_id===premium&&r.kind==='reminder')).toBe(true);
});

test('Gazzetta solo per Premium; nessun invio a chi ha lasciato la lega',async()=>{
  await db.query('insert into gazzette(match_id,file_path,uploaded_at) values($1,$2,$3)',[match,`${league}/${match}.jpg`,at('10:00')]);
  expect((await due('10:01')).filter(r=>r.kind==='gazzetta').map(r=>r.user_id)).toEqual([premium]);
  await db.query('delete from league_members where league_id=$1 and user_id=$2',[league,premium]);
  expect((await due('10:01')).some(r=>r.user_id===premium)).toBe(false);
});

test('un salvataggio atomico raggruppa programma e sostituzione e avvisa anche chi esce',async()=>{
  // La partita deve essere futura rispetto all'orologio PostgreSQL usato dai trigger.
  await db.query("update matches set date=current_date+2 where id=$1",[match]); await flush();
  await db.query('delete from push_program_changes');
  const original=(await db.query<{snapshot:unknown}>('select snapshot from push_program_state where match_id=$1',[match])).rows[0]!.snapshot;
  await db.query("update matches set place='Campo nuovo' where id=$1",[match]);
  await db.query('delete from match_players where match_id=$1',[match]);
  await db.query("insert into match_players(match_id,player_id,team,position) values($1,$2,'A',0),($1,$3,'B',0)",[match,c,b]);
  await flush();
  const changes=(await db.query<{user_id:string;before_state:unknown}>('select user_id,before_state from push_program_changes where match_id=$1',[match])).rows;
  expect(changes).toHaveLength(3);
  expect(changes.every(x=>JSON.stringify(x.before_state)===JSON.stringify(original))).toBe(true);
  expect((await db.query('select * from push_due_at(now()) where kind like \'change:%\'')).rows).toHaveLength(0);
  const rows=(await db.query<{user_id:string;team:string}>('select user_id,team from push_due_at(now()+interval \'2 minutes\') where kind like \'change:%\'')).rows;
  expect(rows).toEqual(expect.arrayContaining([{user_id:standard,team:'out'},{user_id:reserve,team:'A'},{user_id:premium,team:'B'}]));
});

test('revisioni distinte: un invio vecchio non sopprime una modifica successiva',async()=>{
  await db.query('update matches set date=current_date+2 where id=$1',[match]); await flush();
  await db.query('delete from push_program_changes');
  await db.query("update matches set place='Primo campo' where id=$1",[match]); await flush();
  await db.query("insert into push_sent(kind,match_id,user_id) select 'change:'||revision,match_id,user_id from push_program_changes");
  await db.query("update matches set place='Secondo campo' where id=$1",[match]); await flush();
  expect((await db.query("select * from push_due_at(now()+interval '2 minutes') where kind like 'change:%'")).rows).toHaveLength(2);
});

test('i cambi non avvisano chi esce dalla lega, né chi disattiva quel tipo o tutte le notifiche',async()=>{
  await db.query('update matches set date=current_date+2 where id=$1',[match]); await flush();
  await db.query('delete from push_program_changes');
  await db.query("update matches set place='Altro' where id=$1",[match]); await flush();
  await db.query('insert into push_prefs(user_id,change) values($1,false)',[premium]);
  await db.query('delete from league_members where league_id=$1 and user_id=$2',[league,standard]);
  expect((await db.query("select * from push_due_at(now()+interval '2 minutes') where kind like 'change:%'")).rows).toHaveLength(0);
});

test('importazione e creazione iniziale non generano avvisi di variazione',async()=>{
  expect((await db.query('select * from push_program_changes')).rows).toHaveLength(0);
  await db.query("select set_config('request.headers','{\"x-audit-source\":\"import\"}',true)");
  await db.query('update matches set date=current_date+2 where id=$1',[match]); await flush();
  expect((await db.query('select * from push_program_changes')).rows).toHaveLength(0);
});

test('modifica annullata prima dell’invio: nessun avviso; note e risultato non producono variazioni',async()=>{
  await db.query('update matches set date=current_date+2 where id=$1',[match]); await flush(); await db.query('delete from push_program_changes');
  await db.query("update matches set place='Altro' where id=$1",[match]); await flush();
  await db.query("update matches set place='Campo' where id=$1",[match]); await flush();
  expect((await db.query('select * from push_program_changes')).rows).toHaveLength(0);
  await db.query("update matches set notes='Nota',score_a=0 where id=$1",[match]); await flush();
  expect((await db.query('select * from push_program_changes')).rows).toHaveLength(0);
});

test('validazione e isolamento: dati nulli, anticipi arbitrari e scritture dirette rifiutati',async()=>{
  await asUser(premium); await db.exec('savepoint bad');
  for(const sql of ["select set_push_pref(null,false)","select set_push_pref('result',null)",'select set_push_reminder(17)',
    `update push_prefs set enabled=false where user_id='${standard}'`, 'select * from push_due_at(now())']) {
    await expect(db.query(sql)).rejects.toThrow(); await db.exec('rollback to savepoint bad');
  }
});
