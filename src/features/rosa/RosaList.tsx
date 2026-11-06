import { FireChip } from '../player/FireChip';
// Elenco della rosa: carte compatte, la più forte per prima (come legacy: buildRosa).
import { useMemo } from 'react';
import { photoUrl, type LeagueData } from '../../data/queries';
import { calcOvr, rosaOrder } from '../../domain/ovr';
import { formState, pagInfo, playerRatingAvg } from '../../domain/form';
import { PlayerAvatar } from '../player/PlayerAvatar';
import { playerSeason, seasonStats } from '../../domain/stats';
import { profileSeasonData } from '../../domain/profile';

/** 🔥 In forma / 🌧️ In crisi accanto al nome. */
export { FireChip } from '../player/FireChip';

// Le statistiche di un periodo non cambiano finché il periodo (oggetto in cache) è lo stesso.
const periodStats = new WeakMap<object, ReturnType<typeof seasonStats>>();
function statsOfPeriod(period: Parameters<typeof seasonStats>[0]) {
  let s = periodStats.get(period);
  if (!s) periodStats.set(period, s = seasonStats(period));
  return s;
}

export function RosaList({ data, onOpen, onAdd }: { data: LeagueData; onOpen: (playerId: string) => void; onAdd?: () => void }) {
  const { dataset, weights } = data;
  const rows = useMemo(() => {
    const all = seasonStats(dataset);
    return rosaOrder(dataset.players, weights).map((i) => {
      const p = dataset.players[i]!;
      const period = profileSeasonData(dataset, p.id, p.name).dataset;
      return {
        p,
        ovr: calcOvr(p.stats, weights).toFixed(1),
        pag: pagInfo(playerRatingAvg(playerSeason(period, p, statsOfPeriod(period))).avg),
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
                <PlayerAvatar key={`${p.id}:${photo}`} name={p.name} roles={p.roles ?? []} photo={photo} />
              </div>
              <div className="ph-info">
                <div className="ph-name-row">
                  <span className="player-name-display">{p.name}</span>
                  <FireChip state={state} />
                </div>
                <div className="rosa-metrics"><span className={`pag-badge ${pag.cls}`} title="Media pagelle">{pag.label}</span><span className="ovr-badge">OVR {ovr}</span></div>
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
