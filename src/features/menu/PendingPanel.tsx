// ☰ → «Partite senza pagelle»: l'elenco delle partite con risultato ma senza titoli e descrizioni.
// Ogni partita si può scrivere oppure «saltare» (non si vuole pagellare): esce dal conteggio nel menu; si può rimettere quando si vuole.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Sheet } from '../../app/Sheet';
import { useToast } from '../../app/Toast';
import { useConfirm } from '../../app/Dialogs';
import { setRatingsSkipped, setRatingsSkippedMany } from '../../data/mutations';
import { LEAGUE_QUERY_KEY, type LeagueData } from '../../data/queries';
import { formatDate, whenWhere } from '../../domain/format';
import { pendingRatings, scoreText, skippedRatings } from '../../domain/matches';
import type { Match } from '../../domain/types';

export function PendingPanel({ data, onClose, onOpenMatch }: { data: LeagueData; onClose: () => void; onOpenMatch: (matchId: string, text?: boolean) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const confirm = useConfirm();
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

  /** Data di un certo numero di giorni fa (aaaa-mm-gg): le partite PIÙ VECCHIE di questa si saltano insieme. */
  const before = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toLocaleDateString('sv-SE'); // aaaa-mm-gg, ora locale
  };
  const older = (days: number) => pending.filter((m) => String(m.date ?? '') < before(days));
  const bulk = async (list: Match[], skip: boolean, what: string) => {
    if (!list.length) return;
    const ok = await confirm({
      icon: skip ? '⏭️' : '↩',
      title: skip ? 'Saltare le pagelle?' : 'Rimettere le pagelle da scrivere?',
      lines: [skip ? `${list.length} partite (${what}) escono da «Pagelle da scrivere».` : `${list.length} partite tornano tra le pagelle da scrivere.`, skip ? 'Le puoi rimettere quando vuoi, una per una o tutte insieme.' : ''].filter(Boolean),
      okLabel: skip ? 'Salta' : 'Rimetti',
    });
    if (!ok) return;
    setBusy('bulk');
    try {
      const n = await setRatingsSkippedMany(list.map((m) => m.id), skip);
      await qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY });
      toast(skip ? `${n} partite saltate` : `${n} partite rimesse da scrivere`);
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
          Partite con il risultato in cui <b>meno della metà dei giocatori</b> ha titolo o descrizione (non basta che ne manchino un paio). Se per una partita <b>non vuoi scrivere le pagelle</b>, premi <b>Salta</b>: esce da «Pagelle da scrivere». Puoi rimetterla quando vuoi.
        </div>
        {pending.length > 1 ? (
          <div id="pending-bulk" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {older(7).length ? (
              <button type="button" id="skip-older-7" className="btn btn-secondary btn-sm" style={{ whiteSpace: 'normal' }} disabled={busy === 'bulk'} onClick={() => void bulk(older(7), true, 'più vecchie di 7 giorni')}>
                ⏭️ Salta le {older(7).length} più vecchie di 7 giorni
              </button>
            ) : null}
            {older(30).length && older(30).length !== older(7).length ? (
              <button type="button" id="skip-older-30" className="btn btn-secondary btn-sm" style={{ whiteSpace: 'normal' }} disabled={busy === 'bulk'} onClick={() => void bulk(older(30), true, 'più vecchie di 30 giorni')}>
                ⏭️ Salta le {older(30).length} più vecchie di 30 giorni
              </button>
            ) : null}
            <button type="button" id="skip-all" className="btn btn-secondary btn-sm" style={{ whiteSpace: 'normal' }} disabled={busy === 'bulk'} onClick={() => void bulk(pending, true, 'tutte')}>
              ⏭️ Salta tutte e {pending.length}
            </button>
          </div>
        ) : null}
        {pending.length ? pending.map((m) => row(m, false)) : <div id="pending-empty" style={{ fontSize: 13, color: 'var(--text3)' }}>Niente da scrivere: tutte le partite hanno almeno metà delle descrizioni (o sono state saltate).</div>}
      </div>
      {skipped.length ? (
        <div className="card" id="pending-skipped" style={{ marginTop: 12 }}>
          <div className="section-header">⏭️ Saltate ({skipped.length})</div>
          {skipped.length > 1 ? (
            <button type="button" id="restore-all" className="btn btn-secondary btn-sm" style={{ whiteSpace: 'normal', marginBottom: 8 }} disabled={busy === 'bulk'} onClick={() => void bulk(skipped, false, 'tutte')}>
              ↩ Rimetti tutte e {skipped.length}
            </button>
          ) : null}
          {skipped.map((m) => row(m, true))}
        </div>
      ) : null}
    </Sheet>
  );
}
