import { LoadingIndicator } from '../../app/LoadingIndicator';
// ☰ → Panchina: i giocatori rimossi dalla lega selezionata.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '../../app/auth';
import { useConfirm } from '../../app/Dialogs';
import { Sheet } from '../../app/Sheet';
import { useToast } from '../../app/Toast';
import { PLAYERS_STATUS_KEY } from '../../data/invites';
import { useIsSuperAdmin } from '../../data/leagues';
import { addToLeague, BENCH_KEY, deleteBenchPlayer, useBench, type BenchPlayer } from '../../data/panchina';
import { LEAGUE_QUERY_KEY, photoUrl, type LeagueData } from '../../data/queries';
import { PlayerAvatar } from '../player/PlayerAvatar';

export function BenchPanel({ data, onClose }: { data: LeagueData; onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const isSuper = useIsSuperAdmin(user?.id ?? null).data === true;
  const q = useBench(data.league.id, true);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: BENCH_KEY }),
      qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY }),
      qc.invalidateQueries({ queryKey: PLAYERS_STATUS_KEY }),
    ]);

  const add = async (p: BenchPlayer) => {
    setBusy(p.id);
    try {
      await addToLeague(data.league.id, p.id);
      await refresh();
      toast(`${p.name} è ora nella Rosa di ${data.league.name}`);
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const remove = async (p: BenchPlayer) => {
    const ok = await confirm({
      icon: '🗑', title: 'Cancellare per sempre?',
      lines: [`${p.name} viene eliminato dall’app e non si recupera. È possibile solo se non ha partite e non appartiene ad altre leghe.`],
      okLabel: 'Cancella', danger: true,
    });
    if (!ok) return;
    setBusy(p.id);
    try {
      await deleteBenchPlayer(p.id);
      await refresh();
      toast(`${p.name} è stato cancellato`);
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet title="Panchina" onClose={onClose} id="sheet-bench">
      <div className="card">
        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.4, marginBottom: 8 }}>
          I giocatori rimossi dalla Rosa di <b>{data.league.name}</b>. Puoi riportarli nella stessa lega; se hanno un account collegato rientrano anche come membri.
        </div>
        {q.isLoading ? <LoadingIndicator /> : null}
        {q.isError ? <div id="bench-error" style={{ fontSize: 12, color: 'var(--red)', fontWeight: 700 }}>{(q.error as Error).message}</div> : null}
        {q.data && !q.data.length ? <div id="bench-empty" style={{ fontSize: 13, color: 'var(--text3)' }}>La Panchina è vuota.</div> : null}
        {(q.data ?? []).map((p) => {
          const photo = photoUrl(p.photoPath);
          return (
            <div key={p.id} className="row-line bench-row" style={{ gap: 8, alignItems: 'center' }}>
              <PlayerAvatar key={`${p.id}:${photo}`} size="sm" name={p.name} photo={photo} label={p.name.slice(0, 1).toUpperCase()} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {p.roles.join(' · ') || 'nessun ruolo'} · {p.matchesPlayed} {p.matchesPlayed === 1 ? 'partita' : 'partite'}{p.linked ? ' · account collegato' : ''}
                </div>
              </div>
              <button type="button" className="mini-btn" disabled={busy === p.id} onClick={() => void add(p)} aria-label={`Porta ${p.name} in ${data.league.name}`}>Aggiungi</button>
              {isSuper && p.matchesPlayed === 0 ? (
                <button type="button" className="mini-btn danger" disabled={busy === p.id} onClick={() => void remove(p)} aria-label={`Cancella ${p.name}`}>🗑</button>
              ) : null}
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
