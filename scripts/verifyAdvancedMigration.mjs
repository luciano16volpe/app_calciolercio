import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db=new PGlite();
const bootstrap=`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create schema extensions;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
  create table public.leagues(id uuid primary key);
  create table public.players(id uuid primary key,user_id uuid,name text,photo_path text);
  create table public.matches(id uuid primary key,league_id uuid,date date,play_time time,score_a smallint,score_b smallint);
  create table public.league_players(league_id uuid,player_id uuid);
  create table public.league_members(league_id uuid,user_id uuid,role text);
  create table public.match_players(match_id uuid,player_id uuid,team char(1),goals smallint,assist smallint,autogol smallint,meta smallint,rating numeric);
  create table public.formation_polls(match_id uuid,finalized_at timestamptz);
  create table public.community_vote_settings(match_id uuid,finalized_at timestamptz);
  create table public.match_predictions(match_id uuid,user_id uuid,outcome text,score_a smallint,score_b smallint);
  create table public.private_config(key text,value text);
  create function public.is_league_admin(uuid) returns boolean language sql as $$select false$$;
  create function public.audit_user_name(uuid) returns text language sql as $$select 'Test'::text$$;
`;
try{
  await db.exec(bootstrap);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261222000000_pronostici_avanzati_fondazioni.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20261225000000_cron_pronostici_con_jwt.sql',import.meta.url),'utf8'));
  const {rows}=await db.query('select version,rules->>\'maxAssignments\' as maximum from public.advanced_prediction_configurations');
  if(rows.length!==1||rows[0].maximum!=='10')throw new Error('Configuration not seeded');
  const league='11111111-1111-4111-8111-111111111111';
  const match='22222222-2222-4222-8222-222222222222';
  const predictor='33333333-3333-4333-8333-333333333333';
  const target='44444444-4444-4444-8444-444444444444';
  await db.query(`insert into leagues(id) values($1)`,[league]);
  await db.query(`insert into matches(id,league_id,date,play_time) values($1,$2,'2099-06-01','10:00')`,[match,league]);
  await db.query(`insert into players(id,name) values($1,'Vito'),($2,'Gianluca')`,[predictor,target]);
  await db.query(`insert into league_players(league_id,player_id) values($1,$2),($1,$3)`,[league,predictor,target]);
  await db.query(`insert into match_players(match_id,player_id,team,goals,assist,autogol,meta) values($1,$2,'A',0,0,0,0),($1,$3,'B',1,0,0,0)`,[match,predictor,target]);
  await db.query(`insert into advanced_prediction_league_settings(league_id,enabled) values($1,true)`,[league]);
  const assignment=[{target_player_id:target,template_id:1,template_code:'goals_AT_LEAST_ONE',category:'GOALS',
    description:'Gianluca segna almeno un gol',condition:{op:'GTE',left:{field:'goals'},right:{constant:1}},
    parameters:{},difficulty:'COMMON',weight:1,estimated_probability:null,historical_sample_size:0,estimation_method:'DEFAULT'}];
  const generated=await db.query('select id from advanced_prediction_generate($1,$2,1,$3::jsonb)',[match,predictor,JSON.stringify(assignment)]);
  const repeated=await db.query('select id from advanced_prediction_generate($1,$2,1,$3::jsonb)',[match,predictor,'[]']);
  if(generated.rows.length!==1||repeated.rows[0]?.id!==generated.rows[0]?.id)throw new Error('Generation is not idempotent');
  const assignmentId=generated.rows[0].id;
  await db.query(`update advanced_prediction_assignments set selected_at=now(),status='SELECTED' where id=$1`,[assignmentId]);
  await db.query(`update matches set score_a=1,score_b=0 where id=$1`,[match]);
  await db.query(`insert into advanced_prediction_stat_confirmations(match_id) values($1)`,[match]);
  const won=[{assignment_id:assignmentId,outcome:'WON',reason:'Gol registrato'}];
  await db.query('select advanced_prediction_reconcile($1,$2::jsonb)',[match,JSON.stringify(won)]);
  await db.query('select advanced_prediction_reconcile($1,$2::jsonb)',[match,JSON.stringify(won)]);
  const first=await db.query('select final_units from advanced_prediction_match_summaries where match_id=$1',[match]);
  const revision=await db.query('select revision from advanced_prediction_results where assignment_id=$1',[assignmentId]);
  if(first.rows[0]?.final_units!==10000||revision.rows[0]?.revision!==1)throw new Error('Scoring or retry failed');
  await db.query('update match_players set goals=0 where match_id=$1 and player_id=$2',[match,target]);
  const confirmation=await db.query('select count(*)::integer as count from advanced_prediction_stat_confirmations where match_id=$1',[match]);
  if(confirmation.rows[0].count!==0)throw new Error('Correction did not invalidate confirmation');
  await db.query('insert into advanced_prediction_stat_confirmations(match_id) values($1)',[match]);
  await db.query('select advanced_prediction_reconcile($1,$2::jsonb)',[match,JSON.stringify([{assignment_id:assignmentId,outcome:'LOST',reason:'Nessun gol'}])]);
  const corrected=await db.query('select final_units from advanced_prediction_match_summaries where match_id=$1',[match]);
  const revised=await db.query('select revision from advanced_prediction_results where assignment_id=$1',[assignmentId]);
  if(corrected.rows[0]?.final_units!==-10000||revised.rows[0]?.revision!==2)throw new Error('Correction did not replace score');
  const user='55555555-5555-4555-8555-555555555555';
  await db.query('insert into auth.users(id) values($1)',[user]);
  await db.query('update players set user_id=$1 where id=$2',[user,predictor]);
  await db.query(`insert into league_members(league_id,user_id,role) values($1,$2,'member')`,[league,user]);
  await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$select '${user}'::uuid$$`);
  const standing=await db.query(`select advanced_prediction_leaderboard($1,'2099-EST') as board`,[league]);
  if(standing.rows[0]?.board?.[0]?.final_units!==-10000)throw new Error('Leaderboard did not reflect correction');
  const stats=await db.query(`select advanced_prediction_my_stats($1,'2099-EST') as stats`,[league]);
  if(stats.rows[0]?.stats?.lost!==1)throw new Error('Personal stats did not reflect correction');
  const history=await db.query(`select advanced_prediction_my_history($1,'2099-EST',50,0,null,'GOALS',null,'COMMON','LOST') as history`,[league]);
  if(history.rows[0]?.history?.length!==1)throw new Error('Filtered history failed');
  await db.exec(`create or replace function public.is_league_admin(uuid) returns boolean language sql as $$select true$$`);
  const revealed=await db.query('select advanced_prediction_admin_results($1) as data',[match]);
  if(revealed.rows[0]?.data?.length!==1||revealed.rows[0].data[0].outcome!=='LOST')
    throw new Error('Admin results were not revealed after consolidation');
  const balance=await db.query(`select advanced_prediction_balance($1,'2099-EST') as balance`,[league]);
  if(balance.rows[0]?.balance?.by_difficulty?.[0]?.lost!==1)throw new Error('Balance monitor did not reflect correction');
  const nextMatch='66666666-6666-4666-8666-666666666666';
  const substitute='77777777-7777-4777-8777-777777777777';
  await db.query(`insert into matches(id,league_id,date,play_time) values($1,$2,'2099-06-02','10:00')`,[nextMatch,league]);
  await db.query(`insert into players(id,name) values($1,'Marco')`,[substitute]);
  await db.query(`insert into league_players(league_id,player_id) values($1,$2)`,[league,substitute]);
  await db.query(`insert into match_players(match_id,player_id,team,goals,assist,autogol,meta)
    values($1,$2,'A',0,0,0,0),($1,$3,'B',0,0,0,0),($1,$4,'A',0,0,0,0)`,[nextMatch,predictor,target,substitute]);
  await db.query('select id from advanced_prediction_generate($1,$2,1,$3::jsonb)',[nextMatch,predictor,JSON.stringify(assignment)]);
  await db.query(`update match_players set team='A' where match_id=$1 and player_id=$2`,[nextMatch,target]);
  await db.query(`update match_players set team='B' where match_id=$1 and player_id=$2`,[nextMatch,substitute]);
  await db.query('select advanced_prediction_refresh($1,$2,$3::jsonb)',[nextMatch,predictor,JSON.stringify([{...assignment[0],target_player_id:substitute}])]);
  const refreshed=await db.query('select status,target_player_id from advanced_prediction_assignments where match_id=$1 order by assigned_at,id',[nextMatch]);
  if(refreshed.rows.length!==2||!refreshed.rows.some(x=>x.target_player_id===target&&x.status==='VOID')||
    !refreshed.rows.some(x=>x.target_player_id===substitute&&x.status==='AVAILABLE'))throw new Error('Formation replacement failed');
  const replacementId=(await db.query(`select id from advanced_prediction_assignments where match_id=$1 and target_player_id=$2`,[nextMatch,substitute])).rows[0].id;
  await db.query('select advanced_prediction_select($1,true)',[replacementId]);
  const hidden=await db.query('select advanced_prediction_admin_results($1) as data',[nextMatch]);
  if(hidden.rows[0]?.data?.length!==0)throw new Error('Admin saw private selections before the match result');
  const selected=await db.query('select status from advanced_prediction_assignments where id=$1',[replacementId]);
  if(selected.rows[0]?.status!=='SELECTED')throw new Error('Selection failed');
  await db.query(`select advanced_prediction_lock_due('2100-01-01'::timestamptz)`);
  const lockedStatus=await db.query('select status from advanced_prediction_assignments where id=$1',[replacementId]);
  if(lockedStatus.rows[0]?.status!=='PENDING')throw new Error('Kickoff lock failed');
  await db.exec('set role authenticated');
  let directReadBlocked=false;
  try{await db.query('select * from advanced_prediction_assignments');}catch{directReadBlocked=true;}
  await db.exec('reset role');
  if(!directReadBlocked)throw new Error('Direct client read was not blocked');
  await db.query('update matches set score_a=1,score_b=0 where id=$1',[nextMatch]);
  let locked=false;
  try{await db.query('select advanced_prediction_select($1,false)',[replacementId]);}catch{locked=true;}
  if(!locked)throw new Error('Selection was not locked after result');
  console.log('Advanced prediction migration: applied successfully in PGlite');
}catch(error){console.error(error.message,error.detail??'');process.exitCode=1;}
finally{await db.close();}
