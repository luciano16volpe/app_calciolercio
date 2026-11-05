import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { createTestDatabase } from './database';

test('il collaudo SQL Premium verifica le regole e annulla tutte le modifiche', async () => {
  const db = await createTestDatabase();
  try {
    await db.exec('grant select on storage.objects to authenticated; alter table storage.objects enable row level security;');
    const before = (await db.query("select feature,mode from feature_modes order by feature")).rows;
    await db.exec(readFileSync('supabase/tests/premium.sql', 'utf8'));
    expect((await db.query('select id from auth.users')).rows).toHaveLength(0);
    expect((await db.query('select id from leagues')).rows).toHaveLength(0);
    expect((await db.query('select feature,mode from feature_modes order by feature')).rows).toEqual(before);
  } finally { await db.close(); }
}, 60_000);
