// PostgreSQL reale in memoria: Supabase Auth/Storage sono sostituiti solo nei servizi di piattaforma.
// Le migrazioni, le RLS e i trigger applicativi sono quelli del repository.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';

export async function createTestDatabase() {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role service_role bypassrls;
      create role authenticated;
      create schema auth;
      create schema storage;
      create schema extensions;
      create table auth.users (
        id uuid primary key, email text, raw_user_meta_data jsonb default '{}',
        aud text, role text, instance_id uuid, created_at timestamptz default now()
      );
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table storage.buckets (id text primary key, name text, public boolean);
      create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
      create function storage.foldername(name text) returns text[] language sql immutable as
        $$ select string_to_array(name, '/') $$;
      grant usage on schema public, auth, storage to authenticated, anon;
      alter default privileges in schema public grant all on tables to authenticated;
      alter default privileges in schema public grant all on sequences to authenticated;
    `);
    for (const file of readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()) {
      // pg_net esegue richieste HTTP e non e' disponibile nel PostgreSQL WASM.
      // Le sue funzioni non vengono chiamate nei test; pg_cron e' gia' opzionale nelle migrazioni.
      const sql = readFileSync(`supabase/migrations/${file}`, 'utf8')
        .replace(/^create extension if not exists pg_net with schema extensions;\r?$/m, '');
      try { await db.exec(sql); }
      catch (error) { throw new Error(`Migrazione ${file}: ${(error as Error).message}`, { cause: error }); }
    }
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
