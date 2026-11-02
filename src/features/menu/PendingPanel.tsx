// ☰ → «Partite senza pagelle»: l'elenco delle partite con risultato ma senza titoli e descrizioni.
// Ogni partita si può scrivere oppure «saltare» (non si vuole pagellare): esce dal conteggio nel menu; si può rimettere quando si vuole.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Sheet } from '../../app/Sheet';
import { useToast } from '../../app/Toast';
import { setRatingsSkipped } from '../../data/mutations';
import { LEAGUE_QUERY_KEY, type LeagueData } from '../../data/queries';
import { formatDate, whenWhere } from '../../domain/format';
import { pendingRatings, scoreText, skippedRatings } from '../../domain/matches';
import type { Match } from '../../domain/types';

export function PendingPanel({ data, onClose, onOpenMatch }: { data: LeagueData; onClose: () => void; onOpenMatch: (matchId: string, text?: boolean) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const pending = pendingRatings(data.dataset);
  const skipped = skippedRatings(data.dataset);

  const set = async (m: Match, skip: boolean) => {
    setBusy(m.id);
    try {
      await setRatingsSkipped(m.id, skip);
      await qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY });
      toast(skip ? `Pagelle del ${formatDate(m.date)} saltate` : `Pagelle del ${formatDate(m.date)} rimesse da scrivere`);
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const row = (m: Match, skip: boolean) => (
    <div key={m.id} className="row-line pending-row" style={{ gap: 8, alignItems: 'center' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>{formatDate(m.date)} · {scoreText(m)}</div>
        {whenWhere(m) ? <div style={{ fontSize: 11, color: 'var(--text3)' }}>{whenWhere(m)}</div> : null}
      </div>
      {skip ? null : <button type="button" className="mini-btn" onClick={() => { onClose(); onOpenMatch(m.id, true); }} aria-label={`Scrivi le pagelle del ${formatDate(m.date)}`}>Scrivi</button>}
      <button type="button" className="mini-btn" disabled={busy === m.id} onClick={() => void set(m, !skip)} aria-label={`${skip ? 'Rimetti' : 'Salta'} le pagelle del ${formatDate(m.date)}`}>{skip ? 'Rimetti' : 'Salta'}</button>
    </div>
  );

  return (
    <Sheet title="Partite senza pagelle" onClose={onClose} id="sheet-pending">
      <div className="card">
        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.4, marginBottom: 8 }}>
          Partite con il risultato ma senza titoli e descrizioni. Se per una partita <b>non vuoi scrivere le pagelle</b>, premi <b>Salta</b>: esce da «Pagelle da scrivere». Puoi rimetterla quando vuoi.
        </div>
        {pending.length ? pending.map((m) => row(m, false)) : <div id="pending-empty" style={{ fontSize: 13, color: 'var(--text3)' }}>Niente da scrivere: tutte le partite hanno le pagelle (o sono state saltate).</div>}
      </div>
      {skipped.length ? (
        <div className="card" id="pending-skipped" style={{ marginTop: 12 }}>
          <div className="section-header">⏭️ Saltate ({skipped.length})</div>
          {skipped.map((m) => row(m, true))}
        </div>
      ) : null}
    </Sheet>
  );
}
