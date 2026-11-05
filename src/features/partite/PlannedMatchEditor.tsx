import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sheet } from '../../app/Sheet';
import { HourSelect } from '../../app/HourSelect';
import { useToast } from '../../app/Toast';
import { updatePlannedMatch } from '../../data/mutations';
import { LEAGUE_HISTORY_QUERY_KEY, type LeagueData } from '../../data/queries';
import { plannedSnapshot, replacePlannedPlayer } from '../../domain/plannedMatch';
import type { Match } from '../../domain/types';

const input = { width: '100%', padding: 10, border: '1px solid var(--gray3)', borderRadius: 8, background: 'var(--gray)', color: 'var(--text)', font: 'inherit', marginTop: 4 } as const;

export function PlannedMatchEditor({ data, match, onClose, onSaved }: { data: LeagueData; match: Match; onClose: () => void; onSaved: () => void }) {
  const [originalMatch] = useState(match);
  const original = plannedSnapshot(originalMatch);
  const [date, setDate] = useState(original.date);
  const [time, setTime] = useState(original.time);
  const [place, setPlace] = useState(original.place);
  const [notes, setNotes] = useState(original.notes);
  const [teams, setTeams] = useState({ teamA: original.teamA.filter((id): id is string => !!id), teamB: original.teamB.filter((id): id is string => !!id) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  const qc = useQueryClient();
  const roster = data.dataset.players.filter((p) => !data.rosterIds || data.rosterIds.includes(p.id)).slice().sort((a, b) => a.name.localeCompare(b.name));
  const save = async () => {
    if (!date || !time || !place.trim()) { setError('Indica giorno, ora e luogo della partita.'); return; }
    setBusy(true);
    setError('');
    try {
      await updatePlannedMatch(originalMatch, { date, time, place, notes, ...teams });
      await qc.invalidateQueries({ queryKey: LEAGUE_HISTORY_QUERY_KEY });
      toast('Programma e squadre aggiornati');
      onSaved();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <Sheet title="Modifica partita in programma" onClose={() => { if (!busy) onClose(); }} swipeBack={!busy} id="sheet-planned-match">
    <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="card" style={{ display: 'grid', gap: 12 }}>
          <label>Giorno<input aria-label="Giorno della partita" type="date" required value={date} onChange={(e) => setDate(e.target.value)} style={input} /></label>
          <label>Ora<HourSelect id="planned-time" value={time} onChange={setTime} style={input} /></label>
          <label>Luogo<input aria-label="Luogo della partita" required maxLength={80} value={place} onChange={(e) => setPlace(e.target.value)} style={input} /></label>
          <label>Descrizione<input aria-label="Descrizione della partita" value={notes} onChange={(e) => setNotes(e.target.value)} style={input} /></label>
        </div>
        <p style={{ fontSize: 13 }}>Scegli un sostituto dalla Rosa. Se scegli un giocatore già convocato, i due si scambiano di posto.</p>
        {(['teamA', 'teamB'] as const).map((side) => <div className="card" key={side}>
          <div className="section-header">{side === 'teamA' ? '🔵 Blu' : '⚪ Bianchi'}</div>
          {teams[side].map((id, index) => {
            const current = data.dataset.players.find((p) => p.id === id);
            return <label key={index} style={{ display: 'block', marginBottom: 8 }}>
              {side === 'teamA' ? 'Blu' : 'Bianchi'} · posto {index + 1}
              <select aria-label={`${side === 'teamA' ? 'Blu' : 'Bianchi'} posto ${index + 1}`} value={id} style={input}
                onChange={(e) => setTeams((old) => replacePlannedPlayer(old, side, index, e.target.value))}>
                {!roster.some((p) => p.id === id) ? <option value={id}>{current?.name ?? id} (non più in Rosa)</option> : null}
                {roster.map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}
              </select>
            </label>;
          })}
        </div>)}
        {error ? <p role="alert" style={{ color: 'var(--red)' }}>{error}</p> : null}
        <div className="btn-row">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Annulla</button>
          <button type="submit" className="btn btn-primary">{busy ? 'Salvataggio…' : 'Salva programma e squadre'}</button>
        </div>
      </fieldset>
    </form>
  </Sheet>;
}
