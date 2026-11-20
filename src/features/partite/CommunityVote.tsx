import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../app/Toast';
import { communityVoteKey, enableCommunityVoting, fetchCommunityVoteDetails, submitCommunityVotes, type CommunityVoteDetail, type CommunityVoteState } from '../../data/communityVotes';
import { LEAGUE_HISTORY_QUERY_KEY } from '../../data/queries';
import { normalizeTeam } from '../../domain/stats';
import type { Match } from '../../domain/types';

const options = Array.from({ length: 19 }, (_, i) => 1 + i / 2);

function AdminVoteDetails({ matchId }: { matchId: string }) {
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

export function CommunityVote({ match, state, canEdit, userId }: {
  match: Match;
  state: CommunityVoteState | null | undefined;
  canEdit: boolean;
  userId?: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<string, number>>({});
  if (!state) return null;

  const peers = [...normalizeTeam(match.teamA), ...normalizeTeam(match.teamB)]
    .filter((player) => player.id && player.id !== state.my_player_id);
  const until = state.open_until ? new Date(state.open_until).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : '';
  const hasScore = match.scoreA !== '' && match.scoreA != null && match.scoreB !== '' && match.scoreB != null;
  if (!state.enabled && !state.can_activate) return null;

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
  const save = async () => {
    const votes = Object.entries(draft).filter(([, rating]) => Number.isFinite(rating))
      .map(([player_id, rating]) => ({ player_id, rating }));
    if (!votes.length) return;
    setBusy(true);
    try {
      await submitCommunityVotes(match.id, votes);
      await Promise.all([
        qc.invalidateQueries({ queryKey: communityVoteKey(match.id, userId) }),
        qc.invalidateQueries({ queryKey: LEAGUE_HISTORY_QUERY_KEY }),
      ]);
      setDraft({});
      toast('Voti salvati');
    } catch (error) {
      toast('Errore: ' + (error as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <section style={{ border: '1px solid var(--gray3)', borderRadius: 'var(--radius-sm)', padding: 12, margin: '12px 0' }}>
      <strong>⭐ Voto dei partecipanti</strong>
      {!state.enabled && canEdit && state.can_activate && hasScore ? (
        <>
          <p style={{ fontSize: 12, color: 'var(--text2)' }}>Manca il pagellista? Attiva il voto per questa partita. Chi ha giocato potrà votare gli altri fino a 24 ore dal salvataggio del risultato.</p>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void activate()}>Attiva il voto</button>
        </>
      ) : null}
      {state.enabled ? <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
        {state.is_open ? `Votazione aperta fino al ${until}.` : `Votazione chiusa il ${until}.`}
        {state.can_vote ? ' Puoi modificare i tuoi voti fino alla scadenza.' : ''}
        {' '}Nella scheda compare la media dei voti ricevuti.
      </p> : null}
      {state.can_vote && peers.length ? (
        <>
          <div style={{ display: 'grid', gap: 8 }}>
            {peers.map((player) => {
              const id = player.id as string;
              const value = draft[id] ?? state.my_votes[id];
              return <label key={id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <span>{player.name}</span>
                <select aria-label={`Voto per ${player.name}`} value={value ?? ''} onChange={(event) => {
                  const rating = Number(event.target.value);
                  setDraft((previous) => ({ ...previous, [id]: rating }));
                }}>
                  {value == null ? <option value="">—</option> : null}
                  {options.map((rating) => <option value={rating} key={rating}>{rating.toFixed(1).replace('.', ',')}</option>)}
                </select>
              </label>;
            })}
          </div>
          <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 12 }} disabled={busy || !Object.keys(draft).length} onClick={() => void save()}>Salva i miei voti</button>
        </>
      ) : null}
      {state.enabled && !state.my_player_id ? <p style={{ fontSize: 12, color: 'var(--text2)' }}>Possono votare solo i partecipanti collegati a un account.</p> : null}
      {state.enabled && canEdit ? <AdminVoteDetails matchId={match.id} /> : null}
    </section>
  );
}
