// Scheda "Account" nelle Impostazioni: accesso con email e password, ruolo nella lega, uscita, password dimenticata.
import { useState, type FormEvent } from 'react';
import { useAuth, useRole } from '../../app/auth';

const ROLE_LABEL = { admin: 'Amministratore', redazione: 'Redazione', member: 'Membro' } as const;
// campi di testo a 16px: sotto, iPhone ingrandisce la pagina
const field = { width: '100%', fontSize: 16, padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', marginBottom: 8, boxSizing: 'border-box' } as const;
const note = { fontSize: 12, color: 'var(--text3)', marginTop: 8 } as const;

export function AccountCard({ leagueId }: { leagueId: string | undefined }) {
  const { user, loading, recovery, signIn, signOut, sendReset, setPassword } = useAuth();
  const { role } = useRole(leagueId);
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (f: () => Promise<string | null>, okText?: string) => {
    setBusy(true);
    setMsg(null);
    const err = await f();
    setBusy(false);
    if (err) setMsg({ ok: false, text: err });
    else if (okText) setMsg({ ok: true, text: okText });
    return !err;
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (recovery) {
      if (pwd.length < 6) return setMsg({ ok: false, text: 'La password deve avere almeno 6 caratteri.' });
      void run(() => setPassword(pwd), 'Password salvata.').then((ok) => ok && setPwd(''));
      return;
    }
    if (!email.trim() || !pwd) return setMsg({ ok: false, text: 'Scrivi email e password.' });
    void run(() => signIn(email, pwd)).then((ok) => ok && setPwd(''));
  };

  return (
    <div className="card" id="account-card">
      <div className="section-header">👤 Account</div>
      {loading ? (
        <div style={note}>⏳ Controllo l'accesso…</div>
      ) : recovery ? (
        <form onSubmit={submit}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>Scegli la nuova password.</div>
          <input type="password" autoComplete="new-password" placeholder="Nuova password (almeno 6 caratteri)" value={pwd} onChange={(e) => setPwd(e.target.value)} style={field} />
          <button className="btn btn-primary btn-full" disabled={busy}>Salva la password</button>
        </form>
      ) : user ? (
        <div>
          <div style={{ fontSize: 13 }}>
            Sei dentro come <b>{user.email}</b>
          </div>
          <div style={{ fontSize: 13, marginTop: 4 }} id="account-role">
            {role ? <>Ruolo: <b>{ROLE_LABEL[role]}</b></> : 'Non sei un membro di questa lega: puoi solo guardare.'}
          </div>
          <button className="btn btn-secondary btn-full" style={{ marginTop: 10 }} onClick={() => void signOut()}>Esci</button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>Per modificare partite e voti serve l'accesso. Per guardare no.</div>
          <input type="email" autoComplete="username" inputMode="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={field} />
          <input type="password" autoComplete="current-password" placeholder="Password" value={pwd} onChange={(e) => setPwd(e.target.value)} style={field} />
          <button className="btn btn-primary btn-full" disabled={busy}>Accedi</button>
          <button
            type="button"
            className="btn btn-secondary btn-full"
            style={{ marginTop: 8 }}
            disabled={busy}
            onClick={() => {
              if (!email.trim()) return setMsg({ ok: false, text: 'Scrivi prima la tua email.' });
              void run(() => sendReset(email), 'Ti ho mandato una email: tocca il link per scegliere la password.');
            }}
          >
            Prima volta o password dimenticata
          </button>
        </form>
      )}
      {msg ? <div id="account-msg" style={{ ...note, color: msg.ok ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{msg.text}</div> : null}
    </div>
  );
}
