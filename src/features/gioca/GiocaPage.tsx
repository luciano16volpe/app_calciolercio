// Gioca: formato della partita, convocati, sorteggio delle squadre bilanciate, campo, scambi a mano.
// Fonte: pagina "partita" di legacy/index.html (setBaseFormat, buildConvList, generateTeams, renderResult, dragStart…).
// "Crea partita" arriva con il passo 3.7.
import { Fragment, useMemo, useRef, useState } from 'react';
import { useImageTools } from '../../app/ImageViewer';
import { AdBanner } from '../../app/AdBanner';
import { formOn, modulesOf } from '../../data/gameSettings';
import { comboSheet, combosFormations } from '../../canvas/lazy';
import { NewMatchDialog } from './NewMatchDialog';
import { useToast } from '../../app/Toast';
import { photoUrl, type LeagueData } from '../../data/queries';
import { balanceScores, generateTeams, type Combo } from '../../domain/balancing';
import { pagInfo, playerRatingAvg } from '../../domain/form';
import { formatDate } from '../../domain/format';
import { PlayerAvatar } from '../player/PlayerAvatar';
import { balancePrecision, comboSummary, swapPlayers, teamPlayers, type TeamPlayer } from '../../domain/gioca';
import { calcOvr, rosaOrder } from '../../domain/ovr';
import { pitchSvg } from '../../domain/pitch';
import { playerSeason, seasonStats } from '../../domain/stats';
import { statAverages } from '../../domain/matches';

// ── formato salvato sul telefono ───────────────────────────────────────────
interface Format { sizeA: number; sizeB: number; asym: boolean }
const FORMAT_KEY = 'calciolercio-format';
function readFormat(): Format {
  try {
    const f = JSON.parse(localStorage.getItem(FORMAT_KEY) || 'null') as Partial<Format> | null;
    if (f && Number.isInteger(f.sizeA) && Number.isInteger(f.sizeB)) return { sizeA: f.sizeA as number, sizeB: f.sizeB as number, asym: !!f.asym };
  } catch {
    /* memoria non leggibile: formato predefinito */
  }
  return { sizeA: 5, sizeB: 5, asym: false };
}
function saveFormat(f: Format) {
  try {
    localStorage.setItem(FORMAT_KEY, JSON.stringify(f));
  } catch {
    /* si perde solo il ricordo del formato */
  }
}

/** Il nome può andare a capo dove c'è una maiuscola dentro (FabioFicarelli → Fabio|Ficarelli). */
function Wrap({ name }: { name: string }) {
  const parts = name.split(/(?<=[a-zà-ÿ])(?=[A-ZÀ-Þ])/);
  return <>{parts.map((p, i) => <Fragment key={i}>{i ? <wbr /> : null}{p}</Fragment>)}</>;
}

export interface Result { combos: Combo[]; genBest: number | null; idx: number }

