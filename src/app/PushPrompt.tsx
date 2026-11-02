// Al primo accesso di chi ha un giocatore collegato: «Attiva le notifiche?». Il telefono vuole il tocco della persona
// (il permesso non si può dare da soli), quindi la domanda compare una volta sola; dopo «Non ora» si attiva dalle Impostazioni.
import { useEffect, useState } from 'react';
import { useAuth } from './auth';
import { useToast } from './Toast';
import { useMyPlayer } from '../data/claims';
import { enablePush, pushState } from '../data/push';

const KEY = (userId: string) => `calcio_push_prompt_${userId}`;

export function PushPrompt() {
  const { user } = useAuth();
  const toast = useToast();
  const mine = useMyPlayer(user?.id ?? null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const userId = user?.id ?? null;
  const linked = !!mine.data?.linked;

  useEffect(() => {
    if (!userId || !linked) return;
    try {
      if (localStorage.getItem(KEY(userId))) return;
    } catch {
      /* memoria bloccata: si chiede comunque */
    }
    let alive = true;
    void pushState().then((s) => {
      // solo se si possono attivare adesso (su iPhone serve l'app installata: lo spiega la guida «Installa»)
      if (alive && s === 'off' && Notification.permission === 'default') setShow(true);
    });
    return () => {
      alive = false;
    };
  }, [userId, linked]);

  if (!show || !userId) return null;
  const remember = () => {
    try {
      localStorage.setItem(KEY(userId), '1');
    } catch {
      /* memoria bloccata */
    }
  };
  const later = () => {
    remember();
    setShow(false);
  };
  const enable = async () => {
    setBusy(true);
    try {
      await enablePush(); // dentro il tocco: iPhone apre la richiesta di permesso solo così
      remember();
      setShow(false);
      toast('Notifiche attivate');
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
      remember();
      setShow(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '10px 8px 0' }}>
      <div className="card" id="push-prompt" role="region" aria-label="Notifiche" style={{ marginBottom: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>🔔 Vuoi le notifiche?</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.4, margin: '4px 0 10px' }}>
          Ti ricordiamo la mattina della partita ora, luogo e squadra, e ti avvisiamo quando escono risultato, pagelle e Gazzetta. Le puoi cambiare quando vuoi dalle Impostazioni.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" id="push-prompt-yes" className="btn btn-primary btn-sm" style={{ flex: 1 }} disabled={busy} onClick={() => void enable()}>Attiva</button>
          <button type="button" id="push-prompt-later" className="btn btn-secondary btn-sm" style={{ flex: 1 }} disabled={busy} onClick={later}>Non ora</button>
        </div>
      </div>
    </div>
  );
}
