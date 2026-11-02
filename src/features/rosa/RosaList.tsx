// Elenco della rosa: carte compatte, la più forte per prima (come legacy: buildRosa).
import { useMemo } from 'react';
import { photoUrl, type LeagueData } from '../../data/queries';
import { calcOvr, rosaOrder } from '../../domain/ovr';
import { formState, pagInfo, playerRatingAvg } from '../../domain/form';
import { avatarClass, initials } from '../../domain/format';
import { playerSeason, seasonStats } from '../../domain/stats';

/** 🔥 In forma / 🌧️ In crisi accanto al nome. */
export function FireChip({ state }: { state: 'up' | 'flat' | 'down' | null }) {
  if (state === 'up') return <span className="fire-chip" title="In forma: le ultime pagelle sono sopra la sua media">🔥</span>;
  if (state === 'down') return <span className="fire-chip crisi-chip" title="In crisi: le ultime pagelle sono sotto la sua media">🌧️</span>;
  return null;
}

export function RosaList({ data, onOpen, onAdd }: { data: LeagueData; onOpen: (playerId: string) => void; onAdd?: () => void }) {
  const { dataset, weights } = data;
  const rows = useMemo(() => {
    const all = seasonStats(dataset);
    return rosaOrder(dataset.players, weights).map((i) => {
      const p = dataset.players[i]!;
      return {
        p,
        ovr: calcOvr(p.stats, weights).toFixed(1),
        pag: pagInfo(playerRatingAvg(playerSeason(dataset, p, all)).avg),
        state: formState(dataset, p, all),
      };
    });
  }, [dataset, weights]);

  return (
    <>
    <div id="players-list">
      {rows.map(({ p, ovr, pag, state }, rank) => {
        const photo = photoUrl(data.photos[p.id]);
        return (
        <div key={p.id} className="card card-compact" style={{ animationDelay: Math.min(rank, 12) * 0.03 + 's' }}>
          <div className="player-header" onClick={() => onOpen(p.id)}>
            <div className="ph-top">
              <div className="avatar-stack">
                <span className={`pag-badge ${pag.cls}`} title="Media pagelle">{pag.label}</span>
                <div className={`avatar avatar-ini ${avatarClass(p.roles)}${photo ? ' has-photo' : ''}`} style={photo ? { backgroundImage: `url('${photo}')` } : undefined}>{initials(p.name)}</div>
                <span className="ovr-badge">OVR {ovr}</span>
              </div>
              <div className="ph-info">
                <div className="ph-name-row">
                  <span className="player-name-display">{p.name}</span>
                  <FireChip state={state} />
                </div>
                <div className="role-pills-display">
                  {(p.roles ?? []).map((r) => (
                    <span key={r} className={`rp rp-${r.toLowerCase()}`}>{r}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        );
      })}
    </div>
    {onAdd ? (
      <div className="btn-row" style={{ marginTop: 4 }}>
        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onAdd}>+ Aggiungi giocatore</button>
      </div>
    ) : null}
    </>
  );
}
