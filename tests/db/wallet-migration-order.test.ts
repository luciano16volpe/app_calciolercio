import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { createTestDatabase } from './database';

const point2=readFileSync('supabase/migrations/20270112000000_dollalerci_puntate.sql','utf8');
const point3=readFileSync('supabase/migrations/20270113000000_dollalerci_montepremi.sql','utf8');

test('il punto 2 indica subito se manca il conto del punto 1', async () => {
  const db=await createTestDatabase('20270110000000_chi_manca_e_chi_non_puo_votare.sql');
  try {
    await expect(db.exec(point2)).rejects.toThrow(/Manca la migrazione 20270111000000_dollalerci_conto.sql/);
    const row=(await db.query<{stakes:string|null}>("select to_regclass('public.wallet_stakes')::text as stakes")).rows[0];
    expect(row?.stakes).toBeNull();
  } finally { await db.close(); }
});

test('il punto 3 indica subito quale migrazione manca, senza creare tabelle', async () => {
  const db=await createTestDatabase('20270111000000_dollalerci_conto.sql');
  try {
    await expect(db.exec(point3)).rejects.toThrow(/Manca la migrazione 20270112000000_dollalerci_puntate.sql/);
    const row=(await db.query<{pool:string|null}>("select to_regclass('public.wallet_match_pools')::text as pool")).rows[0];
    expect(row?.pool).toBeNull();
  } finally { await db.close(); }
});

test('ripara una precedente esecuzione parziale del punto 3', async () => {
  const db=await createTestDatabase('20270111000000_dollalerci_conto.sql');
  try {
    const partial=point3.slice(point3.indexOf('create table if not exists public.wallet_match_pools'),
      point3.indexOf('-- Recupera le partite già consolidate'));
    await db.exec(partial);
    await db.exec(point2);
    await db.exec(point3);
    await db.exec(point3);
    const row=(await db.query<{stakes:string|null;pools:string|null;reconcile:string|null}>(
      "select to_regclass('public.wallet_stakes')::text as stakes, to_regclass('public.wallet_match_pools')::text as pools, to_regprocedure('public.advanced_prediction_reconcile(uuid,jsonb)')::text as reconcile"
    )).rows[0];
    expect(row?.stakes).toBe('wallet_stakes');
    expect(row?.pools).toBe('wallet_match_pools');
    expect(row?.reconcile).toContain('advanced_prediction_reconcile');
  } finally { await db.close(); }
});
