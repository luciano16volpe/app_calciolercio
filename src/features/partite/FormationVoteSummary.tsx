import { useFormationPollVotes, type FormationOption } from '../../data/formationPolls';

export function FormationVoteSummary({ matchId, options, names }: {
  matchId: string;
  options: FormationOption[];
  names: Map<string, string>;
}) {
  const votes = useFormationPollVotes(matchId, true);
  return <details className="formation-vote-summary admin-only">
    <summary>Partecipazione al voto <span>{votes.data ? `${votes.data.total} ${votes.data.total === 1 ? 'votante' : 'votanti'}` : '…'}</span></summary>
    <div className="formation-vote-summary-content">
      {votes.isError ? <p role="alert">Impossibile caricare i voti. Riprova.</p>
        : !votes.data ? <p>Caricamento voti…</p>
          : !votes.data.total ? <p>Ancora nessun voto.</p>
            : votes.data.options.filter((option) => option.voters.length).sort((a, b) => b.voters.length - a.voters.length).map((option) => {
            const formation = options.find((item) => item.option_no === option.option_no);
            return <div className="formation-vote-row" key={option.option_no}>
              <div className="formation-vote-row-head"><b>{option.option_no === 1 ? 'Admin' : `Alt. ${option.option_no}`}</b>
                <span className="formation-vote-bar"><i style={{ width: `${Math.round(option.voters.length / votes.data!.total * 100)}%` }} /></span>
                <strong>{option.voters.length}</strong></div>
              {formation ? <div className="formation-vote-teams">
                <div><b>Blu</b> · {formation.team_a.map((id) => names.get(id) ?? 'Giocatore').join(', ')}</div>
                <div><b>Bianchi</b> · {formation.team_b.map((id) => names.get(id) ?? 'Giocatore').join(', ')}</div>
              </div> : null}
              <div className="formation-vote-names">{option.voters.map((voter) => <span key={voter.user_id}>{voter.name}</span>)}</div>
            </div>;
          })}
    </div>
  </details>;
}
