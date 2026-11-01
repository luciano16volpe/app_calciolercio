// Scheda partita (in lettura; con il ✏️ per chi ha il permesso diventa modificabile): pulsanti, risultato, highlights, Gazzetta, equilibrio squadre, pagelle di ogni giocatore.
// Fonte: openMatch, matchHighlightsHTML, matchBalanceHTML, gazSectionHTML in legacy/index.html (stato "bloccato").
// Modifica di voti, gol, risultato e pagelle: passo 3.7b. Importazione WhatsApp e Gazzetta: 3.7c e 3.7e.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { releaseKeyboard, repairViewport, useConfirm } from '../../app/Dialogs';
import { readUseForm } from '../../app/settings';
import { useToast } from '../../app/Toast';
import { compressGazzetta, makeGazzettaThumb } from '../../canvas/gazzetta';
import { deleteMatch, removeGazzetta, saveMatchRatings, saveMatchTexts, setGazzetta, updateMatchHeader } from '../../data/mutations';
import { gazzettaUrl, LEAGUE_QUERY_KEY, type LeagueData } from '../../data/queries';
import { planSave, stepCount, stepRating, stepScore, type PlayerFields } from '../../domain/matchEdit';
import { formatDate } from '../../domain/format';
import { matchBalance, matchHighlights, rateColors, type MatchBalance } from '../../domain/matches';
import { clampRating, normalizeTeam } from '../../domain/stats';
import type { Match, Rating } from '../../domain/types';
import { waHTML } from '../../domain/whatsapp';
import { MatchButtons, type MatchActions } from './parts';
import { WhatsAppImport } from './WhatsAppImport';

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

/** Cosa si può fare sui campi di un giocatore quando la scheda è in modifica. */
export interface FieldEditor {
  get: (key: string) => PlayerFields;
  set: (key: string, patch: Partial<PlayerFields>) => void;
  openPagella: (key: string, name: string) => void;
  /** modalità «solo testo» (redazione): si cambiano solo titoli e descrizioni, voti e numeri restano in sola lettura */
  textOnly?: boolean;
}

type CountKey = 'goals' | 'assist' | 'autogol' | 'rigori' | 'meta';

/** Contatore: emoji sopra, valore sotto; in modifica con i pulsanti − e +. `warn` = ha un valore ma manca il voto. */
function Counter({ emoji, title, val, max, edit, warn }: {
  emoji: string; title: string; val: string | number; max: number; edit?: { onChange: (v: string) => void; onStep: (d: number) => void }; warn?: boolean;
}) {
  return (
    <div className="mcnt" title={title}>
      <span className="mcnt-lbl">{emoji}</span>
      <div className={`goal-stepper${warn ? ' goal-warn' : ''}`}>
        {edit ? <button type="button" onClick={() => edit.onStep(-1)} className="rate-btn rate-btn-minus">−</button> : null}
        <input
          type="number" min={0} max={max} step={1} placeholder="0" value={val} inputMode="numeric"
          disabled={!edit} readOnly={!edit} onChange={edit ? (e) => edit.onChange(e.target.value) : undefined}
        />
        {edit ? <button type="button" onClick={() => edit.onStep(1)} className="rate-btn rate-btn-plus">+</button> : null}
      </div>
    </div>
  );
}

