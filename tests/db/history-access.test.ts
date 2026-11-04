import { afterAll, beforeAll, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase } from './database';

let db: PGlite;
const admin = '00000000-0000-4000-8000-000000000051';
const member = '00000000-0000-4000-8000-000000000052';
const league = '00000000-0000-4000-8000-000000000053';
beforeAll(async () => {
  db = await createTestDatabase();
  await db.exec(`insert into auth.users(id,email) values ('${admin}','admin@example.invalid'),('${member}','member@example.invalid');
    insert into platform_admins(user_id) values ('${admin}');
    delete from account_premium where user_id='${member}';
    insert into leagues(id,name) values ('${league}','Test');
    insert into league_members(league_id,user_id,role) values ('${league}','${member}','member');
    insert into matches(league_id,date) values ('${league}',current_season_start()), ('${league}',(current_season_start() - interval '3 months')::date), ('${league}',(current_season_start() - interval '6 months')::date);
    insert into players(id,name) values ('00000000-0000-4000-8000-000000000054','Test');
    insert into match_players(match_id,player_id,team) select id,'00000000-0000-4000-8000-000000000054','A' from matches where league_id='${league}';
    insert into gazzette(match_id,file_path) select id, '${league}/' || id::text || '.jpg' from matches where league_id='${league}';
    insert into storage.objects(bucket_id,name) select 'gazzette', file_path from gazzette;
    grant select on storage.objects to authenticated;
    alter table storage.objects enable row level security;
    insert into albo(league_id,season_key,rows) values
      ('${league}',season_key_for_date(current_season_start()),'[]'),
      ('${league}',season_key_for_date((current_season_start() - interval '3 months')::date),'[]'),
      ('${league}',season_key_for_date((current_season_start() - interval '6 months')::date),'[]');`);
}, 60_000);
afterAll(async () => { await db?.close(); });

test('Standard vede solo due stagioni anche tramite richieste dirette; Premium e modalità Standard vedono lo storico', async () => {
  await db.exec(`select set_config('request.jwt.claim.sub','${member}',false); set role authenticated`);
  expect((await db.query('select date from matches where league_id = $1', [league])).rows).toHaveLength(2);
  expect((await db.query('select season_key from albo where league_id = $1', [league])).rows).toHaveLength(2);
  expect((await db.query('select match_id from match_players')).rows).toHaveLength(2);
  expect((await db.query("select name from storage.objects where bucket_id='gazzette'")).rows).toHaveLength(0);
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${admin}',false); set role authenticated`);
  await db.query('select admin_extend_premium($1, 1)', [member]);
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${member}',false); set role authenticated`);
  expect((await db.query('select date from matches where league_id = $1', [league])).rows).toHaveLength(3);
  expect((await db.query('select match_id from match_players')).rows).toHaveLength(3);
  expect((await db.query("select name from storage.objects where bucket_id='gazzette'")).rows).toHaveLength(3);
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${admin}',false); set role authenticated`);
  await db.query('select admin_end_premium($1)', [member]);
  await db.query("select admin_set_feature_mode('history', 'standard')");
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${member}',false); set role authenticated`);
  expect((await db.query('select date from matches where league_id = $1', [league])).rows).toHaveLength(3);
});

test('le stagioni a cavallo d’anno mantengono la chiave corretta', async () => {
  expect((await db.query("select season_key_for_date('2027-02-01'::date) as winter, season_key_for_date('2026-11-30'::date) as autumn")).rows[0]).toEqual({ winter: '2026-INV', autumn: '2026-AUT' });
});
