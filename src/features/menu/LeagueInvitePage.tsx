// Pagina del link d'invito alla lega (/unisciti/<codice>): accesso o registrazione, poi si entra nella lega e,
// se non si ha ancora un giocatore, si sceglie tra «Sono già in Rosa» (richiesta all'amministratore) e «Sono nuovo» (si crea il giocatore).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../app/auth';
import { MY_PLAYER_KEY, useMyPlayer } from '../../data/claims';
import { acceptLeagueInvite, leagueInvitePlayers, previewLeagueInvite, type LeagueJoin } from '../../data/invites';
import { MY_LEAGUES_KEY } from '../../data/leagues';
import { LEAGUE_QUERY_KEY, LEAGUE_ROSTER_QUERY_KEY } from '../../data/queries';
import { clampStat, ROLES, ROLE_CLS, ROLE_LABEL, toggleRole } from '../../domain/playerEdit';
import { ICONS, STATS } from '../../domain/types';
import { AccountCard } from '../impostazioni/AccountCard';

const REASON = {
  used: 'Questo link è già stato usato.',
  revoked: 'Questo link non è più valido: chiedi un nuovo invito.',
  expired: 'Questo link è scaduto: chiedi un nuovo invito.',
  invalid: 'Link non valido: chiedi un nuovo invito.',
} as const;
// campi di testo a 16px: sotto, iPhone ingrandisce la pagina
const field = { width: '100%', fontSize: 16, padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--gray3)', background: 'var(--card)', color: 'var(--text)', fontFamily: 'inherit', boxSizing: 'border-box' } as const;

const WELCOME: Record<LeagueJoin['outcome'], (r: LeagueJoin) => string> = {
  created: (r) => `Il tuo giocatore ${r.playerName} è già in Rosa di ${r.leagueName}. L'amministratore potrà sistemare le tue statistiche.`,
  claim_sent: (r) => `Sei dentro ${r.leagueName}. La tua richiesta di essere ${r.playerName} è stata mandata all'amministratore: quando la conferma, il tuo account sarà collegato alla tua scheda.`,
  has_player: (r) => `Ora fai parte di ${r.leagueName} insieme al tuo giocatore ${r.playerName}.`,
  joined: (r) => `Ora fai parte di ${r.leagueName}.`,
};

