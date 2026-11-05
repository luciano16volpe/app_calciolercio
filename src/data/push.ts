// Notifiche push: iscrivere / togliere questo telefono e mandare una notifica di prova.
import { supabase } from './supabase';

/** Stato di questo telefono rispetto alle notifiche. */
export type PushState =
  | 'unsupported'   // il browser non le sa fare
  | 'needs-install' // iPhone/iPad: funzionano solo con l'app installata nella schermata Home
  | 'denied'        // il permesso è stato negato: si cambia dalle impostazioni del telefono
  | 'off'           // si possono attivare
  | 'on';           // attive su questo telefono

const isIOS = (): boolean => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = (): boolean =>
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
  (window.matchMedia != null && window.matchMedia('(display-mode: standalone)').matches);

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Stato attuale (senza aspettare il service worker se non c'è). */
export async function pushState(): Promise<PushState> {
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** La chiave pubblica per l'iscrizione (base64url) → byte. */
function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Chiede il permesso, iscrive il telefono e lo registra nel database. */
export async function enablePush(): Promise<void> {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permesso negato: le notifiche si riattivano dalle impostazioni del telefono');
  const { data: key, error } = await supabase.rpc('push_public_key');
  if (error) throw new Error(error.message);
  if (!key) throw new Error('Le notifiche non sono ancora configurate sul server');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
  const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!j.endpoint || !j.keys?.p256dh || !j.keys.auth) throw new Error('Iscrizione non valida');
  const r = await supabase.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: navigator.userAgent });
  if (r.error) throw new Error(r.error.message);
}

/** Toglie le notifiche da questo telefono. */
export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  const { error } = await supabase.rpc('remove_push_subscription', { p_endpoint: endpoint });
  if (error) throw new Error(error.message);
}

/** Manda una notifica di prova a tutti i telefoni di chi la chiede. Restituisce quanti telefoni l'hanno ricevuta. */
export async function sendTestPush(): Promise<number> {
  const { data: s } = await supabase.auth.getSession();
  const token = s.session?.access_token;
  if (!token) throw new Error('Devi prima accedere');
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  const res = await fetch(`${base}/functions/v1/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string },
    body: JSON.stringify({ test: true }),
  });
  const body = (await res.json().catch(() => ({}))) as { inviate?: number; error?: string };
  if (!res.ok) throw new Error(body.error ?? 'Non riesco a mandare la notifica di prova');
  return body.inviate ?? 0;
}

/** Tipi di notifica che ognuno può accendere o spegnere. */
export type PushKind = 'reminder' | 'result' | 'ratings' | 'gazzetta' | 'change';
export type PushPrefs = Record<PushKind, boolean> & { enabled: boolean; reminder_minutes: number | null; customizable: boolean };
export const PUSH_KINDS: { id: PushKind; label: string; sub: string }[] = [
  { id: 'reminder', label: 'Promemoria della partita', sub: 'ora, luogo e squadra prima di giocare' },
  { id: 'change', label: 'Programma e convocazione', sub: 'cambi di giorno, ora, luogo o squadre; anche se vieni sostituito' },
  { id: 'result', label: 'Risultato inserito', sub: 'quando viene salvato il risultato della tua partita' },
  { id: 'ratings', label: 'Pagelle pronte', sub: 'quando titoli e descrizioni sono stati scritti' },
  { id: 'gazzetta', label: 'Gazzetta caricata', sub: 'quando esce la Gazzetta della partita' },
];

export async function fetchPushPrefs(): Promise<PushPrefs> {
  const { data, error } = await supabase.rpc('my_push_prefs');
  if (error) throw new Error(error.message);
  const r = (Array.isArray(data) ? data[0] : data) as Partial<PushPrefs> | undefined;
  return { reminder: r?.reminder !== false, result: r?.result !== false, ratings: r?.ratings !== false, gazzetta: r?.gazzetta !== false,
    change: r?.change !== false, enabled: r?.enabled !== false, reminder_minutes: r?.reminder_minutes ?? null, customizable: r?.customizable === true };
}

export async function setPushPref(kind: PushKind, on: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_push_pref', { p_kind: kind, p_on: on });
  if (error) throw new Error(error.message);
}

export async function setPushEnabled(on: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_push_enabled', { p_on: on });
  if (error) throw new Error(error.message);
}

export async function setPushReminder(minutes: number | null): Promise<void> {
  const { error } = await supabase.rpc('set_push_reminder', { p_minutes: minutes });
  if (error) throw new Error(error.message);
}
