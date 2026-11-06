import { PlayerPagellaText } from './PlayerPagellaText';
// Finestra "📝 Le pagelle di …": tutte le pagelle del giocatore, le più recenti per prime.
// Fonte: openPlayerPagelle in legacy/index.html.
import { useEffect, useRef, useState } from 'react';
import type { LeagueData } from '../../data/queries';
import { formatDate } from '../../domain/format';
import { playerPagelleList, voteColor } from '../../domain/playerCard';
import type { Player } from '../../domain/types';
import { waHTML } from '../../domain/whatsapp';

export function PlayerPagelleDialog({ data, player, focusId, onClose, onOpenMatch, scopeLabel }: {
  data: LeagueData;
  player: Player;
  focusId?: string;
  scopeLabel?: string;
  onClose: () => void;
  onOpenMatch: (matchId: string) => void;
}) {
  const list = playerPagelleList(data.dataset, player);
  const [open, setOpen] = useState<Set<string>>(() => new Set(focusId ? [focusId] : []));
  const focusRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = window.setTimeout(() => focusRef.current?.scrollIntoView({ block: 'center' }), 30);
    return () => window.clearTimeout(t);
  }, []);
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <div id="pl-dialog" style={{ display: 'flex' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pgt-box pt-box">
        <div className="pl-head">
          <span>📝 Le pagelle di <b>{player.name}</b></span>
          <button type="button" onClick={onClose} aria-label="Chiudi">✕</button>
        </div>
        {scopeLabel ? <div style={{ fontSize: 12, color: 'var(--text2)', padding: '0 0 8px' }}>{scopeLabel}</div> : null}
        <div className="pl-list">
          {list.length ? (
            list.map((x) => {
              const focus = x.m.id === focusId;
              return (
                <div
                  key={x.m.id}
                  ref={focus ? focusRef : undefined}
                  id={`pl-${x.m.id}`}
                  className={`pl-item${x.hasText || x.tit || x.desc ? '' : ' bare'}${open.has(x.m.id) ? ' open' : ''}${focus ? ' focus' : ''}`}
                  onClick={() => toggle(x.m.id)}
                >
                  <div className="pl-top">
                    <span>{formatDate(x.m.date)}</span>
                    <span className="pl-v" style={{ color: voteColor(x.v) }}>{x.v}</span>
                  </div>
                  {!data.textsDeferred && x.tit ? <div className="pl-tit">«{x.tit}»</div> : null}
                  {!data.textsDeferred && x.desc ? <div className="pl-desc" dangerouslySetInnerHTML={{ __html: waHTML(x.desc) }} /> : null}
                  {data.textsDeferred && open.has(x.m.id) ? <PlayerPagellaText data={data} matchId={x.m.id} playerId={player.id} /> : null}
                  {data.editors?.[x.m.id] && (x.hasText || x.tit || x.desc) ? <div className="pl-ed">✒️ Redazione {data.editors[x.m.id]}</div> : null}
                  <button
                    type="button"
                    className="pl-go"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenMatch(x.m.id);
                    }}
                  >
                    Apri la partita ›
                  </button>
                </div>
              );
            })
          ) : (
            <div className="mb-note" style={{ textAlign: 'center', padding: 16 }}>Nessuna pagella ancora</div>
          )}
        </div>
      </div>
    </div>
  );
}
