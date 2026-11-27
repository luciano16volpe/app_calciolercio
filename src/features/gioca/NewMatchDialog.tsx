// Finestra "📅 Nuova partita": salva le squadre appena sorteggiate (con la previsione, per misurare la precisione del bilanciamento).
import { PlaceField } from '../partite/PlaceField';
import { NO_PLACE, placeOf, type PlaceValue } from '../../domain/place';
import { useQueryClient } from '@tanstack/react-query';
import { HourSelect } from '../../app/HourSelect';
import { useState } from 'react';
import { releaseKeyboard, repairViewport } from '../../app/Dialogs';
import { useToast } from '../../app/Toast';
import { createMatch } from '../../data/mutations';
import { snapshotFormation } from '../../data/formationPolls';
import { LEAGUE_HISTORY_QUERY_KEY, type LeagueData } from '../../data/queries';
import { goalsLabel, type Combo } from '../../domain/balancing';
import { clampInt } from '../../domain/matchEdit';
import { nextLeagueDay } from '../../domain/leagueDay';
import { useLeagueSettings } from '../../data/leagues';
import { setAdvancedEnabled, useAdvancedEnabled } from '../../data/advancedPredictions';

const input = { width: '100%', padding: '9px 11px', border: '1.5px solid var(--gray3)', borderRadius: 7, background: 'var(--gray)', color: 'var(--text)', boxSizing: 'border-box' } as const;
const lbl = { fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 5 } as const;
const score = { width: 60, padding: '9px 11px', border: '1.5px solid var(--gray3)', borderRadius: 7, background: 'var(--gray)', color: 'var(--text)', fontSize: 16, fontWeight: 800, textAlign: 'center' } as const;

