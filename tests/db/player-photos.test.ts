import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase } from './database';

const admin = '30000000-0000-4000-8000-000000000001';
const owner = '30000000-0000-4000-8000-000000000002';
const outsider = '30000000-0000-4000-8000-000000000003';
const league = '30000000-0000-4000-8000-000000000004';
const player = '30000000-0000-4000-8000-000000000005';
const photo = (n: number) => `${player}-${n}.jpg`;
let db: PGlite;
beforeAll(async () => { db = await createTestDatabase(); }, 60_000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec(`begin;
    insert into auth.users(id,email) values ('${admin}','admin@test.invalid'),('${owner}','owner@test.invalid'),('${outsider}','outsider@test.invalid');
    insert into leagues(id,name,owner_id,created_by) values ('${league}','Foto','${admin}','${admin}');
    insert into league_members(league_id,user_id,role) values ('${league}','${admin}','admin'),('${league}','${owner}','member');
    insert into players(id,name,user_id) values ('${player}','Fotografo','${owner}');
    insert into league_players(league_id,player_id) values ('${league}','${player}');
    insert into storage.objects(bucket_id,name) values ('photos','${photo(1)}'),('photos','${photo(2)}'),('photos','${photo(3)}'),('photos','${photo(4)}');
  `);
});
afterEach(async () => { await db.exec('rollback; reset role;'); });
async function asUser(id: string) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
  await db.exec('set local role authenticated');
}
const manage = (action: string, path: string, old: string | null = null) =>
  db.query('select manage_player_photo($1::uuid,$2::text,$3::text,$4::text)', [player, action, path, old]);

test('il proprietario conserva tre foto, cambia quella attiva e sostituisce uno slot', async () => {
  await asUser(owner);
  await manage('add', photo(1));
  await manage('add', photo(2));
  await manage('add', photo(3));
  await db.exec('savepoint gallery_full');
  await expect(manage('add', photo(4))).rejects.toThrow(/massimo 3 foto/);
  await db.exec('rollback to savepoint gallery_full');
  await manage('select', photo(1));
  await manage('replace', photo(4), photo(2));
  await db.exec('reset role');
  expect((await db.query('select photo_path,photo_gallery from players where id=$1', [player])).rows[0])
    .toEqual({ photo_path: photo(1), photo_gallery: [photo(1), photo(4), photo(3)] });
});

test('l’admin può gestire le foto, un estraneo no', async () => {
  await asUser(admin);
  await manage('add', photo(1));
  await asUser(outsider);
  await db.exec('savepoint denied');
  await expect(manage('remove', photo(1))).rejects.toThrow(/Non puoi modificare/);
  await db.exec('rollback to savepoint denied');
});

test('non si può registrare un file mancante o appartenente a un altro giocatore', async () => {
  await asUser(owner);
  await db.exec('savepoint missing');
  await expect(manage('add', photo(9))).rejects.toThrow(/Carica la foto/);
  await db.exec('rollback to savepoint missing');
  await db.exec('savepoint foreign_path');
  await expect(manage('add', `${outsider}-1.jpg`)).rejects.toThrow(/Percorso foto non valido/);
  await db.exec('rollback to savepoint foreign_path');
});

test('un vecchio client che cambia solo photo_path aggiorna anche la galleria', async () => {
  await db.query('update players set photo_path=$1 where id=$2', [photo(1), player]);
  await db.query('update players set photo_path=$1 where id=$2', [photo(2), player]);
  expect((await db.query('select photo_path,photo_gallery from players where id=$1', [player])).rows[0])
    .toEqual({ photo_path: photo(2), photo_gallery: [photo(2)] });
});
