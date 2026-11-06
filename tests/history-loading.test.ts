import { afterAll, beforeAll, expect, test } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { dbToDataset } from '../src/data/dataset';
import { matchHasDesc, ratingsCoverage } from '../src/domain/matches';
import { withMatchTexts } from '../src/domain/matchTexts';
import type { Dataset } from '../src/domain/types';

const db = new PGlite();
const L1 = '00000000-0000-0000-0000-000000000001';
const L2 = '00000000-0000-0000-0000-000000000002';
const M1 = '00000000-0000-0000-0000-000000000011';
const M2 = '00000000-0000-0000-0000-000000000012';
beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create table leagues(id uuid primary key);
    create table matches(id uuid primary key, league_id uuid references leagues(id) on delete cascade, old boolean default false);
    create table match_players(match_id uuid references matches(id) on delete cascade, player_id uuid, team text, position int, rating numeric, goals int, assist int, autogol int, meta int, rigori_sbagliati int, titolo text, descrizione text);
    create table gazzette(match_id uuid references matches(id) on delete cascade);
    create table match_editors(league_id uuid, match_id uuid references matches(id) on delete cascade);
    create table albo(league_id uuid references leagues(id) on delete cascade);
    create function league_visible(l uuid) returns boolean language sql stable as $$ select l::text = current_setting('test.league', true) $$;
    alter table matches enable row level security;
    create policy matches_select on matches for select using (league_visible(league_id) and (not old or current_setting('test.history', true) = 'yes'));
    alter table match_players enable row level security;
    create policy mp_select on match_players for select using (exists(select 1 from matches m where m.id = match_id));
    grant usage on schema public to authenticated;
    grant select on matches, match_players, leagues to authenticated;
    insert into leagues values ('${L1}'), ('${L2}');
    insert into matches(id,league_id) values ('${M1}','${L1}'), ('${M2}','${L2}');
    insert into match_players values ('${M1}','${L1}','A',0,6,1,0,0,0,0,null,'A long private report'), ('${M2}','${L2}','B',0,7,0,0,0,0,0,'Other league',null);
  `);
  await db.exec(readFileSync('supabase/migrations/20261205000000_history_loading.sql','utf8'));
});
afterAll(async () => { await db.close(); });
const version = async (id = L1) => (await db.query<{ version: string }>('select version from league_data_versions where league_id=$1',[id])).rows[0]!.version;

test('summary preserves text presence without transferring titles or descriptions', async () => {
  const r = (await db.query<Record<string,unknown>>('select * from match_player_summaries where match_id=$1',[M1])).rows[0]!;
  expect(r.has_text).toBe(true);
  expect(r).not.toHaveProperty('titolo'); expect(r).not.toHaveProperty('descrizione');
});

test('summary enforces league and historical RLS; clients cannot modify versions', async () => {
  await db.exec(`set test.league='${L1}'; set test.history='no'; set role authenticated;`);
  try {
    expect((await db.query('select * from match_player_summaries')).rows).toHaveLength(1);
    expect((await db.query('select * from league_data_versions')).rows).toHaveLength(1);
    await expect(db.exec('update league_data_versions set version=gen_random_uuid()')).rejects.toThrow(/permission denied/);
  } finally { await db.exec('reset role'); }
  await db.exec(`update matches set old=true where id='${M1}'; set role authenticated;`);
  try { expect((await db.query('select * from match_player_summaries')).rows).toHaveLength(0); }
  finally { await db.exec('reset role'); }
});

test('reads keep the version stable; reports, headers, Gazzette, signatures and awards replace it', async () => {
  const start = await version(); await db.query('select * from match_player_summaries'); expect(await version()).toBe(start);
  const statements = [
    `update match_players set descrizione='Edited' where match_id='${M1}'`,
    `update matches set old=false where id='${M1}'`,
    `insert into gazzette values ('${M1}')`,
    `insert into match_editors values ('${L1}', '${M1}')`,
    `insert into albo values ('${L1}')`,
    `delete from match_players where match_id='${M1}'`,
  ];
  for (const sql of statements) { const before=await version(); await db.exec(sql); expect(await version()).not.toBe(before); }
  await db.exec(`delete from matches where id='${M1}'`);
  const next = await version();
  await db.exec(`delete from leagues where id='${L1}'`);
  expect((await db.query('select * from league_data_versions where league_id=$1',[L1])).rows).toHaveLength(0);
  expect(next).toBeTruthy();
});

test('new leagues receive a version immediately', async () => {
  const id='00000000-0000-0000-0000-000000000003';
  await db.query('insert into leagues values ($1)',[id]);
  expect(await version(id)).toBeTruthy();
});

test('deferred reports remain counted, and merging text preserves numbers and other matches', () => {
  const data = dbToDataset({ players: [{ id:'p',name:'Marco',roles:[],stats:[] }], matches: [{ id:'m',date:'2026-10-01',notes:null,score_a:1,score_b:0,pred:null,pred_rank:null }], matchPlayers: [{ match_id:'m',player_id:'p',team:'A',position:0,rating:null,goals:0,assist:0,autogol:0,meta:0,rigori_sbagliati:0,has_text:true }] });
  expect(data.ratings).toHaveLength(1); expect(matchHasDesc(data,'m')).toBe(true);
  expect(ratingsCoverage(data,data.matches[0]!)).toEqual({written:1,total:1});
  const source: Dataset = { ...data, ratings:[...data.ratings,{matchId:'other',playerId:'p',rating:8,notes:'untouched'}] };
  const merged=withMatchTexts(source,[{match_id:'m',player_id:'p',titolo:'Title',descrizione:'Full report'}]);
  expect(merged.ratings[0]).toMatchObject({notes:'Full report',titolo:'Title',rating:null,goals:0});
  expect(source.ratings[0]!.notes).toBe(''); expect(merged.ratings[1]).toBe(source.ratings[1]);
});
