// Servizio che invia le notifiche push (Supabase Edge Function).
//  · job «reminders» (pg_cron controlla ogni minuto): promemoria standard alle 7 o anticipo Premium;
//  · job «events» (pg_cron controlla ogni minuto): programma/convocazione, risultato, pagelle pronte, Gazzetta;
//  · {"test": true} con l'accesso dell'utente (dall'app, Impostazioni → Notifiche): notifica di prova ai telefoni di chi la chiede.
// Chiavi e segreti stanno nei «Secrets» del progetto Supabase (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET), mai nel codice.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { buildMessage, type EventInput } from '../_shared/reminder.ts';

const url = Deno.env.get('SUPABASE_URL') as string;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string; // fornita dalla piattaforma
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
webpush.setVapidDetails('https://calciolercio.vercel.app', Deno.env.get('VAPID_PUBLIC_KEY') as string, Deno.env.get('VAPID_PRIVATE_KEY') as string);

interface Sub { endpoint: string; p256dh: string; auth: string }
interface DueRow extends EventInput, Sub { user_id: string }

/** Manda a un telefono. Restituisce 'ok', 'gone' (iscrizione scaduta: da togliere) o 'error'. */
async function send(sub: Sub, payload: unknown): Promise<'ok' | 'gone' | 'error'> {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 6 * 3600 });
    return 'ok';
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    return code === 404 || code === 410 ? 'gone' : 'error';
  }
}

async function dropGone(endpoints: string[]) {
  if (endpoints.length) await admin.from('push_subscriptions').delete().in('endpoint', endpoints);
}

/** Manda quello che c'è da mandare: promemoria all'orario previsto oppure altri eventi. */
async function runJob(job: 'reminders' | 'events', dryRun: boolean) {
  const { data, error } = await admin.rpc('push_due');
  if (error) return json({ error: error.message }, 500);
  const rows = ((data ?? []) as DueRow[]).filter((r) => (job === 'reminders' ? r.kind === 'reminder' : r.kind !== 'reminder'));
  // una notifica per persona, partita e tipo, a tutti i suoi telefoni
  const key = (r: DueRow) => `${r.kind}|${r.user_id}|${r.match_id}`;
  const groups = new Map<string, DueRow[]>();
  for (const r of rows) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
  if (dryRun) return json({ dryRun: true, persone: groups.size, telefoni: rows.length });
  let sent = 0, failed = 0;
  const gone: string[] = [];
  for (const list of groups.values()) {
    const first = list[0] as DueRow;
    const msg = buildMessage(first);
    let ok = 0;
    for (const sub of list) {
      const res = await send(sub, msg);
      if (res === 'ok') ok++;
      else if (res === 'gone') gone.push(sub.endpoint);
    }
    if (ok > 0) {
      sent++;
      await admin.from('push_sent').upsert({ kind: first.kind, match_id: first.match_id, user_id: first.user_id }, { onConflict: 'kind,match_id,user_id', ignoreDuplicates: true });
    } else failed++;
  }
  await dropGone(gone);
  return json({ persone: groups.size, inviate: sent, fallite: failed, iscrizioniScadute: gone.length });
}

async function runTest(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: u, error } = await admin.auth.getUser(token);
  if (error || !u.user) return json({ error: 'Devi prima accedere' }, 401);
  const { data: subs } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', u.user.id);
  const list = (subs ?? []) as Sub[];
  if (!list.length) return json({ error: 'Nessun telefono con le notifiche attive' }, 400);
  let ok = 0;
  const gone: string[] = [];
  for (const sub of list) {
    const res = await send(sub, { title: 'CalcioLercio', body: '🔔 Le notifiche su questo telefono funzionano.', url: '/', tag: 'prova' });
    if (res === 'ok') ok++;
    else if (res === 'gone') gone.push(sub.endpoint);
  }
  await dropGone(gone);
  return ok > 0 ? json({ inviate: ok }) : json({ error: 'Non sono riuscito a inviare: riattiva le notifiche' }, 502);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Metodo non ammesso' }, 405);
  const body = (await req.json().catch(() => ({}))) as { job?: string; test?: boolean; dryRun?: boolean };
  const secret = req.headers.get('x-cron-secret');
  if (secret) {
    if (secret !== Deno.env.get('CRON_SECRET')) return json({ error: 'Non autorizzato' }, 401);
    return body.job === 'reminders' || body.job === 'events' ? runJob(body.job, !!body.dryRun) : json({ error: 'Lavoro sconosciuto' }, 400);
  }
  if (body.test) return runTest(req);
  return json({ error: 'Non autorizzato' }, 401);
});
