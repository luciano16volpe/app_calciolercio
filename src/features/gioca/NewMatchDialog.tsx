// Finestra "📅 Nuova partita": salva le squadre appena sorteggiate (con la previsione, per misurare la precisione del bilanciamento).
// Fonte: newMatch, saveNewMatch in legacy/index.html.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { releaseKeyboard, repairViewport } from '../../app/Dialogs';
import { useToast } from '../../app/Toast';
import { createMatch } from '../../data/mutations';
import { LEAGUE_QUERY_KEY, type LeagueData } from '../../data/queries';
import { goalsLabel, type Combo } from '../../domain/balancing';
import { clampInt } from '../../domain/matchEdit';

const input = { width: '100%', padding: '9px 11px', border: '1.5px solid var(--gray3)', borderRadius: 7, background: 'var(--gray)', color: 'var(--text)', boxSizing: 'border-box' } as const;
const lbl = { fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 5 } as const;
const score = { width: 60, padding: '9px 11px', border: '1.5px solid var(--gray3)', borderRadius: 7, background: 'var(--gray)', color: 'var(--text)', fontSize: 16, fontWeight: 800, textAlign: 'center' } as const;

export function NewMatchDialog({ data, combo, idx, onClose }: { data: LeagueData; combo: Combo; idx: number; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const players = data.dataset.players;
  const [date, setDate] = useState(() => new Date().toISOString().substring(0, 10));
  // ora e luogo: si propongono quelli dell'ultima partita che li ha (di solito si gioca sempre allo stesso posto)
  const last = [...data.dataset.matches].reverse().find((x) => x.place || x.time);
  const [time, setTime] = useState(() => String(last?.time ?? ''));
  const [place, setPlace] = useState(() => String(last?.place ?? ''));
  const [notes, setNotes] = useState('');
  const [sa, setSa] = useState('');
  const [sb, setSb] = useState('');
  const [busy, setBusy] = useState(false);
  const names = (t: number[]) => t.map((i) => players[i]?.name).join(', ');
  const close = () => {
    releaseKeyboard();
    onClose();
    repairViewport();
  };
  const save = async () => {
    if (!date) return toast('Scegli la data');
    if (!time) return toast('Scegli l’ora della partita');
    if (!place.trim()) return toast('Scrivi dove si gioca');
    setBusy(true);
    try {
      toast('⏳ Salvataggio...');
      await createMatch({
        leagueId: data.league.id, date, time, place: place.trim(), notes: notes.trim(),
        teamA: combo.tA.map((i) => (players[i] as { id: string }).id),
        teamB: combo.tB.map((i) => (players[i] as { id: string }).id),
        scoreA: sa !== '' ? clampInt(sa, 0, 99, 0) : '', scoreB: sb !== '' ? clampInt(sb, 0, 99, 0) : '',
        // previsione al momento della creazione → "Precisione bilanciamento" esatta in seguito
        pred: +(combo.sA - combo.sB).toFixed(4), predRank: combo.custom ? 0 : idx + 1,
      });
      await qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY });
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
            <input type="date" id="nm-date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...input, fontSize: 16 }} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: '0 0 40%' }}>
              <label style={lbl} htmlFor="nm-time">⏰ Ora</label>
              <input type="time" id="nm-time" value={time} onChange={(e) => setTime(e.target.value)} style={{ ...input, fontSize: 16 }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={lbl} htmlFor="nm-place">📍 Luogo</label>
              <input type="text" id="nm-place" maxLength={80} placeholder="es. Campo Sole" value={place} onChange={(e) => setPlace(e.target.value)} style={{ ...input, fontSize: 16 }} />
            </div>
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
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6 }}>
              🎯 Previsione: <strong>{goalsLabel(combo.sA - combo.sB)}</strong> · {combo.custom ? 'squadre modificate a mano' : `${idx + 1}ª proposta`}{' '}
              <span style={{ opacity: 0.7 }}>(viene salvata per misurare la precisione)</span>
            </div>
          </div>
          <div>
            <label style={lbl} htmlFor="nm-scoreA">⚽ Risultato (opz.)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="number" id="nm-scoreA" placeholder="—" min={0} value={sa} onChange={(e) => setSa(e.target.value)} style={score} />
              <span style={{ fontSize: 14, color: 'var(--text3)' }}>vs</span>
              <input type="number" id="nm-scoreB" placeholder="—" min={0} value={sb} onChange={(e) => setSb(e.target.value)} style={score} />
            </div>
          </div>
          <button className="btn btn-primary btn-full" disabled={busy} onClick={() => void save()}>💾 Crea partita</button>
        </div>
      </div>
    </div>
  );
}
