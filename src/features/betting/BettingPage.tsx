import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../app/auth';
import { useToast } from '../../app/Toast';
import { bettingKey, savePrediction, useBettingBoard, type BettingMatch, type Outcome } from '../../data/betting';
import type { LeagueData } from '../../data/queries';
import { formatDate } from '../../domain/format';
import { AdvancedPredictionsSection, MatchPredictions } from './AdvancedPredictionsSection';
import { useAdvancedEnabled } from '../../data/advancedPredictions';

const outcomeLabel: Record<Outcome, string> = { '1': '1 · Blu', X: 'X · Pareggio', '2': '2 · Bianchi' };
const predictionLabel = (outcome: Outcome, a: number | null, b: number | null) =>
  `${outcomeLabel[outcome]}${a === null || b === null ? '' : ` · ${a}-${b}`}`;

function BettingCard({ match, leagueId }: { match: BettingMatch; leagueId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [outcome, setOutcome] = useState<Outcome | null>(match.my_prediction?.outcome ?? null);
  const [scoreA, setScoreA] = useState(match.my_prediction?.score_a?.toString() ?? '');
  const [scoreB, setScoreB] = useState(match.my_prediction?.score_b?.toString() ?? '');
  const [busy, setBusy] = useState(false);
  const exact = scoreA !== '' && scoreB !== '';
  const a = exact ? Number(scoreA) : null;
  const b = exact ? Number(scoreB) : null;
  const exactOutcome: Outcome | null = exact && a !== null && b !== null ? a > b ? '1' : a < b ? '2' : 'X' : null;
  const valid = outcome !== null && ((scoreA === '' && scoreB === '') ||
    (exact && Number.isInteger(a) && Number.isInteger(b) && a! >= 0 && b! >= 0 && a! <= 99 && b! <= 99 && exactOutcome === outcome));
  const save = async () => {
    if (!valid || !outcome || !match.is_open || busy) return;
    setBusy(true);
    try {
      await savePrediction(match.match_id, outcome, a, b);
      await qc.invalidateQueries({ queryKey: bettingKey(leagueId, user?.id) });
      toast('Bet salvata');
    } catch (error) { toast('Errore: ' + (error as Error).message); }
    finally { setBusy(false); }
  };
  return <article className="betting-card">
    <div className="betting-card-head"><strong>Partita del {formatDate(match.date)}</strong>
      <span>{match.play_time ? `Ore ${match.play_time.slice(0, 5)}` : 'Orario da definire'}</span></div>
    {match.score_a !== null && match.score_b !== null ? <p>Risultato: <b>Blu {match.score_a} – {match.score_b} Bianchi</b></p> : null}
    {match.is_open ? <>
      <p className="betting-hint">Scegli 1, X o 2: esito giusto <b>+3 pt</b>. Il risultato esatto è facoltativo: se lo indovini <b>+5 pt</b> in più. Se sbagli non perdi punti.</p>
      <div className="betting-outcomes" role="group" aria-label="Bet 1 X 2">
        {(['1', 'X', '2'] as const).map((pick) => <button type="button" key={pick} className={outcome === pick ? 'selected' : ''}
          aria-pressed={outcome === pick} onClick={() => setOutcome(pick)}>{outcomeLabel[pick]}</button>)}
      </div>
      <div className="betting-score"><span>Risultato esatto</span>
        <label>Blu <input type="number" min="0" max="99" inputMode="numeric" value={scoreA} onChange={(e) => setScoreA(e.target.value)} /></label>
        <span>–</span><label>Bianchi <input type="number" min="0" max="99" inputMode="numeric" value={scoreB} onChange={(e) => setScoreB(e.target.value)} /></label>
      </div>
      {exact && outcome && exactOutcome !== outcome ? <p className="betting-error">Il risultato esatto deve corrispondere alla scelta {outcome}.</p> : null}
      {(scoreA !== '') !== (scoreB !== '') ? <p className="betting-error">Inserisci entrambi i gol o lascia vuoti entrambi i campi.</p> : null}
      <button type="button" className="btn btn-primary betting-save" disabled={!valid || busy} onClick={() => void save()}>{busy ? 'Salvataggio…' : 'Salva Bet'}</button>
    </> : <p className="betting-hint">Bet chiuse{!match.play_time && match.score_a === null ? ': manca l’orario della partita' : ''}.</p>}
    {match.my_prediction ? <p className="betting-mine">La tua scelta: <b>{predictionLabel(match.my_prediction.outcome, match.my_prediction.score_a, match.my_prediction.score_b)}</b></p> : null}
    {match.my_prediction && match.score_a !== null && match.score_b !== null ? (() => {
      const real: Outcome = match.score_a > match.score_b ? '1' : match.score_a < match.score_b ? '2' : 'X';
      const outcomeWon = match.my_prediction.outcome === real;
      const exactWon = match.my_prediction.score_a === match.score_a && match.my_prediction.score_b === match.score_b;
      return <p className="betting-mine">{outcomeWon ? 'Esito indovinato: +3 pt' : 'Esito sbagliato: 0 pt'}{match.my_prediction.score_a !== null ? (exactWon ? ' · Risultato esatto: +5 pt' : ' · Risultato esatto sbagliato: 0 pt') : ''}</p>;
    })() : null}
    <p className="betting-hint">{match.total} {match.total === 1 ? 'Bet registrata' : 'Bet registrate'}.</p>
  </article>;
}

export function BettingPage({ data }: { data: LeagueData }) {
  const enabled = useAdvancedEnabled(data.league.id);
  if (enabled.isSuccess && !enabled.data) return <div className="betting-page"><div className="card"><div className="section-header">🎯 Bet</div><p>La sezione Bet non è attiva per questa lega. Può attivarla l’admin dalle Impostazioni della lega.</p></div></div>;
  return <BettingContent data={data} />;
}

function BettingContent({ data }: { data: LeagueData }) {
  const board = useBettingBoard(data.league.id);
  const matches = board.data ?? [];
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  const upcoming = matches.filter((m) => m.score_a === null && m.score_b === null && m.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const history = matches.filter((m) => !upcoming.includes(m) && (m.my_prediction || m.total > 0));
  return <div className="betting-page">
    <div className="card"><div className="section-header">🎯 Bet</div>
      <p>Una sola giocata per partita: l’esito 1-X-2 (+3 pt), il risultato esatto (+5 pt in più) e fino a 5 pronostici sui giocatori avversari. Contano tutti insieme per il moltiplicatore. Nessuna puntata in denaro.</p></div>
    {board.isError ? <div className="card" role="alert">Impossibile caricare le Bet. <button type="button" onClick={() => void board.refetch()}>Riprova</button></div> : null}
    {!board.isError && board.isPending ? <div className="card">Caricamento partite…</div> : null}
    {board.isSuccess ? <>
      <h2>Prossime partite</h2>
      {upcoming.length ? upcoming.map((match) => <section key={match.match_id} className="giocata-unica" aria-label={`Giocata del ${formatDate(match.date)}`}>
        <BettingCard match={match} leagueId={data.league.id} />
        <MatchPredictions match={match} embedded />
      </section>) : <div className="card">Nessuna prossima partita in programma.</div>}
      {history.length ? <><h2>Storico Bet 1/X/2</h2>{history.map((match) => <BettingCard key={match.match_id} match={match} leagueId={data.league.id} />)}</> : null}
      <AdvancedPredictionsSection leagueId={data.league.id} matches={matches} players={data.dataset.players} photos={data.photos} />
    </> : null}
  </div>;
}
