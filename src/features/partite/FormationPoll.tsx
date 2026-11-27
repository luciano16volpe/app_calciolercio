import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { releaseKeyboard, repairViewport, useConfirm } from '../../app/Dialogs';
import { useAuth } from '../../app/auth';
import { useToast } from '../../app/Toast';
import { closeFormationPoll, formationPollListKey, formationPollStateKey, formationPollVotesKey, reopenFormationPoll, submitFormationVote, useFormationPolls, useFormationPollState, type FormationOption } from '../../data/formationPolls';
import { FormationVoteSummary } from './FormationVoteSummary';
import { LEAGUE_HISTORY_QUERY_KEY, LEAGUE_QUERY_KEY, type LeagueData } from '../../data/queries';
import { formatDate } from '../../domain/format';

const number = (value: number, digits = 1) => Number(value).toFixed(digits).replace('.', ',');
const deadline = (value: string) => new Date(value).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
const timeLeft = (value: string, now: number) => {
  const minutes = Math.max(0, Math.ceil((new Date(value).getTime() - now) / 60_000));
  if (!minutes) return 'In chiusura';
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
};
function useClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  return now;
}

export function FormationPollBanner({ data, onOpen, excludeId }: { data: LeagueData; onOpen: (id: string) => void; excludeId?: string }) {
  const polls = useFormationPolls(data.league.id);
  const now = useClock();
  const list = (polls.data ?? []).filter((poll) => poll.match_id !== excludeId);
  if (!list.length) return null;
  return <section className="formation-poll-banner" aria-label="Sondaggi formazioni aperti">
    <strong>⭐ Scegli le squadre</strong>
    {list.map((poll) => <button key={poll.match_id} type="button" className="formation-poll-entry" onClick={() => onOpen(poll.match_id)}>
      <span><b>Partita del {formatDate(poll.date)}</b><small>Chiude tra {timeLeft(poll.closes_at, now)}</small></span>
      <span aria-hidden="true">Vedi e vota ›</span>
    </button>)}
  </section>;
}

/** Pulsante «Vedi e vota» dentro la card della prossima partita (solo se il sondaggio è aperto). */
export function FormationPollInline({ data, matchId, onOpen }: { data: LeagueData; matchId: string; onOpen: (id: string) => void }) {
  const polls = useFormationPolls(data.league.id);
  const now = useClock();
  const poll = polls.data?.find((p) => p.match_id === matchId);
  if (!poll) return null;
  return <button type="button" className="formation-poll-entry" style={{ marginTop: 10, width: '100%' }} onClick={() => onOpen(matchId)}>
    <span><b>⭐ Scegli le squadre</b><small>Chiude tra {timeLeft(poll.closes_at, now)}</small></span>
    <span aria-hidden="true">Vedi e vota ›</span>
  </button>;
}

function OptionCard({ option, names, chosen, onChoose, canVote }: {
  option: FormationOption; names: Map<string, string>; chosen: boolean; onChoose: () => void; canVote: boolean;
}) {
  const m = option.metrics;
  const teams = [
    { key: 'blue', label: 'Blu', players: option.team_a, average: m.sA, module: option.module_a },
    { key: 'white', label: 'Bianchi', players: option.team_b, average: m.sB, module: option.module_b },
  ];
  return <article className={`formation-option${chosen ? ' selected' : ''}`}>
    <div className="formation-option-head">
      <div><b>{option.option_no === 1 ? 'Formazione dell’admin' : `Alternativa ${option.option_no}`}</b></div>
      {canVote ? <button type="button" className="formation-select" aria-pressed={chosen} onClick={onChoose}>{chosen ? '✓ Scelta' : 'Scegli'}</button> : null}
    </div>
    <div className="formation-option-teams">
      {teams.map((team) => <section className={`formation-team formation-team-${team.key}`} key={team.key} aria-label={`Squadra ${team.label}`}>
        <div className="formation-team-head"><strong>{team.label}</strong><span>Media {number(team.average)}</span></div>
        <small>Modulo: {team.module?.notation ?? 'automatico'}{team.module?.desc ? ` · ${team.module.desc}` : ''}</small>
        <ol>{team.players.map((id) => <li key={id}>{names.get(id) ?? 'Giocatore'}</li>)}</ol>
      </section>)}
    </div>
    <details className="formation-numbers"><summary>Confronto statistiche</summary>
      <div className="formation-stat-title">Blu / Bianchi</div>
      <div className="formation-stat-compare">{option.stats.map((row, i) => <div className="cmp-row" key={i}>
        <span className="cmp-v bl" style={{ fontWeight: row.a > row.b ? 800 : 500 }}>{number(row.a)}</span>
        <div className="cmp-bar"><div className="cf-bl" style={{ flex: row.a }} /><span className="cmp-lbl">{row.label}</span><div className="cf-bi" style={{ flex: row.b }} /></div>
        <span className="cmp-v bi" style={{ fontWeight: row.b > row.a ? 800 : 500 }}>{number(row.b)}</span>
      </div>)}</div>
    </details>
  </article>;
}

