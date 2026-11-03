// "📈 Pagelle": numeri, grafico a barre (ultime 10) con riquadro al tocco, ultima pagella scritta.
// Fonte: drawPagelle e pgBarTap in legacy/index.html.
import { useEffect, useRef, useState } from 'react';
import type { LeagueData } from '../../data/queries';
import { formatDate } from '../../domain/format';
import { pagelleView, playerPagelleList, voteColor, type PagCell } from '../../domain/playerCard';
import type { Player } from '../../domain/types';
import { waHTML } from '../../domain/whatsapp';

const NOTE = { fontSize: 12, color: 'var(--text3)', textAlign: 'center' as const };

function Cell({ c }: { c: PagCell }) {
  if (c.dots !== undefined) {
    return (
      <div className="pg-cell">
        <div className="pg-lbl">{c.label}</div>
        <div className="pg-form">
          {c.dots ? (
            c.dots.map((col, i) => (
              <span key={i} style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: col, margin: '0 1px' }} />
            ))
          ) : (
            <span style={{ color: 'var(--text3)' }}>—</span>
          )}
        </div>
      </div>
    );
  }
  const st = { ...(c.color ? { color: c.color } : {}), ...(c.size ? { fontSize: c.size } : {}) };
  return (
    <div className="pg-cell">
      <div className="pg-lbl">{c.label}</div>
      <div className="pg-val" style={Object.keys(st).length ? st : undefined}>{c.value}</div>
    </div>
  );
}

export function PagelleSection({ data, player, onOpenAll, onOpenMatch, showResultsWithoutRatings = false }: {
  data: LeagueData;
  player: Player;
  showResultsWithoutRatings?: boolean;
  /** apre la finestra con tutte le pagelle (eventualmente su una partita) */
  onOpenAll: (matchId?: string) => void;
  onOpenMatch: (matchId: string) => void;
}) {
  const v = pagelleView(data.dataset, data.weights, player, undefined, showResultsWithoutRatings);
  // barra toccata e posizione del riquadro (calcolata al tocco, sotto la barra e dentro il grafico)
  const [pop, setPop] = useState<{ j: number; left: number; width: number } | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  // un tocco fuori dal riquadro lo chiude
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.('.pg-pop')) return;
      setPop(null);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  if (v.kind === 'none') return <div style={NOTE}>📊 Nessuna pagella ancora</div>;
  if (v.kind === 'noVotes') {
    return (
      <>
        <div className="pg-head"><span className="pg-title">📈 Pagelle</span></div>
        <div className="pg-grid">{v.cells.map((c) => <Cell key={c.label} c={c} />)}</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginTop: 9 }}>Nessun voto ancora registrato</div>
      </>
    );
  }

  const c = v.chart;
  const items = playerPagelleList(data.dataset, player);
  const sel = pop ? pop.j : null;
  const d = sel != null ? c.series[sel] : undefined;
  const it = d ? items.find((x) => x.m.id === d.matchId) : undefined;
  const hasText = !!(it && (it.tit || it.desc));
  const stats = it ? [it.g ? `⚽ ${it.g}` : '', it.a ? `🅰️ ${it.a}` : ''].filter(Boolean).join(' ') : '';
  const popStyle: React.CSSProperties = pop ? { display: 'block', width: pop.width, left: pop.left } : { display: 'none' };
  const tap = (j: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (pop && pop.j === j) {
      setPop(null);
      return;
    }
    const W = chartRef.current?.clientWidth ?? 0;
    const x = ((j + 0.5) / c.series.length) * W;
    const pw = Math.min(260, W - 8);
    setPop({ j, width: pw, left: Math.max(4, Math.min(W - pw - 4, x - pw / 2)) });
  };

  return (
    <>
      <div className="pg-head">
        <span className="pg-title">📈 Pagelle</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: v.trend.col }}>{v.trend.arrow} {v.trend.label}</span>
      </div>
      <div className="pg-grid" style={{ marginBottom: 4 }}>{v.cells.map((cell) => <Cell key={cell.label} c={cell} />)}</div>
      <div className="pg-chart" ref={chartRef}>
        <svg viewBox={`0 0 ${c.W} ${c.H}`} style={{ width: '100%', height: 'auto', background: 'var(--gray)', borderRadius: 8, display: 'block' }}>
          {c.grid.map((g) => (
            <g key={g.g}>
              <line x1={g.x1} y1={g.y.toFixed(1)} x2={g.x2} y2={g.y.toFixed(1)} stroke="var(--gray3)" strokeWidth="0.5" opacity="0.4" />
              <text x={g.tx} y={(g.y + 3).toFixed(1)} fontSize="7" fill="var(--text3)" textAnchor="end">{g.g}</text>
            </g>
          ))}
          {c.bars.map((b) => (
            <g key={b.j}>
              <rect className={`pg-bar${sel === b.j ? ' sel' : ''}`} data-j={b.j} x={b.x.toFixed(1)} y={b.y.toFixed(1)} width={b.width.toFixed(1)} height={b.height.toFixed(1)} rx="2.5" fill={b.fill} opacity="0.88">
                <title>{formatDate(b.date)}: {b.rating}</title>
              </rect>
              <text x={b.cx.toFixed(1)} y={(b.y - 3).toFixed(1)} fontSize="7.5" fontWeight="800" fill="var(--text2)" textAnchor="middle">{b.rating}</text>
            </g>
          ))}
          {c.trend ? (
            <line x1={c.trend.x1.toFixed(1)} y1={c.trend.y1.toFixed(1)} x2={c.trend.x2.toFixed(1)} y2={c.trend.y2.toFixed(1)} stroke="#5aa9ff" strokeWidth="2" strokeLinecap="round" strokeDasharray="1,5" opacity="0.95" />
          ) : null}
          {c.hits.map((h) => (
            <rect key={h.j} className="pg-hit" x={h.x.toFixed(1)} y="0" width={h.width.toFixed(1)} height={c.H} fill="transparent" onClick={(e) => tap(h.j, e)} />
          ))}
        </svg>
        <div className="pg-pop" style={popStyle} data-j={sel ?? undefined}>
          {d ? (
            <>
              <div className="pgp-top">
                <b>{formatDate(d.date)}</b> · voto <b style={{ color: voteColor(d.rating) }}>{d.rating}</b>
                {stats ? ` · ${stats}` : ''}
              </div>
              {it?.tit ? <div className="pgp-tit">«{it.tit}»</div> : null}
              {it?.desc ? <div className="pgp-desc" dangerouslySetInnerHTML={{ __html: waHTML(it.desc) }} /> : null}
              <button
                type="button"
                className="pgp-go"
                onClick={(e) => {
                  e.stopPropagation();
                  setPop(null);
                  if (hasText) onOpenAll(d.matchId);
                  else onOpenMatch(d.matchId);
                }}
              >
                {hasText ? 'Leggi tutto ›' : 'Apri la partita ›'}
              </button>
            </>
          ) : null}
        </div>
      </div>
      <div className="pg-cap">{c.caption}</div>
      {v.last ? (
        <button type="button" className="pg-last" onClick={() => onOpenAll()}>
          📝 Ultima pagella: {v.last.tit ? <b>«{v.last.tit}»</b> : <i>{v.last.descPreview}</i>} · {v.last.date}{' '}
          <span className="pg-last-n">{v.last.n > 1 ? v.last.n + ' ›' : '›'}</span>
        </button>
      ) : null}
    </>
  );
}
