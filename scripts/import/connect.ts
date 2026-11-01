// Collegamenti dello strumento di importazione: Supabase (come amministratore) e lo script Google.
//
// La chiave di amministrazione (service_role) NON sta in nessun file: la chiede alla CLI di Supabase,
// dove sei già collegato (`npx supabase login`), la tiene solo in memoria e non la stampa mai.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/data/types';
import type { LegacyFeed, LegacyRosa } from './map';

export const PROJECT_REF = 'ivrwqpuikbnvnxgvgegd';
export const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
export type Admin = SupabaseClient<Database>;

/** Chiave di amministrazione dalla CLI di Supabase. In caso di errore il messaggio non contiene mai la chiave. */
function serviceKeyFromCli(): string {
  let out: string;
  try {
    out = execFileSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['supabase', 'projects', 'api-keys', '--project-ref', PROJECT_REF, '-o', 'json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' },
    );
  } catch {
    throw new Error('Non riesco a chiedere la chiave alla CLI di Supabase. Sei collegato? Prova: npx supabase login');
  }
  let keys: Array<{ name?: string; type?: string; api_key?: string }>;
  try {
    keys = JSON.parse(out);
  } catch {
    throw new Error('Risposta inattesa dalla CLI di Supabase (non riesco a leggere le chiavi).');
  }
  const k = keys.find((x) => x.name === 'service_role') ?? keys.find((x) => x.type === 'secret');
  if (!k?.api_key) throw new Error('La CLI non ha restituito una chiave di amministrazione per questo progetto.');
  return k.api_key;
}

export function adminClient(): Admin {
  // l'intestazione fa comparire nel registro attività l'origine «importazione» (supabase/migrations/…registro_attivita.sql)
  return createClient<Database>(SUPABASE_URL, serviceKeyFromCli(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-audit-source': 'import' } },
  });
}

/** Client pubblico (chiave anon, quella dell'app): serve a verificare cosa vede chi non ha un account. */
export function anonClient(): Admin {
  const env = Object.fromEntries(
    readFileSync(join(process.cwd(), '.env.local'), 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.startsWith('VITE_SUPABASE_'))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
  );
  return createClient<Database>(env.VITE_SUPABASE_URL as string, env.VITE_SUPABASE_ANON_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ── dati attuali ───────────────────────────────────────────────────────────
export function readRosa(path = join(process.cwd(), 'legacy', 'rosa_calcetto.json')): LegacyRosa & { backendUrl: string } {
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function scriptGet(backendUrl: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const url = backendUrl + (backendUrl.includes('?') ? '&' : '?') + new URLSearchParams(params).toString();
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Lo script Google ha risposto HTTP ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;
  if (data.ok === false) throw new Error(`Lo script Google ha risposto con un errore: ${String(data.error)}`);
  return data;
}

/** Partite, pagelle, albo e Gazzette: l'azione `matches` dello script Google (sola lettura). */
export async function fetchFeed(backendUrl: string): Promise<LegacyFeed> {
  const d = await scriptGet(backendUrl, { action: 'matches' });
  return {
    matches: (d.matches as LegacyFeed['matches']) ?? [],
    ratings: (d.ratings as LegacyFeed['ratings']) ?? [],
    albo: (d.albo as LegacyFeed['albo']) ?? [],
    gazzette: (d.gazzette as LegacyFeed['gazzette']) ?? [],
  };
}

/** L'immagine di una Gazzetta da Google Drive (azione `gazFile`, sola lettura). */
export async function fetchGazzettaFile(backendUrl: string, fileId: string): Promise<{ mime: string; bytes: Buffer }> {
  const d = await scriptGet(backendUrl, { action: 'gazFile', id: fileId });
  return { mime: String(d.mime ?? 'image/jpeg'), bytes: Buffer.from(String(d.data ?? ''), 'base64') };
}
