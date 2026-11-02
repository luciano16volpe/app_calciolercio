// Impostazioni → «Cambia la password» (solo con l'accesso): nuova password scritta due volte.
import { useState, type FormEvent } from 'react';
import { useAuth } from '../../app/auth';

// campi di testo a 16px: sotto, iPhone ingrandisce la pagina
const field = { width: '100%', fontSize: 16, padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--gray3)', background: 'var(--gray)', color: 'var(--text)', marginBottom: 8, boxSizing: 'border-box' } as const;

export function PasswordCard() {
  const { user, loading, recovery, setPassword } = useAuth();
  const [pwd, setPwd] = useState('');
  const [again, setAgain] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // senza accesso non c'è niente da cambiare; durante il recupero la scelta della password è già nella scheda Account
  if (!user || loading || recovery) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pwd.length < 6) return setMsg({ ok: false, text: 'La password deve avere almeno 6 caratteri.' });
    if (pwd !== again) return setMsg({ ok: false, text: 'Le due password non sono uguali.' });
    setBusy(true);
    setMsg(null);
    const err = await setPassword(pwd);
    setBusy(false);
    if (err) return setMsg({ ok: false, text: err });
    setPwd('');
    setAgain('');
    setMsg({ ok: true, text: 'Password cambiata.' });
  };

  return (
    <div className="card" id="password-card">
      <div className="section-header">🔑 Cambia la password</div>
      <form onSubmit={(e) => void submit(e)}>
        <input id="pwd-new" type="password" autoComplete="new-password" placeholder="Nuova password (almeno 6 caratteri)" aria-label="Nuova password" value={pwd} onChange={(e) => setPwd(e.target.value)} style={field} />
        <input id="pwd-again" type="password" autoComplete="new-password" placeholder="Scrivila di nuovo" aria-label="Ripeti la nuova password" value={again} onChange={(e) => setAgain(e.target.value)} style={field} />
        <button className="btn btn-primary btn-full" id="pwd-save" disabled={busy}>Cambia la password</button>
      </form>
      {msg ? <div id="pwd-msg" role="status" style={{ fontSize: 12, marginTop: 8, fontWeight: 700, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.text}</div> : null}
    </div>
  );
}
