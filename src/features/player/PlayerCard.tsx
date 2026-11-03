// Scheda giocatore (sola lettura): foto, figurina, statistiche, pagelle, bacheca, compagni e avversari.
// Fonte: openPlayerCardByIdx, bachecaHTML, playerExtrasHTML in legacy/index.html. Le modifiche arrivano con l'accesso admin.
import { useEffect, useMemo, useState } from 'react';
import { formOn } from '../../data/gameSettings';
import { photoUrl, type LeagueData } from '../../data/queries';
import { formState } from '../../domain/form';
import { profileSeasonData } from '../../domain/profile';
import { PlayerAvatar } from './PlayerAvatar';
import { playerPairs, type PairMate } from '../../domain/pairs';
import { bachecaView, formWeightTip, formWeightView, playerTrophies } from '../../domain/playerCard';
import { seasonStats } from '../../domain/stats';
import { ICONS, STATS, type Player } from '../../domain/types';
import { FireChip } from '../rosa/RosaList';
import { FutMini } from './FutMini';
import { PagelleSection } from './PagelleSection';
import { PlayerEditTop } from './PlayerEditTop';
import { PlayerBenchRow } from './PlayerBenchRow';
import { PlayerLinkRow } from './PlayerLinkRow';
import { PlayerPagelleDialog } from './PlayerPagelleDialog';

function Avatar({ player, photo }: { player: Player; photo: string | null }) {
  return <PlayerAvatar key={`${player.id}:${photo}`} size="xl" name={player.name} roles={player.roles} photo={photo} />;
}

