// Scheda "Il mio giocatore" (solo con l'accesso): "questo sono io" → richiesta → conferma dell'amministratore.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '../../app/auth';
import { useConfirm } from '../../app/Dialogs';
import { useToast } from '../../app/Toast';
import { MY_PLAYER_KEY, requestClaim, unlinkMe, useMyPlayer, useUnclaimed } from '../../data/claims';
import type { LeagueData } from '../../data/queries';
import { PlayerCard } from '../player/PlayerCard';
import { ProfileCard } from './ProfileCard';

/**
 * «Il mio giocatore». In cima alla pagina il collegamento si vede solo finché non sono collegato (scelta del nome, richiesta in attesa),
 * insieme alla scheda e al riepilogo; da collegato lo stato («Sei collegato a…», Scollega) va in fondo (`bottom`).
 */
export function MyPlayerCard({ data, onOpenMatch, bottom = false }: { data: LeagueData | undefined; onOpenMatch?: (matchId: string) => void; bottom?: boolean }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const q = useMyPlayer(user?.id ?? null);
  const [pick, setPick] = useState('');
  // solo chi non ha ancora un account collegato (elenco dal database)
  const free = useUnclaimed(data?.league.id, !!user && !!q.data && !q.data.linked && !q.data.pending);
  const [busy, setBusy] = useState(false);
  const [bacheca, setBacheca] = useState(false);
  // la scheda che si sta guardando: la mia, o (toccando un compagno) quella di un altro giocatore
  const [viewId, setViewId] = useState<string | null>(null);
  if (!user) return null;
  const s = q.data;
  const roster = free.data ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: MY_PLAYER_KEY });

  const send = async () => {
    if (!data || !pick) return toast('Scegli il tuo nome');
    setBusy(true);
    try {
      await requestClaim(data.league.id, pick);
      await refresh();
      toast("Richiesta inviata: la conferma l'amministratore");
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const unlink = async () => {
    const ok = await confirm({ icon: '🔗', title: 'Scollegare il giocatore?', lines: [`Non sarai più collegato a ${s?.linked?.name}. Per ricollegarti serve una nuova richiesta.`], okLabel: 'Scollega', danger: true });
    if (!ok) return;
    try {
      await unlinkMe();
      await refresh();
      toast('Scollegato');
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    }
  };

  return (
    <>
    {(s?.linked ? bottom : !bottom) ? (
    <div className="card" id="myplayer-card" style={bottom ? { marginTop: 12 } : undefined}>
      <div className="section-header">⚽ Il mio giocatore</div>
      {q.isLoading ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>⏳ Caricamento…</div> : null}
      {q.isError ? <div id="myplayer-error" style={{ fontSize: 12, color: 'var(--red)', fontWeight: 700 }}>{(q.error as Error).message}</div> : null}
      {s?.linked ? (
        <div>
          <div style={{ fontSize: 13 }}>Sei collegato a <b id="myplayer-name">{s.linked.name}</b>.</div>
          <button className="btn btn-secondary btn-full" style={{ marginTop: 10 }} onClick={() => void unlink()}>Scollega</button>
        </div>
      ) : s?.pending ? (
        <div id="myplayer-pending" style={{ fontSize: 13 }}>
          Richiesta inviata per <b>{s.pending.playerName}</b>: aspetta la conferma dell'amministratore della lega.
        </div>
      ) : s ? (
        <div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            Sei un giocatore di <b>{data?.league.name}</b>? Scegli il tuo nome: l'amministratore deve confermare.
          </div>
          {s.rejected ? <div style={{ fontSize: 12, color: 'var(--red)', fontWeight: 700, marginBottom: 8 }}>L'ultima richiesta è stata rifiutata.</div> : null}
          <select
            id="myplayer-select" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Il tuo nome"
            style={{ width: '100%', fontSize: 16, padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--gray3)', background: 'var(--gray)', color: 'var(--text)', marginBottom: 8, boxSizing: 'border-box' }}
          >
            <option value="">— scegli —</option>
            {roster.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {free.data && !roster.length ? <div id="myplayer-none" style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Tutti i giocatori di questa lega hanno già un account collegato.</div> : null}
          <button className="btn btn-primary btn-full" id="myplayer-send" disabled={busy} onClick={() => void send()}>Questo sono io</button>
        </div>
      ) : null}
    </div>
    ) : null}
    {!bottom && s?.linked && data && data.dataset.players.some((p) => p.id === s.linked?.id) ? (
      <div style={{ marginBottom: 12 }}>
        {viewId && viewId !== s.linked.id ? (
          <button type="button" id="profile-back" className="btn btn-secondary btn-sm" style={{ marginBottom: 8 }} onClick={() => setViewId(null)}>↩ Torna alla mia scheda</button>
        ) : null}
        <PlayerCard
          key={viewId ?? s.linked.id}
          inline
          data={data}
          playerId={viewId ?? s.linked.id}
          onClose={() => setViewId(null)}
          onOpenPlayer={(id) => setViewId(id)}
          onOpenMatch={(id) => onOpenMatch?.(id)}
          bachecaOpen={bacheca}
          onToggleBacheca={() => setBacheca((o) => !o)}
        />
      </div>
    ) : null}
    {!bottom && s?.linked ? <ProfileCard playerId={s.linked.id} name={s.linked.name} /> : null}
    </>
  );
}
