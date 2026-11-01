// Pagina del link d'invito personale (/invito/<token>): registrazione o accesso, poi l'invito si accetta da solo.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../app/auth';
import { acceptInvite, previewInvite, type Accepted } from '../../data/invites';
import { MY_LEAGUES_KEY } from '../../data/leagues';
import { LEAGUE_QUERY_KEY } from '../../data/queries';
import { MY_PLAYER_KEY } from '../../data/claims';
import { AccountCard } from '../impostazioni/AccountCard';

const REASON = {
  used: 'Questo link è già stato usato.',
  revoked: 'Questo link non è più valido: chiedi un nuovo invito.',
  expired: 'Questo link è scaduto: chiedi un nuovo invito.',
  invalid: 'Link non valido: chiedi un nuovo invito.',
} as const;

export function InvitePage({ token, onDone }: { token: string; onDone: (a: Accepted | null) => void }) {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const preview = useQuery({ queryKey: ['invite-preview', token], queryFn: () => previewInvite(token), retry: false });
  const [result, setResult] = useState<Accepted | null>(null);
  const [error, setError] = useState('');
  const tried = useRef(false);

  // dopo l'accesso l'invito si accetta da solo (una volta); se è già stato accettato dallo stesso account non è un errore
  useEffect(() => {
    if (!user || tried.current) return;
    tried.current = true;
    acceptInvite(token)
      .then(async (a) => {
        setResult(a);
        await Promise.all([qc.invalidateQueries({ queryKey: MY_LEAGUES_KEY }), qc.invalidateQueries({ queryKey: MY_PLAYER_KEY }), qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY })]);
      })
      .catch((e: Error) => setError(e.message));
  }, [user, token, qc]);

  const p = preview.data;
  return (
    <div className="sheet" id="invite-page" style={{ zIndex: 700 }}>
      <div className="sheet-h"><span style={{ flex: 1 }}>CalcioLercio · Invito</span></div>
      <div className="sheet-b">
        {result ? (
          <div className="card" id="invite-ok">
            <div className="section-header">🎉 Benvenuto {result.playerName}!</div>
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>Ora fai parte di <b>{result.leagueName}</b> e il tuo account è collegato alla tua scheda di giocatore.</div>
            <button type="button" className="f-btn" id="invite-go" onClick={() => onDone(result)}>Apri il mio profilo</button>
          </div>
        ) : error ? (
          <div className="card" id="invite-error">
            <div className="section-header">⚠️ Non posso usare questo link</div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--red)', fontWeight: 700 }}>{error}</div>
            <button type="button" className="btn btn-secondary btn-full" style={{ marginTop: 10 }} onClick={() => onDone(null)}>Vai all'app</button>
          </div>
        ) : (
          <>
            <div className="card" id="invite-intro">
              <div className="section-header">🔗 Il tuo invito</div>
              {preview.isLoading || loading ? <div style={{ fontSize: 13, color: 'var(--text3)' }}>⏳ Controllo il link…</div> : null}
              {p?.status === 'valid' ? (
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                  Ciao <b>{p.playerName}</b>! Sei stato invitato in <b>{p.leagueName}</b>. {user ? '⏳ Ti collego alla tua scheda…' : 'Registrati o accedi: poi il tuo account verrà collegato alla tua scheda di giocatore.'}
                </div>
              ) : null}
              {p && p.status !== 'valid' ? <div id="invite-bad" style={{ fontSize: 13, color: 'var(--red)', fontWeight: 700 }}>{REASON[p.status]}</div> : null}
            </div>
            {!user && !loading && (p?.status === 'valid' || p?.status === 'used') ? <div style={{ marginTop: 12 }}><AccountCard leagueId={undefined} /></div> : null}
            {p && p.status !== 'valid' && !user ? <button type="button" className="btn btn-secondary btn-full" style={{ marginTop: 10 }} onClick={() => onDone(null)}>Vai all'app</button> : null}
          </>
        )}
      </div>
    </div>
  );
}
