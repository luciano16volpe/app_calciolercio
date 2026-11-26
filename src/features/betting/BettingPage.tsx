import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../app/auth';
import { useToast } from '../../app/Toast';
import { bettingKey, savePrediction, useBettingBoard, type BettingMatch, type Outcome } from '../../data/betting';
import type { LeagueData } from '../../data/queries';
import { formatDate } from '../../domain/format';
import { AdvancedPredictionsSection, GiocataBar, MatchPredictions } from './AdvancedPredictionsSection';
import { useAdvancedEnabled } from '../../data/advancedPredictions';
import { useWallet } from '../../data/wallet';
import { Dollalercio } from './Dollalercio';

const outcomeLabel: Record<Outcome, string> = { '1': '1 · Blu', X: 'X · Pareggio', '2': '2 · Bianchi' };
const predictionLabel = (outcome: Outcome, a: number | null, b: number | null) =>
  `${outcomeLabel[outcome]}${a === null || b === null ? '' : ` · ${a}-${b}`}`;

interface Draft {
  outcome: Outcome | null; scoreA: number | null; scoreB: number | null;
  pick: (outcome: Outcome) => void; step: (side: 'a' | 'b', delta: number) => void; clear: () => void;
}
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
const outcomeOf = (a: number, b: number): Outcome => a > b ? '1' : a < b ? '2' : 'X';

/** La giocata 1-X-2 + risultato esatto: si salva da sola mezzo secondo dopo ogni scelta. */
function useDraft(match: BettingMatch, leagueId: string): { draft: Draft; status: SaveStatus } {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [outcome, setOutcome] = useState<Outcome | null>(match.my_prediction?.outcome ?? null);
  const [scoreA, setScoreA] = useState<number | null>(match.my_prediction?.score_a ?? null);
  const [scoreB, setScoreB] = useState<number | null>(match.my_prediction?.score_b ?? null);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const touched = useRef(false);
  const saved = useRef({ outcome: match.my_prediction?.outcome ?? null, scoreA: match.my_prediction?.score_a ?? null, scoreB: match.my_prediction?.score_b ?? null });
  const queue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    if (!touched.current || !match.is_open) return;
    let active = true;
    setStatus('saving');
    const timer = window.setTimeout(() => {
      const next = { outcome, scoreA, scoreB };
      const work = queue.current.then(async () => {
        await savePrediction(match.match_id, outcome, scoreA, scoreB);
        saved.current = next;
        await Promise.all([
          qc.invalidateQueries({ queryKey: bettingKey(leagueId, user?.id) }),
          qc.invalidateQueries({ queryKey: ['wallet'] }),
        ]);
      });
      queue.current = work.catch(() => undefined);
      void work.then(() => { if (active) setStatus('saved'); }, (error: unknown) => {
        if (!active) return;
        touched.current = false;
        setOutcome(saved.current.outcome);
        setScoreA(saved.current.scoreA);
        setScoreB(saved.current.scoreB);
        setStatus('error');
        toast('Errore: ' + (error as Error).message);
      });
    }, 500);
    return () => { active = false; window.clearTimeout(timer); };
  }, [outcome, scoreA, scoreB]); // eslint-disable-line react-hooks/exhaustive-deps
  const draft: Draft = {
    outcome, scoreA, scoreB,
    pick: (next) => {
      touched.current = true;
      if (outcome === next) { setOutcome(null); setScoreA(null); setScoreB(null); return; }
      setOutcome(next);
      if (scoreA !== null && scoreB !== null && outcomeOf(scoreA, scoreB) !== next) { setScoreA(null); setScoreB(null); }
    },
    step: (side, delta) => {
      touched.current = true;
      const a = side === 'a' ? Math.max(0, Math.min(99, (scoreA ?? 0) + delta)) : (scoreA ?? 0);
      const b = side === 'b' ? Math.max(0, Math.min(99, (scoreB ?? 0) + delta)) : (scoreB ?? 0);
      setScoreA(a); setScoreB(b); setOutcome(outcomeOf(a, b));
    },
    clear: () => { touched.current = true; setScoreA(null); setScoreB(null); },
  };
  return { draft, status };
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: number | null; onMinus: () => void; onPlus: () => void }) {
  return <div className="bet-stepper"><span>{label}</span>
    <div><button type="button" aria-label={`Un gol in meno per ${label}`} disabled={value === null || value === 0} onClick={onMinus}>−</button>
      <b>{value ?? '–'}</b>
      <button type="button" aria-label={`Un gol in più per ${label}`} disabled={value === 99} onClick={onPlus}>+</button></div></div>;
}

