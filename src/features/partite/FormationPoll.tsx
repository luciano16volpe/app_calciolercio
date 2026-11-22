import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { releaseKeyboard, repairViewport, useConfirm } from '../../app/Dialogs';
import { useAuth } from '../../app/auth';
import { useToast } from '../../app/Toast';
import { closeFormationPoll, formationPollListKey, formationPollStateKey, submitFormationVote, useFormationPolls, useFormationPollState, type FormationOption } from '../../data/formationPolls';
import { LEAGUE_HISTORY_QUERY_KEY, LEAGUE_QUERY_KEY, type LeagueData } from '../../data/queries';
import { distribLabel, goalsLabel } from '../../domain/balancing';
import { formatDate } from '../../domain/format';

const number = (value: number, digits = 1) => Number(value).toFixed(digits).replace('.', ',');
const deadline = (value: string) => new Date(value).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });

export function FormationPollBanner({ data, onOpen }: { data: LeagueData; onOpen: (id: string) => void }) {
  const polls = useFormationPolls(data.league.id);
  if (!polls.data?.length) return null;
  return <section className="formation-poll-banner" aria-label="Sondaggi formazioni aperti">
    <strong>⭐ Scegli le squadre</strong>
    <p>La lega può scegliere tra le formazioni pubblicate dall’admin. Votano tutti i membri Premium, anche chi non gioca.</p>
    {polls.data.map((poll) => <button key={poll.match_id} type="button" className="formation-poll-entry" onClick={() => onOpen(poll.match_id)}>
      <span><b>Partita del {formatDate(poll.date)}</b><small>Fino al {deadline(poll.closes_at)}</small></span>
      <span aria-hidden="true">Vedi e vota ›</span>
    </button>)}
  </section>;
}

const numericLabels: Array<[keyof FormationOption['metrics'], string]> = [
  ['diff', 'Differenza medie'], ['distrib', 'Distribuzione forti'], ['weakDistrib', 'Distribuzione deboli'],
  ['top1Diff', 'Migliore'], ['top2Diff', 'Due migliori'], ['bottom1Diff', 'Peggiore'],
  ['bottom2Diff', 'Due peggiori'], ['stdDiff', 'Dispersione'], ['roleFit', 'Copertura ruoli'],
  ['rolePenalty', 'Penalità ruoli'], ['repartiPenalty', 'Penalità reparti'],
  ['extremePenalty', 'Penalità estremi'], ['score', 'Punteggio equilibrio'],
];

