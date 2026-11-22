import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { createTestDatabase } from './database';

test('solo i partecipanti Premium possono inviare voti e i precedenti restano salvati', async () => {
  const db = await createTestDatabase();
  try {
    await db.exec(readFileSync('supabase/tests/voto_partecipanti_premium.sql', 'utf8'));
    expect((await db.query('select match_id from public.community_votes')).rows).toHaveLength(0);
  } finally { await db.close(); }
}, 60_000);
