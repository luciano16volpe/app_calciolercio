import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { createTestDatabase } from './database';

test('il collaudo SQL delle notifiche passa e annulla tutti i dati',async()=>{
  const db=await createTestDatabase();
  try {
    await db.exec(readFileSync('supabase/tests/notifiche_premium.sql','utf8'));
    for(const table of ['auth.users','public.leagues','public.push_prefs','public.push_program_changes','public.push_program_state']) {
      expect((await db.query(`select count(*)::integer as n from ${table}`)).rows).toEqual([{n:0}]);
    }
  } finally { await db.close(); }
},60_000);