function BettingCard({ match, draft }: { match: BettingMatch; draft?: Draft }) {
  const editing = !!draft && match.is_open;
  return <article className="betting-card">
    <div className="betting-card-head"><strong>Partita del {formatDate(match.date)}</strong>
      <span>{match.play_time ? `Ore ${match.play_time.slice(0, 5)}` : 'Orario da definire'}</span></div>
    {match.score_a !== null && match.score_b !== null ? <p>Risultato: <b>Blu {match.score_a} – {match.score_b} Bianchi</b></p> : null}
    {editing ? <>
      <p className="betting-hint">Esito <b>+3 pt</b> · risultato esatto <b>+5 pt</b> in più. Ogni scelta costa 1 dollalercio; tocca di nuovo l’esito per annullarlo.</p>
      <div className="betting-outcomes" role="group" aria-label="Bet 1 X 2">
        {(['1', 'X', '2'] as const).map((pick) => <button type="button" key={pick} className={draft.outcome === pick ? 'selected' : ''}
          aria-pressed={draft.outcome === pick} onClick={() => draft.pick(pick)}>{outcomeLabel[pick]}</button>)}
      </div>
      <div className="bet-exact">
        <div className="bet-exact-head"><span>Risultato esatto <small>(facoltativo)</small></span>
          {draft.scoreA !== null ? <button type="button" className="bet-exact-clear" onClick={draft.clear}>Azzera</button> : null}</div>
        <div className="bet-exact-steppers">
          <Stepper label="Blu" value={draft.scoreA} onMinus={() => draft.step('a', -1)} onPlus={() => draft.step('a', 1)} />
          <Stepper label="Bianchi" value={draft.scoreB} onMinus={() => draft.step('b', -1)} onPlus={() => draft.step('b', 1)} />
        </div>
      </div>
    </> : !match.is_open ? <p className="betting-hint">Bet chiuse{!match.play_time && match.score_a === null ? ': manca l’orario della partita' : ''}.</p> : null}
    {match.my_prediction && !editing ? <p className="betting-mine">La tua scelta: <b>{predictionLabel(match.my_prediction.outcome, match.my_prediction.score_a, match.my_prediction.score_b)}</b></p> : null}
    {match.my_prediction && match.score_a !== null && match.score_b !== null ? (() => {
      const real: Outcome = match.score_a > match.score_b ? '1' : match.score_a < match.score_b ? '2' : 'X';
      const outcomeWon = match.my_prediction.outcome === real;
      const exactWon = match.my_prediction.score_a === match.score_a && match.my_prediction.score_b === match.score_b;
      return <p className="betting-mine">{outcomeWon ? 'Esito indovinato: +3 pt' : 'Esito sbagliato: 0 pt'}{match.my_prediction.score_a !== null ? (exactWon ? ' · Risultato esatto: +5 pt' : ' · Risultato esatto sbagliato: 0 pt') : ''}</p>;
    })() : null}
    {!match.is_open && match.entries?.length ? <details className="bet-info"><summary>Scelte 1-X-2 del gruppo ({match.entries.length})</summary>
      <ul className="bet-entries">{match.entries.map(entry => <li key={entry.user_id}><span>{entry.name}</span>
        <b>{predictionLabel(entry.outcome, entry.score_a, entry.score_b)}</b></li>)}</ul>
    </details> : null}
    {!editing ? <p className="betting-hint">{match.total} {match.total === 1 ? 'Bet registrata' : 'Bet registrate'}.</p> : null}
  </article>;
}

/** Una partita da giocare: 1-X-2, risultato esatto, pronostici sui giocatori e la barra riassuntiva fissa in basso. */
function GiocataUnica({ match, leagueId }: { match: BettingMatch; leagueId: string }) {
  const { draft, status } = useDraft(match, leagueId);
  return <section className="giocata-unica" aria-label={`Giocata del ${formatDate(match.date)}`}>
    <BettingCard match={match} draft={draft} />
    <MatchPredictions match={match} embedded />
    {match.is_open ? <GiocataBar match={match} outcome={draft.outcome} scoreA={draft.scoreA} scoreB={draft.scoreB} status={status} /> : null}
  </section>;
}

