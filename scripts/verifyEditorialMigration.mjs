import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const user = '11111111-1111-4111-8111-111111111111';
const league = '22222222-2222-4222-8222-222222222222';
const match = '33333333-3333-4333-8333-333333333333';
const player = '44444444-4444-4444-8444-444444444444';
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select '${user}'::uuid$$;
    create type public.league_role as enum('admin','redazione');
    create table public.matches(id uuid primary key,league_id uuid,score_a smallint,score_b smallint);
    create table public.players(id uuid primary key,name text);
    create table public.match_players(match_id uuid,player_id uuid,team text,position integer,rating numeric,
      goals integer,assist integer,autogol integer,meta integer,rigori_sbagliati integer,titolo text,descrizione text);
    create table public.community_vote_settings(match_id uuid primary key references matches(id),started_at timestamptz,enabled_by uuid);
    create table public.advanced_prediction_assignments(match_id uuid,predictor_player_id uuid,selected_at timestamptz,
      template_code text,target_player_id uuid,description text);
    create function public.is_league_admin(uuid) returns boolean language sql stable as $$select true$$;
    create function public.has_league_role(uuid,public.league_role[]) returns boolean language sql stable as $$select true$$;
  `);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261223000000_sondaggio_obbligatorio_voto_editore.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20261224000000_voto_editoriale_nei_riepiloghi.sql',import.meta.url),'utf8'));
  await db.query('insert into auth.users(id) values($1)',[user]);
  await db.query('insert into matches(id,league_id) values($1,$2)',[match,league]);
  await db.query("insert into players(id,name) values($1,'Vito')",[player]);
  await db.query('insert into match_players(match_id,player_id,rating) values($1,$2,8)',[match,player]);
  await db.query('update matches set score_a=1,score_b=0 where id=$1',[match]);
  const opened=await db.query(`select c.started_at,mp.rating from community_vote_settings c
    join match_players mp on mp.match_id=c.match_id where c.match_id=$1`,[match]);
  if(opened.rows.length!==1||opened.rows[0].rating!==null)throw new Error('Poll not opened or draft rating became official');
  await db.query('select save_match_texts($1,$2::jsonb)',[match,JSON.stringify([{player_id:player,titolo:'Titolo',descrizione:'Testo',editor_rating:7.5}])]);
  const editor=await db.query('select rating,editor_rating,titolo from match_players where match_id=$1',[match]);
  if(editor.rows[0].rating!==null||Number(editor.rows[0].editor_rating)!==7.5||editor.rows[0].titolo!=='Titolo')
    throw new Error('Editorial vote affected official rating');
  await db.query('update match_players set titolo=null,descrizione=null where match_id=$1',[match]);
  const summary=await db.query('select has_text,editor_rating from match_player_summaries where match_id=$1',[match]);
  if(summary.rows[0].has_text!==true||Number(summary.rows[0].editor_rating)!==7.5)
    throw new Error('Editorial-only vote is missing from match summaries');
  await db.query("insert into advanced_prediction_assignments values($1,$2,now(),'private',$2,'hidden')",[match,player]);
  const participation=await db.query('select advanced_prediction_admin_participation($1) as data',[match]);
  const output=participation.rows[0].data;
  if(output.count!==1||output.players[0].name!=='Vito'||JSON.stringify(output).includes('private'))
    throw new Error('Admin participation leaks selections');
  await db.exec('create or replace function public.is_league_admin(uuid) returns boolean language sql stable as $$select false$$');
  let denied=false;
  try{await db.query('select advanced_prediction_admin_participation($1)',[match]);}catch{denied=true;}
  if(!denied)throw new Error('Non-admin could access participation');
  await db.exec('create or replace function public.is_league_admin(uuid) returns boolean language sql stable as $$select true$$');
  await db.query('update match_players set rating=6 where match_id=$1',[match]);
  await db.query('update matches set score_a=2 where id=$1',[match]);
  const corrected=await db.query('select rating from match_players where match_id=$1',[match]);
  if(Number(corrected.rows[0].rating)!==6)throw new Error('Score correction erased finalized rating');
  console.log('Editorial migration: poll, vote separation and admin privacy passed');
} catch(error){console.error(error.message,error.detail??'');process.exitCode=1;}
finally{await db.close();}
