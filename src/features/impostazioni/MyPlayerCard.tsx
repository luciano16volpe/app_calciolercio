// Scheda "Il mio giocatore" (solo con l'accesso): "questo sono io" → richiesta → conferma dell'amministratore.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '../../app/auth';
import { useToast } from '../../app/Toast';
import { MY_PLAYER_KEY, requestClaim, useMyPlayer, useUnclaimed } from '../../data/claims';
import type { LeagueData } from '../../data/queries';

/** «Il mio giocatore»: a chi sono collegato (lo gestisce l'amministratore), richiesta in attesa, oppure «Questo sono io» per sceglierlo. */
export function MyPlayerCard({ data }: { data: LeagueData | undefined }) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useMyPlayer(user?.id ?? null);
  const [pick, setPick] = useState('');
  // solo chi non ha ancora un account collegato (elenco dal database)
  const free = useUnclaimed(data?.league.id, !!user && !!q.data && !q.data.linked && !q.data.pending);
  const [busy, setBusy] = useState(false);
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
  return (
    <div className="card" id="myplayer-card">
      <div className="section-header">⚽ Il mio giocatore</div>
      {q.isLoading ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>⏳ Caricamento…</div> : null}
      {q.isError ? <div id="myplayer-error" style={{ fontSize: 12, color: 'var(--red)', fontWeight: 700 }}>{(q.error as Error).message}</div> : null}
      {s?.linked ? (
        <div>
          <div style={{ fontSize: 13 }}>Sei collegato a <b id="myplayer-name">{s.linked.name}</b>.</div>
          <div id="myplayer-locked" style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>Il collegamento lo gestisce l'amministratore della lega: se serve cambiarlo, chiedi a lui.</div>
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
  );
}