export function BettingPage({ data }: { data: LeagueData }) {
  const enabled = useAdvancedEnabled(data.league.id);
  if (enabled.isSuccess && !enabled.data) return <div className="betting-page"><div className="card"><div className="section-header">🎯 Bet</div><p>La sezione Bet non è attiva per questa lega. Può attivarla l’admin dalle Impostazioni della lega.</p></div></div>;
  return <BettingContent data={data} />;
}

const tabs = [['gioca', 'Gioca'], ['risultati', 'Risultati'], ['classifica', 'Classifica'], ['mio', 'Il mio Bet']] as const;
const fixedView = { risultati: 'results', classifica: 'leaderboard', mio: 'stats' } as const;

function BettingContent({ data }: { data: LeagueData }) {
  const board = useBettingBoard(data.league.id);
  const wallet = useWallet(data.league.id);
  const [tab, setTab] = useState<'gioca' | 'risultati' | 'classifica' | 'mio'>('gioca');
  const matches = board.data ?? [];
  const bettingEnabled = new Set(data.dataset.matches.filter((match) => match.bettingEnabled === true).map((match) => match.id));
  const wasBettable = (match: BettingMatch) => bettingEnabled.has(match.match_id) && match.play_time !== null;
  const resultMatches = matches.filter((match) => wasBettable(match) && match.score_a !== null && match.score_b !== null);
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  const upcoming = matches.filter((m) => m.score_a === null && m.score_b === null && m.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const history = matches.filter((m) => wasBettable(m) && !upcoming.includes(m) && (m.my_prediction || m.total > 0));
  return <div className="betting-page">
    <div className="card"><div className="section-header">🎯 Bet
        {wallet.data ? <span className="wallet-badge" title="I tuoi dollalerci"><Dollalercio size={20} /> {wallet.data.balance} <small>dollalerci</small></span> : null}</div>
      {wallet.data?.first_time ? <p className="betting-hint" role="status">Benvenuto! Hai ricevuto 50 dollalerci per iniziare.</p> : null}
      {wallet.data && wallet.data.topped_up > 0 ? <p className="betting-hint" role="status">Ricarica settimanale: +{wallet.data.topped_up} dollalerci, sei tornato a 20.</p> : null}
      <div className="advanced-view-tabs" role="tablist" aria-label="Sezioni Bet" style={{ marginBottom: 0 }}>
        {tabs.map(([key, label]) => <button type="button" key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'selected' : ''}
          onClick={() => setTab(key)}>{label}</button>)}</div></div>
    {board.isError ? <div className="card" role="alert">Impossibile caricare le Bet. <button type="button" onClick={() => void board.refetch()}>Riprova</button></div> : null}
    {!board.isError && board.isPending ? <div className="card">Caricamento partite…</div> : null}
    {board.isSuccess ? <>
      {tab === 'gioca' ? <>
        <details className="bet-info card"><summary>ⓘ Come funziona</summary>
          <p>Una giocata per partita: l’esito 1-X-2, il risultato esatto (facoltativo) e fino a 6 pronostici sui giocatori. Ogni elemento costa 1 dollalercio; se lo togli prima della chiusura, la puntata torna sul conto. Se giochi scommetti sugli avversari, se non giochi su 3 giocatori per squadra. Nessuna puntata in denaro.</p></details>
        {upcoming.length ? upcoming.map((match) => <GiocataUnica key={match.match_id} match={match} leagueId={data.league.id} />) : <div className="card">Nessuna prossima partita in programma.</div>}
      </> : <>
        <AdvancedPredictionsSection fixedView={fixedView[tab]} leagueId={data.league.id} matches={matches} resultMatches={resultMatches} players={data.dataset.players} photos={data.photos} />
        {tab === 'risultati' && history.length ? <><h2>Storico 1-X-2</h2>{history.map((match) => <BettingCard key={match.match_id} match={match} />)}</> : null}
      </>}
    </> : null}
  </div>;
}