// ── trascinare un giocatore sull'altra squadra ─────────────────────────────
function useDragSwap(onSwap: (a: number, b: number) => void) {
  const state = useRef<null | {
    pidx: number; team: string; src: HTMLElement; ghost: HTMLElement | null; target: HTMLElement | null; moved: boolean; x: number; y: number;
  }>(null);
  return (e: React.PointerEvent<HTMLElement>, pidx: number, team: string) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const src = e.currentTarget;
    const s = { pidx, team, src, ghost: null as HTMLElement | null, target: null as HTMLElement | null, moved: false, x: e.clientX, y: e.clientY };
    state.current = s;
    const move = (ev: PointerEvent) => {
      if (!s.moved && Math.hypot(ev.clientX - s.x, ev.clientY - s.y) < 6) return; // un tocco, non un trascinamento
      if (!s.moved) {
        s.moved = true;
        src.classList.add('pchip-dragging');
        const g = src.cloneNode(true) as HTMLElement;
        g.className = 'pchip pchip-ghost';
        g.style.width = src.offsetWidth + 'px';
        document.body.appendChild(g);
        s.ghost = g;
      }
      const g = s.ghost as HTMLElement;
      g.style.left = ev.clientX + 'px';
      g.style.top = ev.clientY + 'px';
      g.style.pointerEvents = 'none';
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const chip = under ? (under.closest('.pchip') as HTMLElement | null) : null;
      if (s.target && s.target !== chip) s.target.classList.remove('pchip-target');
      if (chip && chip.dataset.team && chip.dataset.team !== s.team) {
        chip.classList.add('pchip-target');
        s.target = chip;
      } else s.target = null;
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      src.classList.remove('pchip-dragging');
      s.ghost?.remove();
      const tgt = s.target;
      state.current = null;
      if (tgt) {
        tgt.classList.remove('pchip-target');
        onSwap(s.pidx, parseInt(tgt.dataset.pidx as string));
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };
}

// ── risultato ──────────────────────────────────────────────────────────────
function Chips({ arr, pcls, team, onDown }: { arr: TeamPlayer[]; pcls: string; team: string; onDown: (e: React.PointerEvent<HTMLElement>, idx: number, team: string) => void }) {
  return (
    <>
      {arr.map((p) => (
        <div key={p.idx} className={`pchip ${pcls}`} data-team={team} data-pidx={p.idx} onDragStart={(e) => e.preventDefault()} onPointerDown={(e) => onDown(e, p.idx, team)}>
          <span className="pchip-grip">⠿</span>
          <span className="pchip-name">{p.name}</span>
          <span className="pchip-score">{p.score.toFixed(1)}</span>
        </div>
      ))}
    </>
  );
}

export function PrecisionCard({ data }: { data: LeagueData }) {
  const p = balancePrecision(data.dataset.matches);
  if (!p) return null;
  return (
    <div className="card prec-card">
      <div className="section-header" style={{ margin: '0 0 8px' }}>🎯 Precisione bilanciamento</div>
      <div className="prec-grid">
        <div className="prec-cell"><div className="prec-val" style={{ color: p.marginColor }}>{p.avgMargin.toFixed(1)}</div><div className="prec-lbl">Scarto medio (gol)</div></div>
        <div className="prec-cell"><div className="prec-val">{p.within2}%</div><div className="prec-lbl">Entro 2 gol</div></div>
        <div className="prec-cell"><div className="prec-val">{p.n}</div><div className="prec-lbl">Partite valutate</div></div>
      </div>
      <div className="prec-note" style={{ marginBottom: 8 }}>Equilibrio sulle ultime {p.n} partite con risultato.</div>
      {p.pred ? (
        <>
          <div className="prec-grid">
            <div className="prec-cell"><div className="prec-val">{p.pred.favorite}</div><div className="prec-lbl">Favorito vince</div></div>
            <div className="prec-cell"><div className="prec-val">{p.pred.error}</div><div className="prec-lbl">Errore medio (gol)</div></div>
            <div className="prec-cell"><div className="prec-val">{p.pred.firstPlayed}</div><div className="prec-lbl">1ª proposta giocata</div></div>
          </div>
          <div className="prec-note">
            Previsione salvata su {p.pred.withPred} {p.pred.withPred === 1 ? 'partita' : 'partite'}. "Favorito vince" esclude pareggi e partite previste alla pari.
          </div>
        </>
      ) : (
        <div className="prec-note">La previsione si salva dalle prossime partite create da Gioca: da lì vedrai qui quanto è affidabile.</div>
      )}
    </div>
  );
}

/** I tre pulsanti sotto le squadre dividono la riga in parti uguali; sugli schermi stretti (360 px) il testo va a capo invece di uscire dallo schermo. */
const narrowBtn = { flex: 1, minWidth: 0, padding: '12px 6px', whiteSpace: 'normal', lineHeight: 1.2 } as const;

export function ResultView({ data, res, scores, onChange, onCreate }: { data: LeagueData; res: Result; scores: number[]; onChange: (r: Result) => void; onCreate?: () => void }) {
  const toast = useToast();
  const { showImage, shareCanvas } = useImageTools();
  const { dataset } = data;
  const players = useMemo(() => dataset.players.map((p) => ({ ...p, photo: photoUrl(data.photos[p.id]) })), [dataset, data.photos]);
  const c = res.combos[res.idx] as Combo;
  const pA = teamPlayers(players, scores, c.tA);
  const pB = teamPlayers(players, scores, c.tB);
  const sum = comboSummary(c, res.genBest, res.idx, res.combos.length);
  const svg = pitchSvg(pA, pB, c.modA, c.modB);
  const rows = statAverages(dataset.players, c.tA, c.tB);
  const down = useDragSwap((a, b) => {
    const next = swapPlayers({ players: dataset.players, scores }, c, a, b);
    if (!next) return;
    const combos = res.combos.slice();
    combos[res.idx] = next;
    onChange({ ...res, combos });
  });
  const soon = (msg: string) => () => toast(msg);
  const go = (d: number) => onChange({ ...res, idx: (res.idx + d + res.combos.length) % res.combos.length });
  const qColor = { ok: 'var(--green)', warn: 'var(--amber)', bad: 'var(--red)' }[sum.quality.level];

  return (
    <div id="partita-result">
      <div className="pitch-wrap">
        <div className="pitch-title-bar">
          <span className="pitch-title">Campo</span>
          <div className="pitch-legend">
            <span><div className="dot" style={{ background: '#3a8fef' }} />Blu</span>
            <span><div className="dot" style={{ background: '#f2f2f2', border: '1px solid #b0b6c0' }} />Bianchi</span>
          </div>
        </div>
        <svg id="pitch-svg" className="pitch" xmlns="http://www.w3.org/2000/svg" viewBox={svg.viewBox} dangerouslySetInnerHTML={{ __html: svg.inner }} />
      </div>

      <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginBottom: 8 }}>✋ Trascina un giocatore sull'altra squadra per scambiarlo</div>
      <div className="team-row">
        <div className="team-card team-blue">
          <div className="team-hd"><span className="team-nm bl">🔵 Blu</span><span className="media-pill mp-bl" id="avg-a">{sum.avgA}</span></div>
          <div style={{ fontSize: 11, color: 'var(--blue)', fontWeight: 700, opacity: 0.7, marginBottom: 7 }} id="mod-label-a">{sum.modLabelA}</div>
          <div id="chips-a"><Chips arr={pA} pcls="pc-bl" team="A" onDown={down} /></div>
        </div>
        <div className="team-card team-bianchi">
          <div className="team-hd"><span className="team-nm bi">⚪ Bianchi</span><span className="media-pill mp-bi" id="avg-b">{sum.avgB}</span></div>
          <div style={{ fontSize: 11, color: 'var(--teamb)', fontWeight: 700, opacity: 0.7, marginBottom: 7 }} id="mod-label-b">{sum.modLabelB}</div>
          <div id="chips-b"><Chips arr={pB} pcls="pc-bi" team="B" onDown={down} /></div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, margin: '4px 0 14px' }}>
        <button className="btn btn-primary" style={{ ...narrowBtn, background: '#25D366', borderColor: '#25D366' }} onClick={() => showImage('⚽ Formazioni di oggi', combosFormations(data, scores, c), 'formazioni.png', '⚽ Formazioni di oggi')}>📲 Condividi</button>
        <button className="btn btn-secondary" style={narrowBtn} onClick={() => { void comboSheet(data, c).then((s) => shareCanvas(s.canvas, 'foglio_partita_' + s.date + '.png', '📋 Foglio partita del ' + formatDate(s.date))).catch(() => toast('Impossibile preparare il foglio. Riprova.')); }} title="Foglio A4 in bianco e nero da stampare e compilare in campo">🖨️ Foglio</button>
        <button className="btn btn-primary" style={narrowBtn} onClick={onCreate ?? soon("Per creare la partita serve essere amministratore della lega")}>📅 Crea partita</button>
      </div>

      <AdBanner placement="gioca-risultato" />

      <div className="card">
        <div className="section-header" style={{ marginBottom: 10 }}>Confronto statistiche</div>
        <div id="stat-cmp">
          {rows.map((r) => (
            <div className="cmp-row" key={r.label}>
              <span className="cmp-v bl" style={{ fontWeight: r.a > r.b ? 800 : 500 }}>{r.a.toFixed(1)}</span>
              <div className="cmp-bar"><div className="cf-bl" style={{ flex: r.a }} /><span className="cmp-lbl">{r.label}</span><div className="cf-bi" style={{ flex: r.b }} /></div>
              <span className="cmp-v bi" style={{ fontWeight: r.b > r.a ? 800 : 500 }}>{r.b.toFixed(1)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="balance-row" id="bal-row">
        <span className={`pill-${sum.balance.level}`}>
          {sum.balance.level === 'ok' ? '⚖️' : '⚠'} {sum.balance.label} <span className="pill-sub">· diff {sum.balance.diff}</span>
        </span>
        {sum.balance.cost ? <div className="bal-cost">{sum.balance.cost}</div> : null}
      </div>
      <div className="combo-nav">
        <button className="combo-btn" onClick={() => go(-1)}>◀</button>
        <div style={{ textAlign: 'center' }}>
          <div className="combo-idx" id="combo-idx">{sum.idxText}</div>
          <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2, color: qColor }} id="combo-quality">{sum.quality.text}</div>
        </div>
        <button className="combo-btn" onClick={() => go(1)}>▶</button>
      </div>
      <div id="gioca-precision" style={{ marginTop: 12 }}><PrecisionCard data={data} /></div>
    </div>
  );
}

