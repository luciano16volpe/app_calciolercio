// Impostazioni → «Notifiche»: attivare / togliere il promemoria della mattina della partita su questo telefono.
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../app/auth';
import { useToast } from '../../app/Toast';
import { disablePush, enablePush, fetchPushPrefs, PUSH_KINDS, pushState, sendTestPush, setPushPref, setPushEnabled, setPushReminder, type PushKind, type PushPrefs, type PushState } from '../../data/push';
import { useMyPremium } from '../../data/premium';

const MSG: Record<PushState, string> = {
  unsupported: 'Questo telefono o browser non supporta le notifiche.',
  'needs-install': 'Su iPhone le notifiche funzionano solo con l’app installata: tocca Condividi ⬆︎ in Safari e «Aggiungi alla schermata Home», poi apri l’app da lì.',
  denied: 'Le notifiche sono bloccate: riattivale dalle impostazioni del telefono (Notifiche → CalcioLercio).',
  off: 'Non sono attive su questo telefono.',
  on: 'Attive su questo telefono.',
};

export function PushCard() {
  const { user, loading } = useAuth();
  const toast = useToast();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadedPrefs, setLoadedPrefs] = useState<{ userId: string; prefs: PushPrefs } | null>(null);
  const userId=user?.id;
  const prefs=loadedPrefs?.userId === userId ? loadedPrefs?.prefs ?? null : null;
  const setPrefs=useCallback((value: PushPrefs | null) => {
    setLoadedPrefs(userId && value ? { userId, prefs: value } : null);
  }, [userId]);
  const [prefError, setPrefError] = useState('');
  const [saving, setSaving] = useState(false);
  const premium = useMyPremium(user?.id ?? null);
  const customizable = prefs?.customizable === true && premium.data?.active === true;
  const refresh = useCallback(() => void pushState().then(setState).catch(() => setState('unsupported')), []);
  useEffect(() => {
    if (user) refresh();
  }, [user, refresh]);
  useEffect(() => {
    let active = true;
    if (user && state === 'on') void fetchPushPrefs().then((p) => { if (active) { setPrefs(p); setPrefError(''); } })
      .catch(() => { if (active) setPrefError('Non riesco a caricare le preferenze. Chiudi e riapri le impostazioni per riprovare.'); });
    return () => { active = false; };
  }, [user, state, premium.data?.active, setPrefs]);
  if (!user || loading) return null;

  const run = async (f: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await f();
      toast(ok);
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const update = async (next: PushPrefs, save: () => Promise<void>) => {
    const before = prefs;
    setSaving(true);
    setPrefs(next);
    try {
      await save();
    } catch (e) {
      setPrefs(before);
      toast('Errore: ' + (e as Error).message);
    } finally { setSaving(false); }
  };

  return (
    <div className="card" id="push-card">
      <div className="section-header">🔔 Notifiche</div>
      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.4, marginBottom: 8 }}>
        Le notifiche sono disponibili per tutti: promemoria, variazioni del programma e della convocazione, risultato e pagelle. L’avviso delle Gazzette è riservato a chi ha Premium.
      </div>
      <div id="push-state" data-state={state ?? ''} style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: state === 'on' ? 'var(--green)' : 'var(--text)' }}>
        {state ? MSG[state] : '⏳ Controllo…'}
      </div>
      {state === 'off' ? <button type="button" id="push-enable" className="btn btn-primary btn-full" disabled={busy} onClick={() => void run(enablePush, 'Notifiche attivate')}>Attiva le notifiche</button> : null}
      {state === 'on' && prefError ? <p role="alert">{prefError}</p> : null}
      {state === 'on' && prefs ? (
        <div id="push-prefs" style={{ marginBottom: 10 }}>
          <label className="row-line" style={{ gap: 10 }}>
            <input type="checkbox" id="push-enabled" checked={prefs.enabled} disabled={saving} onChange={(e) => {
              const on=e.target.checked;
              void update({ ...prefs, enabled: on }, () => setPushEnabled(on));
            }} />
            <span>Ricevi notifiche su tutti i tuoi telefoni</span>
          </label>
          {!prefs.enabled ? <p style={{ fontSize: 12 }}>Notifiche sospese per il tuo account. Puoi riattivarle qui gratuitamente.</p> : null}
          {!customizable ? <p id="push-standard" style={{ fontSize: 12 }}>Standard: promemoria alle 7 del giorno della partita e avvisi predefiniti. Le disattivazioni già scelte restano valide. Con Premium scegli i tipi e l’anticipo del promemoria.</p> : null}
          {customizable ? <fieldset disabled={saving || !prefs.enabled} style={{ border: 0, margin: 0, padding: 0 }}>
          {PUSH_KINDS.map((k) => (
            <label key={k.id} className="row-line" style={{ gap: 10, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" id={`push-pref-${k.id}`} checked={prefs[k.id]} onChange={(e) => {
                const on=e.target.checked;
                void update({ ...prefs, [k.id]: on }, () => setPushPref(k.id as PushKind, on));
              }} style={{ width: 20, height: 20, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{k.label}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--text3)' }}>{k.sub}</span>
              </span>
            </label>
          ))}
          <label style={{ display: 'block', fontSize: 13, marginTop: 10 }}>Quando ricevere il promemoria
            <select id="push-reminder-time" value={prefs.reminder_minutes ?? ''} disabled={!prefs.reminder} onChange={(e) => {
              const minutes=e.target.value === '' ? null : Number(e.target.value);
              void update({ ...prefs, reminder_minutes: minutes }, () => setPushReminder(minutes));
            }} style={{ display: 'block', width: '100%', marginTop: 5, padding: 10, font: 'inherit', background: 'var(--gray)', color: 'var(--text)', border: '1px solid var(--gray3)', borderRadius: 8 }}>
              <option value="">Alle 7 del giorno della partita</option>
              <option value="60">1 ora prima</option><option value="120">2 ore prima</option>
              <option value="180">3 ore prima</option><option value="1440">24 ore prima</option>
            </select>
          </label>
          </fieldset> : null}
        </div>
      ) : null}
      {state === 'on' ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" id="push-test" className="btn btn-secondary btn-sm" style={{ flex: '1 1 auto', whiteSpace: 'normal' }} disabled={busy} onClick={() => void run(async () => { await sendTestPush(); }, 'Notifica di prova inviata')}>Invia una notifica di prova</button>
          <button type="button" id="push-disable" className="btn btn-secondary btn-sm" style={{ flex: '1 1 auto', whiteSpace: 'normal' }} disabled={busy} onClick={() => void run(disablePush, 'Notifiche disattivate')}>Disattiva</button>
        </div>
      ) : null}
    </div>
  );
}