export function FormationPollModal({ data, matchId, onClose }: { data: LeagueData; matchId: string; onClose: () => void }) {
  const { user } = useAuth();
  const poll = useFormationPollState(matchId);
  const qc = useQueryClient();
  const toast = useToast();
  const [selection, setSelection] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const now = useClock();
  const confirm = useConfirm();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { releaseKeyboard(); onClose(); repairViewport(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const state = poll.data;
  const names = new Map(data.dataset.players.map((player) => [player.id, player.name]));
  const chosen = selection ?? state?.my_vote ?? null;
  const canVote = !!state?.is_open;
  const close = () => { releaseKeyboard(); onClose(); repairViewport(); };
  // chiusura anticipata (solo admin, anche se non è Premium): sceglie subito la formazione definitiva
  const closePoll = async () => {
    if (closing) return;
    const ok = await confirm({ icon: '🔒', title: 'Chiudere il sondaggio?', lines: ['Si sceglie subito la formazione più votata. In caso di parità vince la formazione più precisa.', 'Potrai riaprirlo prima della partita.'], okLabel: 'Chiudi sondaggio' });
    if (!ok) return;
    setClosing(true);
    try {
      await closeFormationPoll(matchId);
      await Promise.all([qc.invalidateQueries({ queryKey: formationPollStateKey(matchId, user?.id) }),
        qc.invalidateQueries({ queryKey: formationPollVotesKey(matchId, user?.id) }),
        qc.invalidateQueries({ queryKey: formationPollListKey(data.league.id, user?.id) }),
        qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY }), qc.invalidateQueries({ queryKey: LEAGUE_HISTORY_QUERY_KEY })]);
      toast('Sondaggio chiuso: squadre definitive salvate');
    } catch (error) { toast('Errore: ' + (error as Error).message); }
    finally { setClosing(false); }
  };
  const reopenPoll = async () => {
    if (reopening) return;
    setReopening(true);
    try {
      await reopenFormationPoll(matchId);
      await Promise.all([qc.invalidateQueries({ queryKey: formationPollStateKey(matchId, user?.id) }),
        qc.invalidateQueries({ queryKey: formationPollVotesKey(matchId, user?.id) }),
        qc.invalidateQueries({ queryKey: formationPollListKey(data.league.id, user?.id) })]);
      toast('Sondaggio riaperto: si può votare di nuovo.');
    } catch (error) { toast('Errore: ' + (error as Error).message); }
    finally { setReopening(false); }
  };
  const save = async () => {
    if (!canVote || chosen === null) return;
    setBusy(true);
    try {
      await submitFormationVote(matchId, chosen);
      await Promise.all([qc.invalidateQueries({ queryKey: formationPollStateKey(matchId, user?.id) }),
        qc.invalidateQueries({ queryKey: formationPollVotesKey(matchId, user?.id) }),
        qc.invalidateQueries({ queryKey: formationPollListKey(data.league.id, user?.id) })]);
      toast('Scelta salvata. Puoi cambiarla fino alla chiusura.');
      close();
    } catch (error) { toast('Errore: ' + (error as Error).message); setBusy(false); }
  };
  return <div className="formation-poll-overlay" role="dialog" aria-modal="true" aria-labelledby="formation-poll-title" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div className="formation-poll-panel">
      <header className="formation-poll-head"><div><h2 id="formation-poll-title">⭐ Scegli le squadre</h2>
        <p>{state?.is_open ? `Chiude tra ${timeLeft(state.closes_at, now)} · ${deadline(state.closes_at)}` : 'Sondaggio chiuso'} · Partita del {formatDate(data.dataset.matches.find((m) => m.id === matchId)?.date)}</p></div>
        <button type="button" aria-label="Chiudi scelta formazioni" onClick={close}>✕</button></header>
      <div className="formation-poll-body">
        {poll.isError ? <p role="alert">Impossibile caricare le formazioni. Riprova.</p> : poll.isSuccess && !state ? <p>Sondaggio non disponibile.</p> : !state ? <p>Caricamento formazioni…</p> : <>
          {state.is_open && state.my_vote ? <p className="formation-my-vote">Hai scelto la formazione {state.my_vote}. Puoi cambiare idea prima della chiusura.</p> : null}
          {!state.is_open ? <p className="formation-my-vote">{state.winning_option ? `Formazione definitiva: ${state.winning_option}.` : 'La scelta finale sarà pubblicata a breve.'}{state.closed_early_at ? ` Chiuso in anticipo${state.closed_early_by_name ? ` da ${state.closed_early_by_name}` : ''}.` : ''}</p> : null}
          <FormationVoteSummary matchId={matchId} options={state.options} names={names}
            total={state.voter_count} showDetails={state.is_admin || !!state.finalized_at} admin={state.is_admin && !state.finalized_at} />
          {state.options.map((option) => <OptionCard key={option.option_no} option={option} names={names}
            chosen={chosen === option.option_no} onChoose={() => setSelection(option.option_no)} canVote={canVote} />)}
        </>}
      </div>
      {state?.can_close ? <footer className="formation-poll-footer formation-poll-admin">
        <button type="button" id="formation-poll-close" className="btn btn-secondary btn-sm admin-close-vote admin-only" disabled={closing || busy} onClick={() => void closePoll()}>
          {closing ? 'Chiusura…' : '🔒 Chiudi votazione'}</button>
        <small>Solo per l’admin. Altrimenti si chiude da sola il {deadline(state.closes_at)}.</small>
      </footer> : null}
      {state?.can_reopen ? <footer className="formation-poll-footer formation-poll-admin">
        <button type="button" className="btn btn-secondary btn-sm admin-only" disabled={reopening || busy} onClick={() => void reopenPoll()}>
          {reopening ? 'Riapertura…' : '🔓 Riapri votazione'}</button>
        <small>La votazione riparte per 24 ore, o fino all’inizio della partita se manca meno tempo.</small>
      </footer> : null}
      {canVote ? <footer className="formation-poll-footer"><button type="button" className="btn btn-primary btn-full" disabled={busy || chosen === null} onClick={() => void save()}>
        {busy ? 'Salvataggio…' : chosen === null ? 'Scegli una formazione' : `Conferma la formazione ${chosen}`}</button></footer> : null}
    </div>
  </div>;
}
