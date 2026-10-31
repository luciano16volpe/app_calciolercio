// Scheda partita (sola lettura): pulsanti, risultato, highlights, Gazzetta, equilibrio squadre, pagelle di ogni giocatore.
// Fonte: openMatch, matchHighlightsHTML, matchBalanceHTML, gazSectionHTML in legacy/index.html (stato "bloccato").
// Le modifiche (voti, gol, risultato, importazione WhatsApp, Gazzetta) arrivano con l'accesso admin, passo 3.7.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { readUseForm } from '../../app/settings';
import { gazzettaUrl, type LeagueData } from '../../data/queries';
import { formatDate } from '../../domain/format';
import { matchBalance, matchHighlights, rateColors, type MatchBalance } from '../../domain/matches';
import { normalizeTeam } from '../../domain/stats';
import type { Match, Rating } from '../../domain/types';
import { waHTML } from '../../domain/whatsapp';
import { MatchButtons, type MatchActions } from './parts';

const LABEL = { fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' as const, letterSpacing: '.5px' };

// ── highlights ─────────────────────────────────────────────────────────────
function Highlights({ data, m }: { data: LeagueData; m: Match }) {
  const h = matchHighlights(data.dataset, m);
  if (!h.mvp && !h.topScorer && h.avgA == null) return null; // ancora nessuna pagella
  const short = (n: string) => (n && n.length > 12 ? n.slice(0, 11) + '…' : n);
  const cell = (icon: string, label: string, content: ReactNode, col?: string) => (
    <div key={label} style={{ flex: 1, minWidth: 0, background: 'rgba(128,128,128,0.08)', borderRadius: 'var(--radius-sm)', padding: '8px 9px' }}>
      <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 2 }}>{icon} {label}</div>
      <div style={{ fontSize: 12, fontWeight: 800, color: col || 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{content}</div>
    </div>
  );
  const line1: ReactNode[] = [];
  if (h.mvp) line1.push(cell('⭐', 'MVP', `${short(h.mvp.name)} · ${h.mvp.v.toFixed(1)}`, 'var(--green)'));
  if (h.worst && !(h.mvp && h.worst.name === h.mvp.name)) line1.push(cell('🥴', 'Peggiore', `${short(h.worst.name)} · ${h.worst.v.toFixed(1)}`, 'var(--red)'));
  const line2: ReactNode[] = [cell('⚽', 'Capocannoniere', h.topScorer ? `${short(h.topScorer.name)} (${h.topScorer.g})` : '—', h.topScorer ? 'var(--green)' : 'var(--text3)')];
  if (h.avgA != null || h.avgB != null) {
    line2.push(
      cell('📊', 'Media voto', (
        <>
          <span style={{ color: 'var(--blue)' }}>{h.avgA != null ? h.avgA.toFixed(1) : '—'}</span> · <span style={{ color: 'var(--teamb)' }}>{h.avgB != null ? h.avgB.toFixed(1) : '—'}</span>
        </>
      )),
    );
  }
  return (
    <div style={{ margin: '12px 0 4px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>Highlights</div>
      {line1.length ? <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>{line1}</div> : null}
      <div style={{ display: 'flex', gap: 6 }}>{line2}</div>
    </div>
  );
}

// ── equilibrio squadre ─────────────────────────────────────────────────────
function Pill({ p }: { p: { level: 'ok' | 'warn' | 'bad'; text: string; sub: string } }) {
  return (
    <span className={`pill-${p.level}`}>
      {p.level === 'ok' ? '⚖️' : '⚠'} {p.text}
      {p.sub ? <>{' '}<span className="pill-sub">· {p.sub}</span></> : null}
    </span>
  );
}

export function BalanceBody({ b }: { b: MatchBalance }) {
  if (b.kind === 'unavailable') return <div className="mb-note">Squadre non disponibili: i giocatori non sono più in rosa.</div>;
  const { c, saved, rankTxt, verdict, stats, missing } = b;
  return (
    <>
      <div className="mb-sec">
        <div className="mb-title">⚖️ Squilibrio in gol</div>
        {saved != null && b.pills.saved ? (
          <>
            <div className="mb-line"><span>Alla creazione</span><Pill p={b.pills.saved} /></div>
            {rankTxt ? <div className="mb-note" style={{ textAlign: 'right' }}>{rankTxt}</div> : null}
          </>
        ) : (
          <div className="mb-note">Previsione non salvata: la partita è stata creata prima di questa funzione.</div>
        )}
        <div className="mb-line"><span>Con i valori di oggi</span><Pill p={b.pills.now} /></div>
        {verdict ? (
          <>
            <div className="mb-line"><span>Risultato</span><b>{verdict.result}</b></div>
            <div className="mb-verdict">{verdict.how} · errore della previsione {verdict.err} gol</div>
          </>
        ) : null}
      </div>
      <div className="mb-sec">
        <div className="mb-title">📊 Confronto statistiche</div>
        <div className="mb-avgs">
          <span className="mp-bl media-pill">🔵 Media {c.sA.toFixed(1)}</span>
          <span className="mb-dist">{b.distribLabel}</span>
          <span className="mp-bi media-pill">⚪ Media {c.sB.toFixed(1)}</span>
        </div>
        {stats.map((r) => (
          <div className="cmp-row" key={r.label}>
            <span className="cmp-v bl" style={{ fontWeight: r.a > r.b ? 800 : 500 }}>{r.a.toFixed(1)}</span>
            <div className="cmp-bar">
              <div className="cf-bl" style={{ flex: r.a }} />
              <span className="cmp-lbl">{r.label}</span>
              <div className="cf-bi" style={{ flex: r.b }} />
            </div>
            <span className="cmp-v bi" style={{ fontWeight: r.b > r.a ? 800 : 500 }}>{r.b.toFixed(1)}</span>
          </div>
        ))}
        <div className="mb-note">
          Calcolato con statistiche e pagelle di oggi
          {missing ? ` · ${missing} ${missing === 1 ? 'giocatore non più' : 'giocatori non più'} in rosa esclus${missing === 1 ? 'o' : 'i'}` : ''}.
        </div>
      </div>
    </>
  );
}

// ── pagelle di un giocatore ────────────────────────────────────────────────
function PgtView({ tit, desc }: { tit: string; desc: string }) {
  const [open, setOpen] = useState(false);
  if (!tit && !desc) return null;
  return (
    <div className={`pgt-view${open ? ' open' : ''}`} onClick={() => setOpen((o) => !o)}>
      {tit ? <div className="pgt-title">«{tit}»</div> : null}
      {desc ? <div className="pgt-desc" dangerouslySetInnerHTML={{ __html: waHTML(desc) }} /> : null}
    </div>
  );
}

/** Contatore (solo lettura): emoji sopra, valore sotto. */
function Counter({ emoji, title, val, max }: { emoji: string; title: string; val: string | number; max: number }) {
  return (
    <div className="mcnt" title={title}>
      <span className="mcnt-lbl">{emoji}</span>
      <div className="goal-stepper">
        <input type="number" min={0} max={max} step={1} placeholder="0" value={val} inputMode="numeric" disabled readOnly />
      </div>
    </div>
  );
}

function TeamPanel({ title, team, ratings, blue }: { title: string; team: Array<{ id: string | null; name: string }>; ratings: Rating[]; blue: boolean }) {
  const getRating = (pl: { id: string | null; name: string }) =>
    ratings.find((r) => (r.playerId && pl.id && r.playerId === pl.id) || r.player === pl.name);
  return (
    <div style={{ background: blue ? 'var(--blue-light)' : 'var(--teamb-light)', borderRadius: 'var(--radius-sm)', padding: 10, flex: 1 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: blue ? 'var(--blue)' : 'var(--teamb)', marginBottom: 8 }}>{title}</div>
      {team.map((pl, i) => {
        const r = getRating(pl);
        const val = r && r.rating != null ? String(r.rating) : '';
        const or = (v: unknown): string | number => (v ? (v as number | string) : '');
        const tit = r && r.titolo ? String(r.titolo) : '';
        const desc = r && r.notes ? String(r.notes) : '';
        return (
          <div key={`${pl.name}-${i}`} style={{ padding: '7px 0', borderBottom: '1px solid rgba(128,128,128,0.12)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 700 }}>VOTO</span>
              <div className="rate-stepper">
                <input type="number" min={1} max={10} step={0.5} placeholder="—" value={val} inputMode="decimal" disabled readOnly style={rateColors(val)} />
              </div>
            </div>
            <div className="mcnt-row">
              <Counter emoji="⚽" title="Gol" val={or(r?.goals)} max={20} />
              <Counter emoji="🅰️" title="Assist" val={or(r?.assist)} max={20} />
              <Counter emoji="🙃" title="Autogol" val={or(r?.autogol)} max={20} />
              <Counter emoji="❌" title="Rigori sbagliati" val={or(r?.rigoriSbagliati)} max={10} />
              <Counter emoji="🚀" title="Meta — tiri alle stelle" val={or(r?.meta)} max={50} />
            </div>
            <PgtView tit={tit} desc={desc} />
          </div>
        );
      })}
    </div>
  );
}

// ── la scheda ──────────────────────────────────────────────────────────────
export function MatchCard({ data, matchId, onClose, act }: { data: LeagueData; matchId: string; onClose: () => void; act: MatchActions }) {
  const m = data.dataset.matches.find((x) => x.id === matchId);
  const [balanceOpen, setBalanceOpen] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  const balance = useMemo(
    () => (balanceOpen && m ? matchBalance(data.dataset, data.weights, m, readUseForm()) : null),
    [balanceOpen, data, m],
  );
  if (!m) return null;
  const ratings = data.dataset.ratings.filter((r) => r.matchId === matchId);
  const g = data.gazzette[m.id];
  const scoreA = m.scoreA !== '' && m.scoreA != null ? String(m.scoreA) : '';
  const scoreB = m.scoreB !== '' && m.scoreB != null ? String(m.scoreB) : '';
  return (
    <div
      id="match-modal"
      style={{ display: 'block', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500, padding: 14, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
    >
      <div style={{ maxWidth: 600, margin: '0 auto', background: 'var(--gray)', borderRadius: 'var(--radius)', padding: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, minHeight: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }} id="match-modal-title">📅 {formatDate(m.date)}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 22, padding: 4, lineHeight: 1 }}>✕</button>
        </div>
        <div id="match-modal-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
            <div id="mbar-share" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}><MatchButtons data={data} m={m} act={act} /></div>
          </div>
          <div id="match-fields" style={{ opacity: 0.92 }}>
            <div style={{ ...LABEL, marginBottom: 6 }}>Descrizione</div>
            <input
              type="text" id="edit-notes" value={String(m.notes ?? '')} placeholder="es. partita serale al Sole" disabled readOnly
              style={{ width: '100%', padding: '9px 11px', border: '1.5px solid var(--gray3)', borderRadius: 8, background: 'var(--gray)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box', marginBottom: 8 }}
            />
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.5px', textAlign: 'center', marginTop: 8 }}>Risultato</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, margin: '10px 0 4px' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)' }}>🔵 Blu</span>
              <div className="score-stepper"><input type="number" min={0} max={99} id="sc-a" value={scoreA} placeholder="0" inputMode="numeric" disabled readOnly /></div>
              <span style={{ fontSize: 18, color: 'var(--text3)', fontWeight: 300 }}>-</span>
              <div className="score-stepper"><input type="number" min={0} max={99} id="sc-b" value={scoreB} placeholder="0" inputMode="numeric" disabled readOnly /></div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--teamb)' }}>⚪ Bianchi</span>
            </div>
            <Highlights data={data} m={m} />
            <div className="gaz-sec" id="gaz-sec">
              {g ? (
                <>
                  <div className="gaz-h">📰 La Gazzetta</div>
                  <img className="gaz-thumb" src={gazzettaUrl(g)} alt="La Gazzetta" loading="lazy" onClick={() => act.openGazzetta(m.id)} />
                </>
              ) : null}
            </div>
            <button type="button" className="btn btn-secondary btn-full eq-toggle" id="match-balance-btn" onClick={() => setBalanceOpen((o) => !o)}>
              ⚖️ Equilibrio squadre {balanceOpen ? '▴' : '▾'}
            </button>
            <div id="match-balance" style={{ display: balanceOpen ? 'block' : 'none' }}>{balance ? <BalanceBody b={balance} /> : null}</div>
            <div style={{ ...LABEL, margin: '14px 0 8px' }}>Pagelle (1–10)</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <TeamPanel title="🔵 Blu" team={normalizeTeam(m.teamA)} ratings={ratings} blue />
              <TeamPanel title="⚪ Bianchi" team={normalizeTeam(m.teamB)} ratings={ratings} blue={false} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
