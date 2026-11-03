// «Inviti giocatori» → pulsante «Invita»: si scrive un indirizzo email e si ottiene un LINK personale da mandare
// su WhatsApp o altrove. Chi lo apre entra nella lega e si collega a un giocatore o se ne crea uno.
// TODO: invio automatico dell'email (per ora il link si manda a mano; l'indirizzo serve solo a riconoscere l'invito).
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useToast } from '../../app/Toast';
import { createLeagueInvite, LEAGUE_INVITES_KEY, leagueInviteUrl, useLeagueInvites } from '../../data/invites';
import type { LeagueData } from '../../data/queries';
import { formatDate } from '../../domain/format';
import { shareText } from './LeagueSheets';

// campi di testo a 16px: sotto, iPhone ingrandisce la pagina
const field = { width: '100%', fontSize: 16, padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--gray3)', background: 'var(--card)', color: 'var(--text)', fontFamily: 'inherit', boxSizing: 'border-box' } as const;
const STATE = { valid: 'valido', used: 'usato', revoked: 'annullato', expired: 'scaduto' } as const;

export function LeagueInviteBox({ data }: { data: LeagueData }) {
  const lid = data.league.id;
  const toast = useToast();
  const qc = useQueryClient();
  const list = useLeagueInvites(lid, true);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ email: string; url: string } | null>(null);
  const [error, setError] = useState('');

  const message = (url: string) => `Ciao! Ti invito in ${data.league.name} su CalcioLercio. Apri questo link per entrare (vale 7 giorni): ${url}`;
  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copiato');
    } catch {
      toast(url);
    }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const token = await createLeagueInvite(lid, email);
      await qc.invalidateQueries({ queryKey: LEAGUE_INVITES_KEY });
      setMade({ email: email.trim().toLowerCase(), url: leagueInviteUrl(token) });
      setEmail('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const pending = (list.data ?? []).filter((i) => i.status === 'valid');

  return (
    <div className="card" id="league-invite-box" style={{ marginBottom: 12 }}>
      <button type="button" className="f-btn" id="invite-new" style={{ marginTop: 0 }} onClick={() => { setOpen((o) => !o); setMade(null); setError(''); }}>
        {open ? '✕ Chiudi' : '➕ Invita una persona'}
      </button>
      {open ? (
        <form onSubmit={(e) => void submit(e)} style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8, lineHeight: 1.4 }}>
            Scrivi l'<b>email</b> della persona: ottieni un link da mandare su WhatsApp o sui social. Chi lo apre — anche se ha già l'app — entra in <b>{data.league.name}</b> e si collega al suo giocatore o se ne crea uno. Vale per una persona sola, 7 giorni.
          </div>
          <input id="invite-email" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" style={field} placeholder="email@esempio.it" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit" className="btn btn-primary btn-full" id="invite-make" style={{ marginTop: 8 }} disabled={busy || !email.trim()}>🔗 Genera il link</button>
          {error ? <div id="invite-error" style={{ fontSize: 12, color: 'var(--red)', fontWeight: 700, marginTop: 8 }}>{error}</div> : null}
        </form>
      ) : null}
      {made ? (
        <div id="invite-made" style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Link per <b>{made.email}</b>:</div>
          <input readOnly style={{ ...field, fontSize: 16 }} value={made.url} onFocus={(e) => e.currentTarget.select()} aria-label="Link d'invito" />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} id="invite-share" onClick={() => void shareText(message(made.url), toast, 'Invito a CalcioLercio')}>📲 Condividi</button>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} id="invite-copy" onClick={() => void copy(made.url)}>📋 Copia link</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, lineHeight: 1.4 }}>L'email non viene ancora inviata: manda tu il link. (In futuro partirà in automatico.)</div>
        </div>
      ) : null}
      {pending.length ? (
        <div id="invite-pending" style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Inviti in sospeso</div>
          {pending.map((i) => (
            <div key={i.token} className="row-line" style={{ gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.email}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{STATE[i.status]} fino al {formatDate(i.expiresAt.slice(0, 10))}</div>
              </div>
              <button type="button" className="mini-btn" onClick={() => void copy(leagueInviteUrl(i.token))} aria-label={`Copia il link per ${i.email}`}>📋 Copia link</button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