export function NewMatchDialog({ data, combos, idx, goalkeeperIds, onClose }: { data: LeagueData; combos: Combo[]; idx: number; goalkeeperIds: string[]; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const players = data.dataset.players;
  const combo = combos[idx] as Combo;
  // la data proposta è il prossimo giorno di partita scelto nelle impostazioni della lega (altrimenti oggi)
  const leagueSettings = useLeagueSettings(data.league.id);
  const betting = useAdvancedEnabled(data.league.id);
  const [bettingSelected, setBettingSelected] = useState(true);
  const [date, setDate] = useState(() => nextLeagueDay(leagueSettings.data?.day));
  // ora e luogo: si propongono quelli dell'ultima partita che li ha (di solito si gioca sempre allo stesso posto)
  const last = [...data.dataset.matches].reverse().find((x) => x.place || x.time);
  const [time, setTime] = useState(() => String(last?.time ?? ''));
  const [place, setPlace] = useState<PlaceValue>(() => (last ? placeOf(last) : NO_PLACE));
  const [notes, setNotes] = useState('');
  const [sa, setSa] = useState('');
  const [sb, setSb] = useState('');
  const [busy, setBusy] = useState(false);
  const canBetOnMatch = sa === '' && sb === '';
  const names = (t: number[]) => t.map((i) => players[i]?.name).join(', ');
  const close = () => {
    releaseKeyboard();
    onClose();
    repairViewport();
  };
  const enableBetForLeague = async () => {
    setBusy(true);
    try {
      await setAdvancedEnabled(data.league.id, true);
      const refreshed = await betting.refetch();
      if (refreshed.error || refreshed.data !== true) throw refreshed.error ?? new Error('Bet non risulta ancora attivo');
      setBettingSelected(true);
      toast('Bet attivato per la lega. Ora puoi scegliere se abilitarlo per questa partita.');
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!date) return toast('Scegli la data');
    if (!time) return toast('Scegli l’ora della partita');
    if (!place.name.trim()) return toast('Scrivi dove si gioca');
    setBusy(true);
    try {
      toast('⏳ Salvataggio...');
      const seen = new Set<string>();
      const ordered = [combo, ...combos.filter((_, i) => i !== idx)].filter((candidate) => {
        const a = candidate.tA.map((i) => players[i]!.id).sort().join(',');
        const b = candidate.tB.map((i) => players[i]!.id).sort().join(',');
        const key = candidate.tA.length === candidate.tB.length && b < a ? `${b}/${a}` : `${a}/${b}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 10);
      await createMatch({
        leagueId: data.league.id, date, time, place: place.name.trim(), placeLat: place.lat, placeLng: place.lng, placeUrl: place.url, notes: notes.trim(),
        bettingEnabled: betting.data === true && bettingSelected && canBetOnMatch,
        teamA: combo.tA.map((i) => (players[i] as { id: string }).id),
        teamB: combo.tB.map((i) => (players[i] as { id: string }).id),
        goalkeeperIds,
        scoreA: sa !== '' ? clampInt(sa, 0, 99, 0) : '', scoreB: sb !== '' ? clampInt(sb, 0, 99, 0) : '',
        // previsione al momento della creazione → "Precisione bilanciamento" esatta in seguito
        pred: +(combo.sA - combo.sB).toFixed(4), predRank: combo.custom ? 0 : idx + 1,
        formationOptions: sa === '' && sb === '' ? ordered.map((candidate) => snapshotFormation(candidate, players,
          candidate.custom ? 0 : combos.indexOf(candidate) + 1)) : undefined,
      });
      await qc.invalidateQueries({ queryKey: LEAGUE_HISTORY_QUERY_KEY });
      await qc.invalidateQueries({ queryKey: ['formation-polls', data.league.id] });
      toast('Partita creata!');
      close();
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div id="match-modal" style={{ display: 'block', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500, padding: 14, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ maxWidth: 600, margin: '0 auto', background: 'var(--gray)', borderRadius: 'var(--radius)', padding: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, minHeight: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }} id="match-modal-title">📅 Nuova partita</div>
          <button onClick={close} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 22, padding: 4, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          <div>
            <label style={lbl} htmlFor="nm-date">📅 Data partita</label>
            <input type="date" id="nm-date" className="dt-inp" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...input, fontSize: 16 }} />
          </div>
          <div>
            <label style={lbl} htmlFor="nm-time">⏰ Ora</label>
            <HourSelect id="nm-time" value={time} onChange={setTime} style={input} />
          </div>
          <div>
            <label style={lbl} htmlFor="nm-place">📍 Luogo</label>
            <PlaceField inputId="nm-place" placeholder="es. Campo Sole" value={place} onChange={setPlace} style={input} />
          </div>
          <div>
            <label style={lbl} htmlFor="nm-notes">📝 Note (opz.)</label>
            <input type="text" id="nm-notes" placeholder="es. partita serale al Sole" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...input, fontSize: 16 }} />
          </div>
          <div style={{ background: 'var(--green-light)', borderRadius: 'var(--radius-sm)', padding: '9px 11px', border: '1px solid var(--green)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', marginBottom: 4 }}>✓ Squadre dall'ultima generazione</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>
              <strong>🔵 Blu:</strong> {names(combo.tA)}<br /><strong>⚪ Bianchi:</strong> {names(combo.tB)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 5 }}>
              🧤 {goalkeeperIds.length ? `${goalkeeperIds.length === 1 ? 'Portiere fisso' : 'Portieri fissi'}: ${goalkeeperIds.map((id) => players.find((p) => p.id === id)?.name).join(' e ')}` : 'Portieri volanti'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6 }}>
              🎯 Previsione: <strong>{goalsLabel(combo.sA - combo.sB)}</strong> · {combo.custom ? 'squadre modificate a mano' : `${idx + 1}ª proposta`}{' '}
              <span style={{ opacity: 0.7 }}>(viene salvata per misurare la precisione)</span>
            </div>
          </div>
          <div className="formation-publish-note">⭐ Pubblicando una partita senza risultato apri per 24 ore la scelta delle squadre a tutti i membri Premium della lega. La formazione mostrata resta quella iniziale in caso di pareggio o zero voti.</div>
          <div className="new-match-betting-section">
            <label className={`new-match-betting-option${betting.data === true && canBetOnMatch ? '' : ' is-disabled'}`} htmlFor="nm-betting">
              <input id="nm-betting" type="checkbox" disabled={busy || betting.data !== true || !canBetOnMatch} checked={betting.data === true && canBetOnMatch && bettingSelected} onChange={(event) => setBettingSelected(event.target.checked)} />
              <span><strong>Bet attivo per questa partita</strong><small>{!canBetOnMatch ? 'Disponibile solo per partite senza risultato.' : betting.data === false ? 'Per abilitarlo, attiva prima Bet nella lega.' : betting.isError ? 'Impossibile verificare Bet: riprova.' : 'Scegli se su questa partita si potranno fare pronostici.'}</small></span>
            </label>
            {betting.isSuccess && !betting.data ? <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void enableBetForLeague()}>Attiva Bet nella lega</button> : null}
          </div>
          <div>
            <label style={lbl} htmlFor="nm-scoreA">⚽ Risultato (opz.)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="number" id="nm-scoreA" placeholder="—" min={0} value={sa} onChange={(e) => setSa(e.target.value)} style={score} />
              <span style={{ fontSize: 14, color: 'var(--text3)' }}>vs</span>
              <input type="number" id="nm-scoreB" placeholder="—" min={0} value={sb} onChange={(e) => setSb(e.target.value)} style={score} />
            </div>
          </div>
          {betting.isError ? <div role="alert" className="formation-publish-note">Impossibile verificare le impostazioni Bet della lega. <button type="button" onClick={() => void betting.refetch()}>Riprova</button></div> : null}
          <button className="btn btn-primary btn-full" disabled={busy||!betting.isSuccess} onClick={() => void save()}>💾 Crea partita</button>
        </div>
      </div>
    </div>
  );
}
