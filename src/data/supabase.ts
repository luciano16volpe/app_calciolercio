import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Nel browser vanno SOLO URL e chiave pubblica (anon). Mai la chiave service_role.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn('Supabase non configurato: crea .env.local (vedi .env.example).');
}

export const supabase = createClient<Database>(url ?? 'http://localhost', anonKey ?? 'missing');