function Bacheca({ data, player, open, onToggle }: { data: LeagueData; player: Player; open: boolean; onToggle: () => void }) {
  const v = useMemo(() => bachecaView(playerTrophies(data.dataset, player, data.albo)), [data, player]);
  const [liveOpen, setLiveOpen] = useState(false);
  if (v.empty) {
    return (
      <div className="pe-sec">
        <div className="bach-sum static">
          <span className="pe-title" style={{ margin: 0 }}>🏆 Bacheca</span>
          <span className="bach-sumt">Ancora nessun trofeo</span>
        </div>
      </div>
    );
  }
  return (
    <div className={`pe-sec bach${open ? ' open' : ''}`}>
      <div className="bach-sum" onClick={onToggle}>
        <span className="pe-title" style={{ margin: 0 }}>🏆 Bacheca</span>
        <span className="bach-sumt">{v.summary}</span>
        <span className="bach-arr">▾</span>
      </div>
      <div className="bach-body">
        {v.chips.length ? (
          <div className="trophies">
            {v.chips.map((x) => (
              <span key={x.t} className={`trophy${x.shame ? ' shame' : ''}`}>
                {x.t}
                {x.seasons.length > 1 ? <>{' '}<b>×{x.seasons.length}</b></> : null}
                <small>{x.seasons.join(', ')}</small>
              </span>
            ))}
          </div>
        ) : null}
        {v.live ? (
          <div className={`bach-live${liveOpen ? ' open' : ''}`} onClick={() => setLiveOpen((o) => !o)} title="Premi della stagione in corso: possono ancora cambiare">
            <span className="bach-lbl">{v.live.label}</span>
            <span className="bach-emo">{v.live.emojis}</span>
            <span className="bach-names">{v.live.names}</span>
            <span className="bach-more">›</span>
          </div>
        ) : null}
        {v.feats.length ? (
          <div className="bach-feats">
            {v.feats.map((f) => (
              <span key={f.k} title={f.d}>{f.t} <b>×{f.count}</b></span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const plural = (a: number, kind: 'v' | 'p') => `${a} ${a === 1 ? (kind === 'v' ? 'vinta' : 'persa') : kind === 'v' ? 'vinte' : 'perse'}`;

/** Una riga di "Compagni e avversari" (vuota se non c'è nessuno che soddisfa la regola). */
function PairLine({ ico, lbl, c, kind, targetId, onOpenPlayer }: {
  ico: string; lbl: string; c: PairMate | null; kind: 'v' | 'p'; targetId: string | undefined; onOpenPlayer: (id: string) => void;
}) {
  if (!c) return null;
  return (
    <div className="pair-line">
      <span className="pair-l">{ico} {lbl}</span>
      <span className="pair-n">
        {targetId ? <span className="albo-name" onClick={() => onOpenPlayer(targetId)}>{c.name}</span> : c.name}
      </span>
      <span className="pair-v">{kind === 'v' ? plural(c.w, 'v') : plural(c.l, 'p')} su {c.n}</span>
    </div>
  );
}

function Pairs({ data, player, onOpenPlayer }: { data: LeagueData; player: Player; onOpenPlayer: (id: string) => void }) {
  const q = useMemo(() => playerPairs(data.dataset, player), [data, player]);
  const idOf = (c: PairMate | null) => (c ? data.dataset.players.find((p) => p.name === c.name)?.id : undefined);
  const any = q.friend || q.cursed || q.nemesis || q.victim;
  return (
    <div className="pe-sec">
      <div className="pe-title">
        🤝 Compagni e avversari
      </div>
      <PairLine ico="🤝" lbl="Compagno d'oro" c={q.friend} kind="v" targetId={idOf(q.friend)} onOpenPlayer={onOpenPlayer} />
      <PairLine ico="💔" lbl="Compagno maledetto" c={q.cursed} kind="p" targetId={idOf(q.cursed)} onOpenPlayer={onOpenPlayer} />
      <PairLine ico="😈" lbl="Bestia nera" c={q.nemesis} kind="p" targetId={idOf(q.nemesis)} onOpenPlayer={onOpenPlayer} />
      <PairLine ico="🎯" lbl="Vittima preferita" c={q.victim} kind="v" targetId={idOf(q.victim)} onOpenPlayer={onOpenPlayer} />
      {!any ? <div className="pe-empty">Servono almeno 3 partite con o contro lo stesso giocatore, e un bilancio di più di metà</div> : null}
    </div>
  );
}

export function PlayerCard({ data, playerId, onClose, onOpenPlayer, onOpenMatch, bachecaOpen, onToggleBacheca, canEdit = false, inline = false }: {
  data: LeagueData;
  playerId: string;
  onClose: () => void;
  onOpenPlayer: (id: string) => void;
  onOpenMatch: (matchId: string) => void;
  bachecaOpen: boolean;
  onToggleBacheca: () => void;
  /** scheda modificabile (foto, ruoli, statistiche): dalla Rosa, per l'amministratore */
  canEdit?: boolean;
  /** dentro una pagina (Il mio profilo) invece che a tutto schermo: niente ✕ né Esc */
  inline?: boolean;
}) {
  const { dataset } = data;
  const player = dataset.players.find((p) => p.id === playerId);
  const [pagelleOpen, setPagelleOpen] = useState<{ focus?: string } | null>(null);
  const all = useMemo(() => seasonStats(dataset), [dataset]);
  const period = useMemo(() => inline && player ? profileSeasonData(dataset, player.id, player.name) : null, [dataset, inline, player]);
  const statsData = useMemo(() => period ? { ...data, dataset: period.dataset } : data, [data, period]);
  const useForm = formOn(data);

  // Esc chiude la scheda (passando a un altro giocatore la scheda riparte da capo: vedi key in App)
  useEffect(() => {
    if (inline) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose, inline]);

  if (!player) return null;
  const state = formState(dataset, player, all);
  const w = formWeightView(dataset, player, useForm, all);
  const weightRow = (
    <div className="stat-row stat-row-ro" title={formWeightTip}>
      <span className="stat-icon">⚖️</span>
      <span className="stat-name">Peso voti</span>
      {w.off ? (
        <>
          <span className="stat-input stat-ro" style={{ color: 'var(--text3)', WebkitTextFillColor: 'var(--text3)' }}>Off</span>
          <div className="mini-bar"><div className="mini-bar-fill" style={{ width: '0%' }} /></div>
        </>
      ) : (
        <>
          <span className="stat-input stat-ro">{w.pct}%</span>
          <div className="mini-bar"><div className="mini-bar-fill" style={{ width: `${w.fill}%`, background: 'var(--amber)' }} /></div>
        </>
      )}
    </div>
  );

  return (
    <>
      <div
        id={inline ? 'profile-player-card' : 'match-modal'}
        style={inline ? undefined : {
          display: 'block', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500, padding: 14,
          overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch',
        }}
      >
        <div style={inline ? { maxWidth: 600, margin: '0 auto', background: 'var(--gray)', borderRadius: 'var(--radius)', padding: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.3)' } : { maxWidth: 600, margin: '0 auto', background: 'var(--gray)', borderRadius: 'var(--radius)', padding: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, minHeight: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 800 }} id="match-modal-title">
              {player.name}
              <FireChip state={state} />
              {canEdit ? null : (
                <span className="mt-roles">
                  {(player.roles ?? []).map((r) => (
                    <span key={r} className={`rp rp-${r.toLowerCase()}`}>{r}</span>
                  ))}
                </span>
              )}
            </div>
            {inline ? null : <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 22, padding: 4, lineHeight: 1 }}>✕</button>}
          </div>
          <div id="match-modal-body">
            {canEdit ? (
              <PlayerEditTop data={data} player={player} weightRow={weightRow} />
            ) : (
              <>
                <div className="photo-row" style={{ margin: '2px 0 8px', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
                  <Avatar player={player} photo={photoUrl(data.photos[player.id])} />
                  <div style={{ width: 84 }}><FutMini data={data} player={player} statsDataset={period?.dataset} /></div>
                </div>
                <div className="stats-grid">
                  {STATS.map((s, j) => (
                    <div key={s} className="stat-row">
                      <span className="stat-icon">{ICONS[j]}</span>
                      <span className="stat-name">{s}</span>
                      <span className="stat-input" style={{ border: 'none', background: 'transparent', WebkitTextFillColor: 'var(--text)' }}>{player.stats[j]}</span>
                      <div className="mini-bar"><div className="mini-bar-fill" style={{ width: `${(player.stats[j] ?? 0) * 10}%` }} /></div>
                    </div>
                  ))}
                  {weightRow}
                </div>
              </>
            )}
            {canEdit ? <PlayerLinkRow leagueId={data.league.id} player={player} /> : null}
            {canEdit ? <PlayerBenchRow data={data} player={player} onRemoved={onClose} /> : null}
            <div id="modal-pagelle" style={{ marginTop: 4, paddingTop: 6, borderTop: '1px solid var(--gray2)' }}>
              {period ? <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>{period.label}</div> : null}
              {period ? <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Stato di forma calcolato sullo storico della lega</div> : null}
              <PagelleSection data={statsData} player={player} formDataset={dataset} showResultsWithoutRatings={!!period} onOpenAll={(focus) => setPagelleOpen({ focus })} onOpenMatch={onOpenMatch} />
            </div>
            <Bacheca data={data} player={player} open={bachecaOpen} onToggle={onToggleBacheca} />
            <Pairs data={data} player={player} onOpenPlayer={onOpenPlayer} />
          </div>
        </div>
      </div>
      {pagelleOpen ? (
        <PlayerPagelleDialog data={statsData} player={player} scopeLabel={period?.label} focusId={pagelleOpen.focus} onClose={() => setPagelleOpen(null)} onOpenMatch={onOpenMatch} />
      ) : null}
    </>
  );
}

