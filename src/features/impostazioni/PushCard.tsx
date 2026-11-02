// Impostazioni → «Notifiche»: attivare / togliere il promemoria della mattina della partita su questo telefono.
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../app/auth';
import { useToast } from '../../app/Toast';
import { disablePush, enablePush, fetchPushPrefs, PUSH_KINDS, pushState, sendTestPush, setPushPref, type PushKind, type PushPrefs, type PushState } from '../../data/push';

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
  const [prefs, setPrefs] = useState<PushPrefs | null>(null);
  const refresh = useCallback(() => void pushState().then(setState).catch(() => setState('unsupported')), []);
  useEffect(() => {
    if (user) refresh();
  }, [user, refresh]);
  useEffect(() => {
    if (user && state === 'on') void fetchPushPrefs().then(setPrefs).catch(() => setPrefs(null));
  }, [user, state]);
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

  const toggle = async (kind: PushKind, on: boolean) => {
    const before = prefs;
    setPrefs((p) => (p ? { ...p, [kind]: on } : p));
    try {
      await setPushPref(kind, on);
    } catch (e) {
      setPrefs(before);
      toast('Errore: ' + (e as Error).message);
    }
  };

  return (
    <div className="card" id="push-card">
      <div className="section-header">🔔 Notifiche</div>
      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.4, marginBottom: 8 }}>
        Ti avvisiamo per le partite in cui sei in squadra: il promemoria della mattina e, a partita finita, risultato, pagelle e Gazzetta.
      </div>
      <div id="push-state" data-state={state ?? ''} style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: state === 'on' ? 'var(--green)' : 'var(--text)' }}>
        {state ? MSG[state] : '⏳ Controllo…'}
      </div>
      {state === 'off' ? <button type="button" id="push-enable" className="btn btn-primary btn-full" disabled={busy} onClick={() => void run(enablePush, 'Notifiche attivate')}>Attiva le notifiche</button> : null}
      {state === 'on' && prefs ? (
        <div id="push-prefs" style={{ marginBottom: 10 }}>
          {PUSH_KINDS.map((k) => (
            <label key={k.id} className="row-line" style={{ gap: 10, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" id={`push-pref-${k.id}`} checked={prefs[k.id]} onChange={(e) => void toggle(k.id, e.target.checked)} style={{ width: 20, height: 20, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{k.label}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--text3)' }}>{k.sub}</span>
              </span>
            </label>
          ))}
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