export function LeagueInvitePage({ token, onDone }: { token: string; onDone: (a: LeagueJoin | null) => void }) {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const preview = useQuery({ queryKey: ['league-invite-preview', token], queryFn: () => previewLeagueInvite(token), retry: false });
  const mine = useMyPlayer(user?.id ?? null);
  const [result, setResult] = useState<LeagueJoin | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'rosa' | 'nuovo'>('rosa');
  const [pick, setPick] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [roles, setRoles] = useState<string[]>(['MED']);
  const [raw, setRaw] = useState<string[]>(() => STATS.map(() => '5'));
  const tried = useRef(false);

  const p = preview.data;
  const valid = p?.status === 'valid';
  const hasPlayer = !!mine.data?.linked;
  // un amico che ha già un giocatore (o riapre il link dopo averlo usato) entra da solo, senza scelte
  const needsChoice = !!user && !mine.isLoading && !hasPlayer && !result;
  const free = useQuery({ queryKey: ['league-invite-players', token, user?.id], queryFn: () => leagueInvitePlayers(token), enabled: needsChoice && valid, retry: false });
  // se nessun giocatore è libero (o la Rosa è ancora in caricamento) resta solo «Sono nuovo»
  const view = free.data?.length ? mode : 'nuovo';

  const finish = async (r: LeagueJoin) => {
    setResult(r);
    await Promise.all([
      qc.invalidateQueries({ queryKey: MY_LEAGUES_KEY }), qc.invalidateQueries({ queryKey: MY_PLAYER_KEY }),
      qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY }), qc.invalidateQueries({ queryKey: LEAGUE_ROSTER_QUERY_KEY }),
    ]);
  };
  const run = (opts: Parameters<typeof acceptLeagueInvite>[1]) => {
    setBusy(true);
    setError('');
    acceptLeagueInvite(token, opts).then(finish).catch((e: Error) => setError(e.message)).finally(() => setBusy(false));
  };
  useEffect(() => {
    if (!user || tried.current || mine.isLoading || !hasPlayer || !valid) return;
    tried.current = true;
    run({});
  }, [user, mine.isLoading, hasPlayer, valid]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = raw.map(clampStat);
  const create = () => {
    if (!name.trim()) return setError('Scrivi il tuo nome.');
    run({ newPlayer: { name: name.trim(), roles, stats } });
  };

  return (
    <div className="sheet" id="league-invite-page" style={{ zIndex: 700 }}>
      <div className="sheet-h"><span style={{ flex: 1 }}>CalcioLercio · Invito</span></div>
      <div className="sheet-b">
        {result ? (
          <div className="card" id="league-invite-ok">
            <div className="section-header">🎉 Benvenuto!</div>
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>{WELCOME[result.outcome](result)}</div>
            <button type="button" className="f-btn" id="league-invite-go" onClick={() => onDone(result)}>Apri la lega</button>
          </div>
        ) : (
          <>
            <div className="card" id="league-invite-intro">
              <div className="section-header">🔗 Il tuo invito</div>
              {preview.isLoading || loading ? <div style={{ fontSize: 13, color: 'var(--text3)' }}>⏳ Controllo il link…</div> : null}
              {valid ? (
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                  Sei stato invitato in <b>{p?.leagueName}</b>. {user ? '' : 'Registrati o accedi (se hai già l’app, entra con il tuo account): poi scegli come comparire nella lega.'}
                </div>
              ) : null}
              {p && p.status !== 'valid' ? <div id="league-invite-bad" style={{ fontSize: 13, color: 'var(--red)', fontWeight: 700 }}>{REASON[p.status]}</div> : null}
              {error ? <div id="league-invite-error" style={{ fontSize: 13, color: 'var(--red)', fontWeight: 700, marginTop: 8 }}>{error}</div> : null}
            </div>
            {!user && !loading && valid ? <div style={{ marginTop: 12 }}><AccountCard leagueId={undefined} /></div> : null}
            {user && valid && hasPlayer && !error ? <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 10 }}>⏳ Ti faccio entrare nella lega…</div> : null}

            {needsChoice && valid ? (
              <div className="card" id="league-invite-choice" style={{ marginTop: 12 }}>
                <div className="section-header">Chi sei?</div>
                <div className="chips-row" style={{ marginBottom: 10 }}>
                  <button type="button" className={`chip${view === 'rosa' ? ' active' : ''}`} id="inv-mode-rosa" disabled={!free.data?.length} onClick={() => setMode('rosa')}>🙋 Sono già in Rosa</button>
                  <button type="button" className={`chip${view === 'nuovo' ? ' active' : ''}`} id="inv-mode-nuovo" onClick={() => setMode('nuovo')}>🆕 Sono nuovo</button>
                </div>
                {view === 'rosa' ? (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8, lineHeight: 1.4 }}>
                      Scegli il tuo nome: l'amministratore dovrà confermare che sei tu.
                    </div>
                    {free.isLoading ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>⏳ Carico la Rosa…</div> : null}
                    {(free.data ?? []).map((f) => (
                      <div key={f.id} className={`vs-opt${pick === f.id ? ' sel' : ''}`} style={pick === f.id ? { outline: '2px solid var(--green)' } : undefined} onClick={() => setPick(f.id)}>
                        <span className="vs-opt-n">{f.name}</span>
                        {pick === f.id ? <span>✓</span> : null}
                      </div>
                    ))}
                    <button type="button" className="f-btn" id="inv-claim" disabled={!pick || busy} onClick={() => pick && run({ player: pick })}>Sono io: manda la richiesta</button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8, lineHeight: 1.4 }}>
                      Crea il tuo giocatore: entra subito in Rosa. Scegli ruoli e statistiche con onestà: l'amministratore potrà aggiustarle dopo.
                    </div>
                    <input id="inv-name" style={field} placeholder="Il tuo nome" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
                    <div className="role-section">
                      <div className="role-section-label">Ruoli</div>
                      <div className="role-toggles">
                        {ROLES.map((r) => {
                          const on = roles.includes(r);
                          const c = ROLE_CLS[r] as string;
                          return (
                            <button key={r} type="button" className={`role-toggle role-${c}${on ? ' tog-' + c : ''}`} onClick={() => setRoles((cur) => toggleRole(cur, r) ?? cur)}>
                              <span className="rt-label">{ROLE_LABEL[r]}</span>
                              {on ? <span className="rt-tick">✓</span> : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="stats-grid">
                      {STATS.map((s, j) => (
                        <div key={s} className="stat-row">
                          <span className="stat-icon">{ICONS[j]}</span>
                          <span className="stat-name">{s}</span>
                          <input
                            className="stat-input" type="number" min={1} max={10} step={1} value={raw[j]} inputMode="numeric"
                            onChange={(e) => setRaw((cur) => cur.map((v, k) => (k === j ? e.target.value : v)))}
                          />
                          <div className="mini-bar"><div className="mini-bar-fill" style={{ width: `${(stats[j] as number) * 10}%` }} /></div>
                        </div>
                      ))}
                    </div>
                    <button type="button" className="f-btn" id="inv-create" disabled={busy} onClick={create}>Crea il mio giocatore</button>
                  </>
                )}
              </div>
            ) : null}
            {p && !valid && !user ? <button type="button" className="btn btn-secondary btn-full" style={{ marginTop: 10 }} onClick={() => onDone(null)}>Vai all'app</button> : null}
            {user && error && !needsChoice ? <button type="button" className="btn btn-secondary btn-full" style={{ marginTop: 10 }} onClick={() => onDone(null)}>Vai all'app</button> : null}
          </>
        )}
      </div>
    </div>
  );
}