function OptionCard({ option, names, chosen, onChoose, canVote }: {
  option: FormationOption; names: Map<string, string>; chosen: boolean; onChoose: () => void; canVote: boolean;
}) {
  const m = option.metrics;
  return <article className={`formation-option${chosen ? ' selected' : ''}`}>
    <div className="formation-option-head">
      <div><b>{option.option_no === 1 ? 'Formazione dell’admin' : `Alternativa ${option.option_no}`}</b>
        <span>{goalsLabel(m.sA - m.sB)} · {distribLabel(m.distrib)}</span></div>
      {canVote ? <button type="button" className="formation-select" aria-pressed={chosen} onClick={onChoose}>{chosen ? '✓ Scelta' : 'Scegli'}</button> : null}
    </div>
    <div className="formation-option-teams">
      <div><strong>🔵 Blu · media {number(m.sA)}</strong><small>{option.module_a?.notation ?? 'Auto'}{option.module_a?.desc ? ` · ${option.module_a.desc}` : ''}</small>
        <p>{option.team_a.map((id) => names.get(id) ?? 'Giocatore').join(', ')}</p></div>
      <div><strong>⚪ Bianchi · media {number(m.sB)}</strong><small>{option.module_b?.notation ?? 'Auto'}{option.module_b?.desc ? ` · ${option.module_b.desc}` : ''}</small>
        <p>{option.team_b.map((id) => names.get(id) ?? 'Giocatore').join(', ')}</p></div>
    </div>
    <div className="formation-key-metrics"><span>Diff <b>{number(m.diff, 2)}</b></span><span>Ruoli <b>{Math.round(m.roleFit * 100)}%</b></span><span>Equilibrio <b>{number(m.score, 2)}</b></span></div>
    <details className="formation-numbers"><summary>Tutte le numeriche e le 11 statistiche</summary>
      <div className="formation-number-grid">{numericLabels.map(([key, label]) => <div key={key}><span>{label}</span><b>{number(m[key], 2)}</b></div>)}</div>
      <div className="formation-stat-title">Statistiche medie · Blu / Bianchi</div>
      <div className="formation-number-grid">{option.stats.map((row, i) => <div key={i}><span>{row.label}</span><b>{number(row.a)} / {number(row.b)}</b></div>)}</div>
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
  const confirm = useConfirm();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { releaseKeyboard(); onClose(); repairViewport(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const state = poll.data;
  const names = new Map(data.dataset.players.map((player) => [player.id, player.name]));
  const chosen = selection ?? state?.my_vote ?? null;
  const canVote = !!state?.is_open && !!state.has_premium;
  const close = () => { releaseKeyboard(); onClose(); repairViewport(); };
  // chiusura anticipata (solo admin, anche se non è Premium): sceglie subito la formazione definitiva
  const closePoll = async () => {
    if (closing) return;
    const ok = await confirm({ icon: '🔒', title: 'Chiudere il sondaggio?', lines: ['Si sceglie subito la formazione più votata. Con un pareggio o senza voti resta quella che hai pubblicato.', 'Non si può annullare.'], okLabel: 'Chiudi sondaggio', danger: true });
    if (!ok) return;
    setClosing(true);
    try {
      await closeFormationPoll(matchId);
      await Promise.all([qc.invalidateQueries({ queryKey: formationPollStateKey(matchId, user?.id) }),
        qc.invalidateQueries({ queryKey: formationPollListKey(data.league.id, user?.id) }),
        qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY }), qc.invalidateQueries({ queryKey: LEAGUE_HISTORY_QUERY_KEY })]);
      toast('Sondaggio chiuso: squadre definitive salvate');
      close();
    } catch (error) { toast('Errore: ' + (error as Error).message); setClosing(false); }
  };
  const save = async () => {
    if (!canVote || chosen === null) return;
    setBusy(true);
    try {
      await submitFormationVote(matchId, chosen);
      await Promise.all([qc.invalidateQueries({ queryKey: formationPollStateKey(matchId, user?.id) }),
        qc.invalidateQueries({ queryKey: formationPollListKey(data.league.id, user?.id) })]);
      toast('Scelta salvata. Puoi cambiarla fino alla chiusura.');
      close();
    } catch (error) { toast('Errore: ' + (error as Error).message); setBusy(false); }
  };
  return <div className="formation-poll-overlay" role="dialog" aria-modal="true" aria-labelledby="formation-poll-title">
    <div className="formation-poll-panel">
      <header className="formation-poll-head"><div><h2 id="formation-poll-title">⭐ Scegli le squadre</h2>
        <p>{state?.is_open ? `Puoi votare fino al ${deadline(state.closes_at)}` : 'Sondaggio chiuso'} · Partita del {formatDate(data.dataset.matches.find((m) => m.id === matchId)?.date)}</p></div>
        <button type="button" aria-label="Chiudi scelta formazioni" onClick={close}>✕</button></header>
      <div className="formation-poll-body">
        {poll.isError ? <p role="alert">Impossibile caricare le formazioni. Riprova.</p> : poll.isSuccess && !state ? <p>Sondaggio non disponibile.</p> : !state ? <p>Caricamento formazioni…</p> : <>
          {!state.has_premium ? <div className="formation-premium-note"><b>Funzione Premium</b><p>Puoi vedere tutte le formazioni. Per scegliere serve Premium attivo: chiedi all’amministratore di attivarlo.</p></div> : null}
          {state.is_open && state.my_vote ? <p className="formation-my-vote">Hai scelto la formazione {state.my_vote}. Puoi cambiare idea prima della chiusura.</p> : null}
          {!state.is_open ? <p className="formation-my-vote">{state.winning_option ? `Formazione definitiva: ${state.winning_option}.` : 'La scelta finale sarà pubblicata a breve.'}{state.closed_early_at ? ` Chiuso in anticipo${state.closed_early_by_name ? ` da ${state.closed_early_by_name}` : ''}.` : ''}</p> : null}
          {state.options.map((option) => <OptionCard key={option.option_no} option={option} names={names}
            chosen={chosen === option.option_no} onChoose={() => setSelection(option.option_no)} canVote={canVote} />)}
        </>}
      </div>
      {state?.can_close ? <footer className="formation-poll-footer formation-poll-admin">
        <button type="button" id="formation-poll-close" className="btn btn-danger btn-full" disabled={closing || busy} onClick={() => void closePoll()}>
          {closing ? 'Chiusura…' : '🔒 Chiudi votazione'}</button>
        <small>Solo per l’admin. Altrimenti si chiude da sola il {deadline(state.closes_at)}.</small>
      </footer> : null}
      {canVote ? <footer className="formation-poll-footer"><button type="button" className="btn btn-primary btn-full" disabled={busy || chosen === null} onClick={() => void save()}>
        {busy ? 'Salvataggio…' : chosen === null ? 'Scegli una formazione' : `Conferma la formazione ${chosen}`}</button></footer> : null}
    </div>
  </div>;
}
