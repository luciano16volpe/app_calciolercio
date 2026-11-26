import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../app/auth';
import { releaseKeyboard, repairViewport, useConfirm } from '../../app/Dialogs';
import { useToast } from '../../app/Toast';
import { closeCommunityVoting, communityVoteKey, communityVoteProgressKey, enableCommunityVoting, fetchCommunityVoteDetails, submitCommunityVotes, useCommunityVoteProgress, useCommunityVoteState, type CommunityVoteDetail, type CommunityVoteState } from '../../data/communityVotes';
import { LEAGUE_HISTORY_QUERY_KEY, LEAGUE_QUERY_KEY } from '../../data/queries';
import { formatDate } from '../../domain/format';
import { normalizeTeam } from '../../domain/stats';
import type { Match } from '../../domain/types';

function VoteDetails({ matchId }: { matchId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CommunityVoteDetail[] | null>(null);
  const [error, setError] = useState('');
  const toggle = async () => {
    if (open) { setOpen(false); setRows(null); return; }
    setOpen(true);
    setLoading(true);
    setError('');
    try { setRows(await fetchCommunityVoteDetails(matchId)); }
    catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  };
  return <div style={{ marginTop: 12 }}>
    <button type="button" className="btn btn-secondary btn-sm" aria-expanded={open} onClick={() => void toggle()}>
      {open ? 'Nascondi voti espressi' : 'Vedi voti espressi'}
    </button>
    {open ? <div style={{ marginTop: 8, fontSize: 12 }}>
      {loading ? <p>Caricamento voti…</p> : null}
      {error ? <p role="alert">Impossibile caricare i voti: {error}</p> : null}
      {rows && !rows.length ? <p>Nessun voto espresso.</p> : null}
      {rows?.length ? <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead><tr><th scope="col">Chi ha votato</th><th scope="col">Giocatore</th><th scope="col">Voto</th></tr></thead>
          <tbody>{rows.map((row, index) => <tr key={`${row.voter_name}-${row.target_name}-${index}`}>
            <td>{row.voter_name}</td><td>{row.target_name}</td><td>{Number(row.rating).toFixed(1).replace('.', ',')}</td>
          </tr>)}</tbody>
        </table>
      </div> : null}
    </div> : null}
  </div>;
}

function remainingText(ms: number) {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return 'meno di 1 min';
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

function VoteStatusOpen({ matchId, until }: { matchId: string; until: string }) {
  const progress = useCommunityVoteProgress(matchId, true);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const left = new Date(until).getTime() - now;
  return <div className="vote-status" role="status" style={{ flexBasis: '100%', textAlign: 'center', fontSize: 12, color: 'var(--text2)', margin: '2px 0' }}>
    ⏳ Voto aperto · chiude tra <b style={{ color: 'var(--text)' }}>{remainingText(left)}</b>
    {progress.data ? <> · <b style={{ color: 'var(--text)' }}>{progress.data.voted}</b> {progress.data.voted === 1 ? 'ha votato' : 'hanno votato'} · <b style={{ color: 'var(--text)' }}>{progress.data.remaining}</b> {progress.data.remaining === 1 ? 'manca' : 'mancano'}</> : null}
  </div>;
}

/** Conto alla rovescia e votanti: compare solo mentre il voto dei partecipanti è aperto. */
export function VoteStatus({ matchId }: { matchId: string }) {
  const state = useCommunityVoteState(matchId);
  if (!state.data?.is_open || !state.data.open_until) return null;
  return <VoteStatusOpen matchId={matchId} until={state.data.open_until} />;
}

function AdminVoteProgress({ matchId, isOpen }: { matchId: string; isOpen: boolean }) {
  const progress = useCommunityVoteProgress(matchId, isOpen);
  if (progress.isError) return <p className="cv-progress-note">Impossibile caricare il riepilogo dei votanti.</p>;
  if (!progress.data) return <p className="cv-progress-note">Caricamento votanti…</p>;
  const { eligible, voted, remaining } = progress.data;
  return <div className="cv-progress">
    <div className="cv-progress-counts">
      <div><strong>{voted}</strong><span>Hanno votato</span></div>
      <div><strong>{remaining}</strong><span>{isOpen ? 'Ancora da votare' : 'Non hanno votato'}</span></div>
    </div>
    <p>{eligible ? `Su ${eligible} ${eligible === 1 ? 'partecipante abilitato' : 'partecipanti abilitati'} · conta chi ha inserito almeno un voto.` : 'Nessun partecipante collegato può votare.'}</p>
  </div>;
}

/** Nella scheda partita l'admin vede i voti anche durante la votazione. */
export function CommunityVoteControls({ match, state, canEdit, userId }: {
  match: Match;
  state: CommunityVoteState | null | undefined;
  canEdit: boolean;
  userId?: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!state || !canEdit || (!state.enabled && !state.can_activate)) return null;

  const until = state.open_until ? new Date(state.open_until).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : '';
  const hasScore = match.scoreA !== '' && match.scoreA != null && match.scoreB !== '' && match.scoreB != null;
  const activate = async () => {
    setBusy(true);
    try {
      await enableCommunityVoting(match.id);
      await qc.invalidateQueries({ queryKey: communityVoteKey(match.id, userId) });
      toast('Voto dei partecipanti attivato');
    } catch (error) {
      toast('Errore: ' + (error as Error).message);
    } finally { setBusy(false); }
  };

  return <section className="admin-only" style={{ border: '1px solid var(--gray3)', borderRadius: 'var(--radius-sm)', padding: 12, margin: '12px 0' }}>
    <strong>⭐ Voto dei partecipanti</strong>
    {!state.enabled && state.can_activate && hasScore ? <>
      <p style={{ fontSize: 12, color: 'var(--text2)' }}>Manca il pagellista? Apri il voto per questa partita. Chi ha giocato e ha Premium attivo, incluso l'admin se ha partecipato, potrà votare gli altri per 12 ore da quando lo attivi.</p>
      <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void activate()}>Attiva il voto</button>
    </> : null}
    {state.enabled ? <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
      {state.is_open ? `Votazione aperta fino al ${until}.` : `Votazione chiusa il ${until}.`}
      {state.is_open ? ' Le medie saranno visibili solo alla chiusura.'
        : state.finalized ? ' Le medie sono ora visibili nella scheda.' : ' Le medie saranno disponibili tra poco.'}
    </p> : null}
    {state.enabled ? <AdminVoteProgress matchId={match.id} isOpen={state.is_open} /> : null}
    {state.enabled ? <VoteDetails matchId={match.id} /> : null}
  </section>;
}

/** La votazione si apre come finestra autonoma dal pulsante VOTA. */
export function CommunityVoteModal({ match, onClose }: { match: Match | undefined; onClose: () => void }) {
  const { user } = useAuth();
  const matchId = match?.id ?? '';
  const vote = useCommunityVoteState(matchId);
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [closing, setClosing] = useState(false);
  const confirm = useConfirm();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        releaseKeyboard();
        onClose();
        repairViewport();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!match) return null;

  const state = vote.data;
  const teams = state ? [
    { side: 'blue', label: 'Blu', players: normalizeTeam(match.teamA).filter((player) => player.id && player.id !== state.my_player_id) },
    { side: 'white', label: 'Bianchi', players: normalizeTeam(match.teamB).filter((player) => player.id && player.id !== state.my_player_id) },
  ] : [];
  const savedCount = teams.reduce((count, team) => count + team.players.filter((player) => player.id && state?.my_votes[player.id] != null).length, 0);
  const changedCount = Object.keys(draft).length;
  const until = state?.open_until ? new Date(state.open_until).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : '';
  const close = () => { releaseKeyboard(); onClose(); repairViewport(); };
  const setRating = (playerId: string, rating: number) => {
    setDraft((previous) => ({ ...previous, [playerId]: Math.max(1, Math.min(10, rating)) }));
  };
  // chiusura anticipata (solo admin, anche se non ha giocato o non è Premium): pubblica subito le medie
  const closeVoting = async () => {
    if (closing) return;
    const ok = await confirm({ icon: '🔒', title: 'Chiudere la votazione?', lines: ['Nessuno potrà più cambiare i voti e le medie saranno pubblicate subito.', 'Non si può annullare.'], okLabel: 'Chiudi votazione', danger: true });
    if (!ok) return;
    setClosing(true);
    try {
      await closeCommunityVoting(match.id);
      void qc.invalidateQueries({ queryKey: communityVoteKey(match.id, user?.id) });
      void qc.invalidateQueries({ queryKey: communityVoteProgressKey(match.id, user?.id) });
      void qc.invalidateQueries({ queryKey: LEAGUE_HISTORY_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY });
      toast('Votazione chiusa: medie pubblicate');
      close();
    } catch (error) {
      toast('Errore: ' + (error as Error).message);
      setClosing(false);
    }
  };
  const save = async () => {
    if (!state?.can_vote) return;
    const votes = Object.entries(draft).filter(([, rating]) => Number.isFinite(rating))
      .map(([player_id, rating]) => ({ player_id, rating }));
    if (!votes.length) return;
    setBusy(true);
    try {
      await submitCommunityVotes(match.id, votes);
      void qc.invalidateQueries({ queryKey: communityVoteKey(match.id, user?.id) });
      void qc.invalidateQueries({ queryKey: communityVoteProgressKey(match.id, user?.id) });
      void qc.invalidateQueries({ queryKey: LEAGUE_HISTORY_QUERY_KEY });
      toast('Voti salvati');
      close();
    } catch (error) {
      toast('Errore: ' + (error as Error).message);
      setBusy(false);
    }
  };

  return <div id="community-vote-modal" className="vote-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="community-vote-title">
    <div className="vote-modal-panel">
      <div className="vote-modal-head">
        <div className="vote-modal-title-row">
          <span className="vote-modal-icon" aria-hidden="true">⭐</span>
          <div>
            <div id="community-vote-title" className="vote-modal-title">Dai i tuoi voti</div>
            <div className="vote-modal-date">Partita del {formatDate(match.date)}</div>
          </div>
        </div>
        <button type="button" className="vote-modal-close" aria-label="Chiudi votazione" autoFocus onClick={close}>✕</button>
      </div>
      <div className="vote-modal-body">
        {!state ? <p className="vote-modal-message">Caricamento votazione…</p> : state.is_open && !state.has_premium ? <div className="vote-premium-message"><strong>⭐ Votazione Premium</strong><p>Il pulsante è visibile a tutti, ma per dare i voti serve Premium attivo: chiedi all’amministratore di attivarlo. I voti che hai già inviato restano salvati.</p></div> : state.can_vote ? <>
          <div className="vote-modal-intro">
            <strong>Come funziona</strong>
            <p>Vota solo i giocatori che vuoi valutare: puoi lasciare gli altri senza voto. Scegli da 1 a 10 con i pulsanti + e −, a passi di mezzo punto.</p>
            <span>Puoi correggere i voti fino al {until}, oppure finché tutti hanno votato. Le medie saranno visibili alla chiusura.</span>
          </div>
          {teams.map((team) => team.players.length ? <section key={team.side} className={`vote-team vote-team-${team.side}`}>
            <h3 className="vote-team-heading"><span className="vote-team-dot" /> Squadra {team.label}</h3>
            <div className="vote-player-list">
              {team.players.map((player) => {
                const id = player.id as string;
                const value = draft[id] ?? state.my_votes[id];
                const changed = draft[id] != null;
                return <div key={id} className={`vote-player-card${changed ? ' vote-player-changed' : ''}`} role="group" aria-labelledby={`vote-name-${id}`}>
                  <div className="vote-player-top">
                    <strong id={`vote-name-${id}`} className="vote-player-name">{player.name}</strong>
                    <span className={`vote-player-status${changed ? ' vote-player-status-pending' : ''}`}>
                      {changed ? 'Da salvare' : value != null ? 'Salvato' : 'Facoltativo'}
                    </span>
                  </div>
                  <div className="vote-player-control">
                    <button type="button" className="vote-adjust" aria-label={`Diminuisci il voto di ${player.name}`} disabled={value === 1} onClick={() => setRating(id, (value ?? 6) - 0.5)}>−</button>
                    <div className="vote-player-value"><span>VOTO</span><b>{value == null ? '—' : value.toFixed(1).replace('.', ',')}</b></div>
                    <button type="button" className="vote-adjust" aria-label={`Aumenta il voto di ${player.name}`} disabled={value === 10} onClick={() => setRating(id, (value ?? 6) + 0.5)}>+</button>
                  </div>
                </div>;
              })}
            </div>
          </section> : null)}
        </> : <p className="vote-modal-message">{state.is_open ? 'Può votare solo chi ha partecipato alla partita.' : state.closed_early_at ? `La votazione è stata chiusa in anticipo${state.closed_early_by_name ? ` da ${state.closed_early_by_name}` : ''}.` : state.finalized ? 'La votazione è chiusa: le medie sono pubblicate.' : 'La votazione non è disponibile per questa partita.'}</p>}
        {state?.finalized && state.has_premium ? <VoteDetails matchId={match.id} /> : null}
      </div>
      {state?.can_vote && state.has_premium ? <div className="vote-modal-footer">
        <span>{savedCount ? `${savedCount} ${savedCount === 1 ? 'voto già salvato' : 'voti già salvati'}` : 'Nessun voto salvato'}{changedCount ? ` · ${changedCount} da salvare` : ''}</span>
        <button type="button" className="btn btn-primary btn-full" disabled={busy || !changedCount} onClick={() => void save()}>
          {busy ? 'Salvataggio…' : changedCount ? `Salva ${changedCount} ${changedCount === 1 ? 'voto' : 'voti'}` : 'Scegli un voto per iniziare'}
        </button>
      </div> : null}
      {state?.can_close ? <div className="vote-modal-admin">
        <button type="button" id="community-vote-close" className="btn btn-secondary btn-sm admin-close-vote admin-only" disabled={closing || busy} onClick={() => void closeVoting()}>
          {closing ? 'Chiusura…' : '🔒 Chiudi votazione'}
        </button>
        <small>Solo per l’admin. Si chiude anche quando tutti hanno votato, al più tardi il {until}.</small>
      </div> : null}
    </div>
  </div>;
}