// ── pagina ─────────────────────────────────────────────────────────────────
export function GiocaPage({ data, initialSelected = [], canCreate = false }: { data: LeagueData; initialSelected?: string[]; canCreate?: boolean }) {
  const toast = useToast();
  const { dataset, weights } = data;
  const [fmt, setFmt] = useState<Format>(readFormat);
  const [selected, setSelected] = useState<string[]>(initialSelected); // id dei convocati, nell'ordine in cui sono scelti
  const [res, setRes] = useState<Result | null>(null);
  const [creating, setCreating] = useState(false);
  const [scores, setScores] = useState<number[]>([]);
  const total = fmt.sizeA + fmt.sizeB;
  const order = useMemo(() => rosaOrder(dataset.players, weights), [dataset, weights]);
  const all = useMemo(() => seasonStats(dataset), [dataset]);
  const update = (f: Format) => {
    setFmt(f);
    saveFormat(f);
  };
  const live = selected.filter((id) => dataset.players.some((p) => p.id === id)); // un giocatore tolto dalla rosa non conta più

  const generate = () => {
    if (live.length !== total) {
      toast(`Seleziona esattamente ${total} giocatori (${live.length}/${total})`);
      return;
    }
    const sc = balanceScores(dataset, weights, formOn(data));
    const idx = live.map((id) => dataset.players.findIndex((p) => p.id === id));
    const out = generateTeams({ players: dataset.players, scores: sc, selected: idx, sizeA: fmt.sizeA, sizeB: fmt.sizeB, modules: modulesOf(data) });
    if (!out) return;
    setScores(sc);
    setRes({ combos: out.combos, genBest: out.genBest, idx: 0 });
    window.setTimeout(() => document.getElementById('partita-result')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  };

  const adj = (team: 'A' | 'B', d: number) =>
    update(team === 'A' ? { ...fmt, sizeA: Math.max(1, Math.min(8, fmt.sizeA + d)) } : { ...fmt, sizeB: Math.max(1, Math.min(8, fmt.sizeB + d)) });

  return (
    <>
      <div className="gioca-intro">
        <div className="gioca-intro-title">⚽ Prepara la partita</div>
        <div>Scegli il formato, seleziona i giocatori e genera le squadre.</div>
      </div>
      <div className="card gioca-section">
        <div className="gioca-section-heading"><span className="gioca-step">1</span><div><div className="section-header">Formato partita</div><div className="gioca-section-help">Quanti giocatori per squadra?</div></div></div>
        <div className="format-grid">
          {[5, 6, 7].map((n) => (
            <button key={n} className={`format-btn${fmt.sizeA === n ? ' active' : ''}`} id={`fmt-${n}`} onClick={() => update({ sizeA: n, sizeB: n, asym: false })}>
              {n} vs {n}<span className="format-sub">{n * 2} gioc.</span>
            </button>
          ))}
        </div>
        <div className="asym-row">
          <span className="asym-label">⚖️ Squadre asimmetriche (es. 5 vs 6)</span>
          <label className="asym-toggle">
            <input type="checkbox" id="asym-check" checked={fmt.asym} onChange={(e) => update(e.target.checked ? { ...fmt, asym: true, sizeB: fmt.sizeA + 1 } : { ...fmt, asym: false, sizeB: fmt.sizeA })} />
            <span className="asym-track" />
            <span className="asym-knob" />
          </label>
        </div>
        <div id="asym-controls" style={{ display: fmt.asym ? 'flex' : 'none', gap: 8, alignItems: 'center', justifyContent: 'center', padding: '4px 0 2px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--blue-light)', borderRadius: 'var(--radius-sm)', padding: '4px 10px' }}>
            <span style={{ fontSize: 15 }} title="Blu">🔵</span>
            <button className="adj-btn" onClick={() => adj('A', -1)}>−</button>
            <span id="sz-a" style={{ fontSize: 19, fontWeight: 800, color: 'var(--blue)', minWidth: 24, textAlign: 'center' }}>{fmt.sizeA}</span>
            <button className="adj-btn" onClick={() => adj('A', 1)}>+</button>
          </div>
          <div style={{ fontSize: 14, color: 'var(--text3)', fontWeight: 600 }}>vs</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--teamb-light)', borderRadius: 'var(--radius-sm)', padding: '4px 10px' }}>
            <button className="adj-btn" onClick={() => adj('B', -1)}>−</button>
            <span id="sz-b" style={{ fontSize: 19, fontWeight: 800, color: 'var(--teamb)', minWidth: 24, textAlign: 'center' }}>{fmt.sizeB}</span>
            <button className="adj-btn" onClick={() => adj('B', 1)}>+</button>
            <span style={{ fontSize: 15 }} title="Bianchi">⚪</span>
          </div>
        </div>

      </div>
      <div className="card gioca-section">
        <div className="gioca-section-heading"><span className="gioca-step">2</span><div><div className="section-header">Convocati</div><div className="gioca-section-help">Scegli i giocatori che scenderanno in campo.</div></div></div>
        <div className="btn-row" style={{ marginBottom: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setSelected(order.slice(0, Math.min(total, order.length)).map((i) => (dataset.players[i] as { id: string }).id))}>
            ✓ Seleziona i primi <span id="sfn">{total}</span>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setSelected([])}>✕ Tutti</button>
        </div>
        <div className="conv-grid" id="conv-list">
          {order.map((i) => {
            const p = dataset.players[i]!;
            const sel = live.includes(p.id);
            const pag = pagInfo(playerRatingAvg(playerSeason(dataset, p, all)).avg);
            const photo = photoUrl(data.photos[p.id]);
            return (
              <div key={p.id} className={`conv-item${sel ? ' sel' : ''}`} onClick={() => setSelected(sel ? live.filter((x) => x !== p.id) : [...live, p.id])}>
                <div className="conv-avatar-stack">
                  <span className={`pag-badge ${pag.cls}`} title="Media pagelle">{pag.label}</span>
                  <PlayerAvatar key={`${p.id}:${photo}`} className="conv-avatar" name={p.name} roles={p.roles ?? []} photo={photo} />
                  <span className="ovr-badge">OVR {calcOvr(p.stats, weights).toFixed(1)}</span>
                </div>
                <div className="conv-info">
                  <span className="conv-name"><Wrap name={p.name} /></span>
                  <div className="conv-roles">{(p.roles ?? []).map((r) => <span key={r} className={`rp rp-${r.toLowerCase()}`}>{r}</span>)}</div>
                </div>
                <div className="conv-check">{sel ? '✓' : ''}</div>
              </div>
            );
          })}
        </div>
        <div className="conv-status">Selezionati: <span className={`cnt${live.length === total ? '' : ' warn'}`} id="sel-cnt">{live.length}</span> / <span id="needed-n2">{total}</span> richiesti</div>
      </div>

      <div className="gioca-generate"><div className="gioca-section-heading"><span className="gioca-step">3</span><div><div className="section-header">Squadre</div><div className="gioca-section-help">{live.length === total ? 'Tutto pronto per il sorteggio.' : `Selezionati ${live.length} su ${total} giocatori.`}</div></div></div>
      <button className="btn btn-primary btn-full" style={{ marginBottom: 14 }} onClick={generate}>⚽ Genera squadre bilanciate</button></div>

      {res && res.combos.length ? <ResultView data={data} res={res} scores={scores} onChange={setRes} onCreate={canCreate ? () => setCreating(true) : undefined} /> : null}
      {creating && res && res.combos.length ? <NewMatchDialog data={data} combo={res.combos[res.idx] as Combo} idx={res.idx} onClose={() => setCreating(false)} /> : null}
    </>
  );
}