function TeamPanel({ title, team, ratings, blue, side, ed }: {
  title: string; team: Array<{ id: string | null; name: string }>; ratings: Rating[]; blue: boolean; side: 'A' | 'B'; ed?: FieldEditor;
}) {
  const getRating = (pl: { id: string | null; name: string }) =>
    ratings.find((r) => (r.playerId && pl.id && r.playerId === pl.id) || r.player === pl.name);
  return (
    <div style={{ background: blue ? 'var(--blue-light)' : 'var(--teamb-light)', borderRadius: 'var(--radius-sm)', padding: 10, flex: 1 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: blue ? 'var(--blue)' : 'var(--teamb)', marginBottom: 8 }}>{title}</div>
      {team.map((pl, i) => {
        const key = `${side}${i}`;
        const f = ed ? ed.get(key) : null;
        const r = getRating(pl);
        const or = (v: unknown): string | number => (v ? (v as number | string) : '');
        const val = f ? f.rating : r && r.rating != null ? String(r.rating) : '';
        const tit = f ? f.tit : r && r.titolo ? String(r.titolo) : '';
        const desc = f ? f.desc : r && r.notes ? String(r.notes) : '';
        const full = !!ed && !ed.textOnly; // voti e numeri si cambiano solo in modifica completa
        const noVote = !!f && clampRating(f.rating) === null;
        const cnt = (k: CountKey, emoji: string, ttl: string, max: number, ro: unknown, warnable: boolean) => (
          <Counter
            emoji={emoji} title={ttl} max={max} val={f ? f[k] : or(ro)}
            warn={warnable && !!f && noVote && (parseInt(f[k]) || 0) > 0}
            edit={ed && f && full ? { onChange: (v) => ed.set(key, { [k]: v }), onStep: (d) => ed.set(key, { [k]: stepCount(f[k], d, 20) }) } : undefined}
          />
        );
        return (
          <div key={`${pl.name}-${i}`} style={{ padding: '7px 0', borderBottom: '1px solid rgba(128,128,128,0.12)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 700 }}>VOTO</span>
              <div className="rate-stepper">
                {ed && f && full ? <button type="button" onClick={() => ed.set(key, { rating: stepRating(f.rating, -1) })} className="rate-btn rate-btn-minus">−</button> : null}
                <input
                  type="number" min={1} max={10} step={0.5} placeholder="—" value={val} inputMode="decimal"
                  disabled={!full} readOnly={!full} style={rateColors(val)} onChange={full ? (e) => ed.set(key, { rating: e.target.value }) : undefined}
                />
                {ed && f && full ? <button type="button" onClick={() => ed.set(key, { rating: stepRating(f.rating, 1) })} className="rate-btn rate-btn-plus">+</button> : null}
              </div>
            </div>
            <div className="mcnt-row">
              {cnt('goals', '⚽', 'Gol', 20, r?.goals, true)}
              {cnt('assist', '🅰️', 'Assist', 20, r?.assist, true)}
              {cnt('autogol', '🙃', 'Autogol', 20, r?.autogol, true)}
              {cnt('rigori', '❌', 'Rigori sbagliati', 10, r?.rigoriSbagliati, true)}
              {cnt('meta', '🚀', 'Meta — tiri alle stelle', 50, r?.meta, false)}
            </div>
            <PgtView tit={tit} desc={desc} />
            {ed ? (
              <button type="button" className="rate-btn pgt-add" onClick={() => ed.openPagella(key, pl.name)}>
                {tit || desc ? '✏️ Modifica pagella' : '＋ Pagella'}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Finestra "📝 Pagella di …": titolo e descrizione della prestazione. */
function PagellaDialog({ name, tit, desc, onCancel, onDone }: { name: string; tit: string; desc: string; onCancel: () => void; onDone: (tit: string, desc: string) => void }) {
  const [t, setT] = useState(tit);
  const [d, setD] = useState(desc);
  return (
    <div id="pgt-dialog" style={{ display: 'flex' }}>
      <div className="pgt-box">
        <div className="pgt-h">📝 Pagella di <b>{name}</b></div>
        <label htmlFor="pgt-d-tit">Titolo</label>
        <input type="text" id="pgt-d-tit" maxLength={60} placeholder="es. Il Muro di Berlino" value={t} onChange={(e) => setT(e.target.value)} />
        <label htmlFor="pgt-d-desc">Descrizione della prestazione</label>
        <textarea id="pgt-d-desc" maxLength={2000} rows={6} placeholder="Scrivi qui la pagella…" value={d} onChange={(e) => setD(e.target.value)} />
        <div className="pgt-count"><span id="pgt-d-n">{d.length}</span>/2000</div>
        <div className="pgt-btns">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Annulla</button>
          <button type="button" className="btn btn-primary" onClick={() => onDone(t.trim().slice(0, 60), d.trim().slice(0, 2000))}>Fatto</button>
        </div>
      </div>
    </div>
  );
}

/** Cosa c'è scritto nella scheda mentre la si modifica. */
interface Draft {
  fields: Record<string, PlayerFields>;
  scA: string;
  scB: string;
  notes: string;
  /** titolo e descrizione com'erano all'apertura: se non li tocchi, salvando non vengono riscritti (così non cancelli quelli appena scritti dalla redazione) */
  base: Record<string, { tit: string; desc: string }>;
}

function startDraft(m: Match, ratings: Rating[]): Draft {
  const fields: Record<string, PlayerFields> = {};
  const str = (v: unknown) => (v ? String(v) : '');
  (['A', 'B'] as const).forEach((side) =>
    normalizeTeam(side === 'A' ? m.teamA : m.teamB).forEach((pl, i) => {
      const r = ratings.find((x) => (x.playerId && pl.id && x.playerId === pl.id) || x.player === pl.name);
      fields[`${side}${i}`] = {
        id: pl.id, name: pl.name, rating: r && r.rating != null ? String(r.rating) : '', goals: str(r?.goals), assist: str(r?.assist),
        autogol: str(r?.autogol), rigori: str(r?.rigoriSbagliati), meta: str(r?.meta), tit: r && r.titolo ? String(r.titolo) : '', desc: r && r.notes ? String(r.notes) : '',
      };
    }),
  );
  return {
    fields,
    base: Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, { tit: f.tit, desc: f.desc }])),
    scA: m.scoreA !== '' && m.scoreA != null ? String(m.scoreA) : '',
    scB: m.scoreB !== '' && m.scoreB != null ? String(m.scoreB) : '',
    notes: String(m.notes ?? ''),
  };
}

// ── la scheda ──────────────────────────────────────────────────────────────
/** `canEdit` = amministratore (modifica tutto); `canEditText` = redazione (solo titoli e descrizioni delle pagelle, e la Gazzetta). */
export function MatchCard({ data, matchId, onClose, act, canEdit = false, canEditText = false, startText = false }: { data: LeagueData; matchId: string; onClose: () => void; act: MatchActions; canEdit?: boolean; canEditText?: boolean; startText?: boolean }) {
  const m = data.dataset.matches.find((x) => x.id === matchId);
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [textOnly, setTextOnly] = useState(false);
  const [pagella, setPagella] = useState<{ key: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const gazInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !pagella && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose, pagella]);
  // dal menu della redazione la scheda si apre già pronta per scrivere le pagelle
  const started = useRef(false);
  useEffect(() => {
    if (!startText || !canEditText || started.current) return;
    const mm = data.dataset.matches.find((x) => x.id === matchId);
    if (!mm) return;
    started.current = true;
    setTextOnly(true);
    setDraft(startDraft(mm, data.dataset.ratings.filter((r) => r.matchId === matchId)));
  }, [startText, canEditText, data, matchId]);
  const balance = useMemo(
    () => (balanceOpen && m ? matchBalance(data.dataset, data.weights, m, readUseForm()) : null),
    [balanceOpen, data, m],
  );
  if (!m) return null;
  const ratings = data.dataset.ratings.filter((r) => r.matchId === matchId);
  const g = data.gazzette[m.id];
  const scoreA = m.scoreA !== '' && m.scoreA != null ? String(m.scoreA) : '';
  const scoreB = m.scoreB !== '' && m.scoreB != null ? String(m.scoreB) : '';
  const editing = draft !== null;
  const full = editing && !textOnly; // modifica completa (amministratore)
  const teamA = normalizeTeam(m.teamA);
  const teamB = normalizeTeam(m.teamB);
  const upd = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const ed: FieldEditor | undefined = draft
    ? {
        get: (k) => draft.fields[k] as PlayerFields,
        set: (k, patch) => setDraft((d) => (d ? { ...d, fields: { ...d.fields, [k]: { ...(d.fields[k] as PlayerFields), ...patch } } } : d)),
        openPagella: (key, name) => setPagella({ key, name }),
        textOnly,
      }
    : undefined;

  const saveTexts = async () => {
    if (!draft) return;
    const changed = Object.values(draft.fields).flatMap((f) => {
      if (!f.id) return [];
      const r = ratings.find((x) => x.playerId === f.id);
      const oldTit = r && r.titolo ? String(r.titolo) : '';
      const oldDesc = r && r.notes ? String(r.notes) : '';
      return f.tit !== oldTit || f.desc !== oldDesc ? [{ playerId: f.id, titolo: f.tit, descrizione: f.desc }] : [];
    });
    if (!changed.length) {
      toast('Nessuna modifica da salvare');
      return;
    }
    setBusy(true);
    try {
      toast('⏳ Salvataggio...');
      await saveMatchTexts(matchId, changed);
      releaseKeyboard();
      await qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY });
      toast(`Salvati titoli e descrizioni: ${changed.length}`);
      repairViewport();
      onClose();
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!draft) return;
    if (textOnly) return saveTexts();
    const side = (s: 'A' | 'B', n: number) => Array.from({ length: n }, (_, i) => draft.fields[`${s}${i}`] as PlayerFields);
    const plan = planSave(side('A', teamA.length), side('B', teamB.length), draft.scA, draft.scB);
    if (plan.missingRating.length) {
      toast(`⚠️ Metti il voto a: ${plan.missingRating.join(', ')} (ha gol, assist, autogol, rigori o pagella)`);
      return;
    }
    if (plan.overAssist.length) {
      const go = await confirm({
        icon: '🅰️', title: 'Assist più dei gol?', lines: [...plan.overAssist, '', 'Controlla i dati inseriti. Vuoi salvare comunque?'], okLabel: 'Salva comunque', cancelLabel: 'Correggi',
      });
      if (!go) return;
    }
    const notes = draft.notes.trim();
    const headerChanged = plan.scoreA !== (m.scoreA ?? '') || plan.scoreB !== (m.scoreB ?? '') || notes !== String(m.notes ?? '');
    setBusy(true);
    try {
      toast('⏳ Salvataggio...');
      const untouched = new Set(Object.entries(draft.fields).filter(([k, f]) => f.id && f.tit === draft.base[k]?.tit && f.desc === draft.base[k]?.desc).map(([, f]) => f.id as string));
      await saveMatchRatings(matchId, plan.rows, untouched);
      if (headerChanged) {
        try {
          await updateMatchHeader(matchId, plan.scoreA, plan.scoreB, notes);
        } catch {
          toast('Voti salvati, ma errore su punteggio/note');
        }
      }
      releaseKeyboard();
      await qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY });
      toast(`Salvato: ${plan.rows.length} pagelle`);
      repairViewport();
      onClose();
    } catch (e) {
      toast('Errore: ' + (e as Error).message); // le pagelle non sono state salvate: la scheda resta aperta per riprovare
    } finally {
      setBusy(false);
    }
  };
  const uploadGazzetta = async (file: File) => {
    setBusy(true);
    try {
      toast('⏳ Carico la Gazzetta…');
      const [full, thumb] = await Promise.all([compressGazzetta(file), makeGazzettaThumb(file)]);
      await setGazzetta(data.league.id, matchId, full, thumb, g ?? null);
      await qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY });
      toast('📰 Gazzetta salvata');
    } catch (e) {
      toast('❌ Caricamento non riuscito: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const dropGazzetta = async () => {
    if (!g) return;
    const ok = await confirm({ icon: '📰', title: 'Rimuovere la Gazzetta?', lines: ["L'immagine viene eliminata."], okLabel: 'Rimuovi', danger: true });
    if (!ok) return;
    try {
      await removeGazzetta(matchId, g);
      await qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY });
      toast('🗑 Gazzetta rimossa');
    } catch (e) {
      toast('❌ Non riuscito: ' + (e as Error).message);
    }
  };
  const remove = async () => {
    const ok = await confirm({
      icon: '🗑️', title: 'Eliminare la partita?', lines: ["Verranno eliminate anche tutte le pagelle e i gol di questa partita. L'operazione non è reversibile."], okLabel: 'Elimina', danger: true,
    });
    if (!ok) return;
    try {
      await deleteMatch(matchId);
      await qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY });
      toast('Partita eliminata');
      onClose();
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    }
  };

  const stepper = (id: 'sc-a' | 'sc-b', val: string, field: 'scA' | 'scB') => (
    <div className="score-stepper">
      {full ? <button type="button" onClick={() => upd({ [field]: stepScore(val, -1) })} className="rate-btn rate-btn-minus">−</button> : null}
      <input type="number" min={0} max={99} id={id} value={val} placeholder="0" inputMode="numeric" disabled={!full} readOnly={!full} onChange={full ? (e) => upd({ [field]: e.target.value }) : undefined} />
      {full ? <button type="button" onClick={() => upd({ [field]: stepScore(val, 1) })} className="rate-btn rate-btn-plus">+</button> : null}
    </div>
  );

  return (
    <div
      id="match-modal"
      style={{ display: 'block', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500, padding: 14, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
    >
      <div style={{ maxWidth: 600, margin: '0 auto', background: 'var(--gray)', borderRadius: 'var(--radius)', padding: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, minHeight: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }} id="match-modal-title">📅 {formatDate(m.date)}</div>
          <button onClick={() => { releaseKeyboard(); onClose(); repairViewport(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 22, padding: 4, lineHeight: 1 }}>✕</button>
        </div>
        <div id="match-modal-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
            <div id="mbar-share" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}><MatchButtons data={data} m={m} act={act} /></div>
            {canEdit && !editing ? (
              <button
                id="edit-toggle-btn" className="btn btn-secondary btn-sm mbar-btn" onClick={() => setDraft(startDraft(m, ratings))} title="Modifica partita" aria-label="Modifica partita"
                style={{ border: '2px solid var(--green)', color: 'var(--green)', marginLeft: 'auto', fontSize: 15, padding: '6px 9px' }}
              >
                ✏️
              </button>
            ) : canEditText && !editing ? (
              <button
                id="edit-text-btn" className="btn btn-secondary btn-sm mbar-btn" onClick={() => { setTextOnly(true); setDraft(startDraft(m, ratings)); }} title="Scrivi le pagelle" aria-label="Scrivi titoli e descrizioni"
                style={{ border: '2px solid var(--green)', color: 'var(--green)', marginLeft: 'auto', fontSize: 13, padding: '6px 9px' }}
              >
                📝 Scrivi le pagelle
              </button>
            ) : null}
          </div>
          <div id="match-fields" style={{ opacity: editing ? 1 : 0.92 }}>
            <div style={{ ...LABEL, marginBottom: 6 }}>Descrizione</div>
            <input
              type="text" id="edit-notes" value={draft ? draft.notes : String(m.notes ?? '')} placeholder="es. partita serale al Sole" disabled={!full} readOnly={!full}
              onChange={full ? (e) => upd({ notes: e.target.value }) : undefined}
              style={{ width: '100%', padding: '9px 11px', border: '1.5px solid var(--gray3)', borderRadius: 8, background: 'var(--gray)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box', marginBottom: 8 }}
            />
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.5px', textAlign: 'center', marginTop: 8 }}>Risultato</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, margin: '10px 0 4px' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)' }}>🔵 Blu</span>
              {stepper('sc-a', draft ? draft.scA : scoreA, 'scA')}
              <span style={{ fontSize: 18, color: 'var(--text3)', fontWeight: 300 }}>-</span>
              {stepper('sc-b', draft ? draft.scB : scoreB, 'scB')}
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
              {editing ? (
                <div className="gaz-edit" style={{ display: 'flex' }}>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => gazInput.current?.click()}>
                    {g ? '🔄 Sostituisci la Gazzetta' : '📰 Carica la Gazzetta'}
                  </button>
                  {g ? <button type="button" className="btn btn-secondary btn-sm" style={{ color: 'var(--red)' }} disabled={busy} onClick={() => void dropGazzetta()}>🗑 Rimuovi</button> : null}
                  <input ref={gazInput} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void uploadGazzetta(f); }} />
                </div>
              ) : null}
            </div>
            <button type="button" className="btn btn-secondary btn-full eq-toggle" id="match-balance-btn" onClick={() => setBalanceOpen((o) => !o)}>
              ⚖️ Equilibrio squadre {balanceOpen ? '▴' : '▾'}
            </button>
            <div id="match-balance" style={{ display: balanceOpen ? 'block' : 'none' }}>{balance ? <BalanceBody b={balance} /> : null}</div>
            <div style={{ ...LABEL, margin: '14px 0 8px' }}>Pagelle (1–10)</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <TeamPanel title="🔵 Blu" team={teamA} ratings={ratings} blue side="A" ed={ed} />
              <TeamPanel title="⚪ Bianchi" team={teamB} ratings={ratings} blue={false} side="B" ed={ed} />
            </div>
            {draft ? (
              <WhatsAppImport
                data={data} m={m}
                hasRating={(k) => clampRating((draft.fields[k] as PlayerFields | undefined)?.rating) !== null}
                onAssign={(k, tit, desc) => ed?.set(k, { tit, desc })}
              />
            ) : null}
            {editing ? (
              <div id="match-actions" style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={() => void save()}>{textOnly ? '💾 Salva pagelle' : '💾 Salva partita'}</button>
                {textOnly ? null : <button className="btn btn-danger" disabled={busy} onClick={() => void remove()} aria-label="Elimina la partita">🗑️</button>}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {pagella && draft ? (
        <PagellaDialog
          key={pagella.key}
          name={pagella.name}
          tit={(draft.fields[pagella.key] as PlayerFields).tit}
          desc={(draft.fields[pagella.key] as PlayerFields).desc}
          onCancel={() => { releaseKeyboard(); setPagella(null); repairViewport(); }}
          onDone={(t, d) => {
            ed?.set(pagella.key, { tit: t, desc: d });
            releaseKeyboard();
            setPagella(null);
            repairViewport();
            if (t || d) toast('📝 Pagella pronta: ricordati di salvare 💾');
          }}
        />
      ) : null}
    </div>
  );
}
