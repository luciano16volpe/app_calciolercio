import { PremiumBadge, usePremiumExplain } from '../../app/premium';
import { MatchTextBoundary } from './MatchTextBoundary';
// Scheda partita (in lettura; con il ✏️ per chi ha il permesso diventa modificabile): pulsanti, risultato, highlights, Gazzetta, equilibrio squadre, pagelle di ogni giocatore.
// Modifica di voti, gol, risultato e pagelle: passo 3.7b. Importazione WhatsApp e Gazzetta: 3.7c e 3.7e.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { HourSelect } from '../../app/HourSelect';
import { canPlanMatch } from '../../domain/plannedMatch';
import { PlannedMatchEditor } from './PlannedMatchEditor';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../app/auth';
import { useCommunityVoteState } from '../../data/communityVotes';
import { useFormationPollState } from '../../data/formationPolls';
import { CommunityVoteControls } from './CommunityVote';
import { FormationVoteSummary } from './FormationVoteSummary';
import { releaseKeyboard, repairViewport, useConfirm } from '../../app/Dialogs';
import { formOn } from '../../data/gameSettings';
import { useToast } from '../../app/Toast';
import { compressGazzetta, makeGazzettaThumb } from '../../canvas/gazzetta';
import { deleteMatch, removeGazzetta, saveMatchRatings, saveMatchTexts, setGazzetta, setMatchBetEnabled, setRatingsSkipped } from '../../data/mutations';
import { useAdvancedEnabled } from '../../data/advancedPredictions';
import { LEAGUE_HISTORY_QUERY_KEY, type LeagueData } from '../../data/queries';
import { planSave, stepCount, stepRating, stepScore, type PlayerFields } from '../../domain/matchEdit';
import { formatDate, whenWhere } from '../../domain/format';
import { matchBalance, matchHighlights, needsRatings, rateColors, type MatchBalance } from '../../domain/matches';
import { clampRating, normalizeTeam } from '../../domain/stats';
import type { Match, Rating } from '../../domain/types';
import { waHTML } from '../../domain/whatsapp';
import { GazThumb, MatchButtons, type MatchActions } from './parts';
import { WhatsAppImport } from './WhatsAppImport';
import { PlaceField } from './PlaceField';
import { SheetScan } from './SheetScan';
import { PlaceShare } from './PlaceShare';
import { placeOf } from '../../domain/place';

const LABEL = { fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' as const, letterSpacing: '.5px' };

// ── highlights ─────────────────────────────────────────────────────────────
function Highlights({ data, m, hideRatings = false }: { data: LeagueData; m: Match; hideRatings?: boolean }) {
  const dataset = hideRatings ? {
    ...data.dataset,
    ratings: data.dataset.ratings.map((rating) => rating.matchId === m.id ? { ...rating, rating: null } : rating),
  } : data.dataset;
  const h = matchHighlights(dataset, m);
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
function PgtView({ tit, desc, editorRating }: { tit: string; desc: string; editorRating: string }) {
  const [open, setOpen] = useState(false);
  if (!tit && !desc && !editorRating) return null;
  return (
    <div className={`pgt-view${open ? ' open' : ''}`} onClick={() => setOpen((o) => !o)}>
      {tit ? <div className="pgt-title">«{tit}»</div> : null}
      {editorRating ? <div className="pgt-editor-rating">Voto dell’editore: {editorRating} · goliardico</div> : null}
      {desc ? <div className="pgt-desc" dangerouslySetInnerHTML={{ __html: waHTML(desc) }} /> : null}
    </div>
  );
}

/** Cosa si può fare sui campi di un giocatore quando la scheda è in modifica. */
export interface FieldEditor {
  get: (key: string) => PlayerFields;
  set: (key: string, patch: Partial<PlayerFields>) => void;
  openPagella: (key: string, name: string) => void;
  /** Redazione: titolo, descrizione e voto editoriale; voto ufficiale e statistiche in sola lettura. */
  textOnly?: boolean;
}

type CountKey = 'goals' | 'assist' | 'autogol' | 'rigori' | 'meta';

/** Contatore: emoji sopra, valore sotto; in modifica con i pulsanti − e +. */
function Counter({ emoji, title, val, max, edit }: {
  emoji: string; title: string; val: string | number; max: number; edit?: { onChange: (v: string) => void; onStep: (d: number) => void };
}) {
  return (
    <div className="mcnt" title={title}>
      <span className="mcnt-lbl">{emoji}</span>
      <div className="goal-stepper">
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

function TeamPanel({ title, team, ratings, blue, side, ed, hideRating = false }: {
  title: string; team: Array<{ id: string | null; name: string }>; ratings: Rating[]; blue: boolean; side: 'A' | 'B'; ed?: FieldEditor; hideRating?: boolean;
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
        const val = hideRating ? '' : r && r.rating != null ? String(r.rating) : '';
        const tit = f ? f.tit : r && r.titolo ? String(r.titolo) : '';
        const desc = f ? f.desc : r && r.notes ? String(r.notes) : '';
        const editorRating = f ? f.editorRating ?? '' : r?.editorRating != null ? String(r.editorRating) : '';
        const full = !!ed && !ed.textOnly; // voti e numeri si cambiano solo in modifica completa
        const cnt = (k: CountKey, emoji: string, ttl: string, max: number, ro: unknown) => (
          <Counter
            emoji={emoji} title={ttl} max={max} val={f ? f[k] : or(ro)}
            edit={ed && f && full ? { onChange: (v) => ed.set(key, { [k]: v }), onStep: (d) => ed.set(key, { [k]: stepCount(f[k], d, 20) }) } : undefined}
          />
        );
        return (
          <div key={`${pl.name}-${i}`} style={{ padding: '7px 0', borderBottom: '1px solid rgba(128,128,128,0.12)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl.name}</div>
            {!ed ? <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 700 }}>VOTO VOTANTI</span>
              <div className="rate-stepper">
                <input
                  type="number" min={1} max={10} step={0.5} placeholder="—" value={val} inputMode="decimal"
                  disabled readOnly style={rateColors(val)}
                />
              </div>
            </div> : null}
            {ed && f ? <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 700 }}>VOTO EDITORE</span>
              <div className="rate-stepper">
                <button type="button" onClick={() => ed.set(key, { editorRating: stepRating(editorRating, -1) })} className="rate-btn rate-btn-minus">−</button>
                <input type="number" min={1} max={10} step={0.5} placeholder="—" value={editorRating} inputMode="decimal"
                  style={rateColors(editorRating)} onChange={(e) => ed.set(key, { editorRating: e.target.value })} />
                <button type="button" onClick={() => ed.set(key, { editorRating: stepRating(editorRating, 1) })} className="rate-btn rate-btn-plus">+</button>
              </div>
            </div> : null}
            <div className="mcnt-row">
              {cnt('goals', '⚽', 'Gol', 20, r?.goals)}
              {cnt('assist', '🅰️', 'Assist', 20, r?.assist)}
              {cnt('autogol', '🙃', 'Autogol', 20, r?.autogol)}
              {cnt('rigori', '❌', 'Rigori sbagliati', 10, r?.rigoriSbagliati)}
              {cnt('meta', '🚀', 'Meta — tiri alle stelle', 50, r?.meta)}
            </div>
            <PgtView tit={tit} desc={desc} editorRating={editorRating} />
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
function PagellaDialog({ name, tit, desc, editorRating, editorial, onCancel, onDone }: { name: string; tit: string; desc: string; editorRating: string; editorial: boolean; onCancel: () => void; onDone: (tit: string, desc: string, editorRating: string) => void }) {
  const [t, setT] = useState(tit);
  const [d, setD] = useState(desc);
  const [vote, setVote] = useState(editorRating);
  return (
    <div id="pgt-dialog" style={{ display: 'flex' }}>
      <div className="pgt-box">
        <div className="pgt-h">📝 Pagella di <b>{name}</b></div>
        <label htmlFor="pgt-d-tit">Titolo</label>
        <input type="text" id="pgt-d-tit" maxLength={60} placeholder="es. Il Muro di Berlino" value={t} onChange={(e) => setT(e.target.value)} />
        <label htmlFor="pgt-d-desc">Descrizione della prestazione</label>
        <textarea id="pgt-d-desc" maxLength={2000} rows={6} placeholder="Scrivi qui la pagella…" value={d} onChange={(e) => setD(e.target.value)} />
        {editorial ? <><label htmlFor="pgt-d-editor-rating">Voto dell’editore (goliardico)</label>
          <input type="number" id="pgt-d-editor-rating" min={1} max={10} step={0.5} placeholder="Facoltativo" value={vote} onChange={(e) => setVote(e.target.value)} />
          <small>Il voto ufficiale continua a essere calcolato dal sondaggio.</small></> : null}
        <div className="pgt-count"><span id="pgt-d-n">{d.length}</span>/2000</div>
        <div className="pgt-btns">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Annulla</button>
          <button type="button" className="btn btn-primary" onClick={() => onDone(t.trim().slice(0, 60), d.trim().slice(0, 2000), editorial ? vote : editorRating)}>Fatto</button>
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
  /** ora (hh:mm) e luogo */
  time: string;
  place: string;
  placeLat: number | null;
  placeLng: number | null;
  placeUrl: string | null;
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
        id: pl.id, name: pl.name, rating: r && r.rating != null ? String(r.rating) : '', editorRating: r?.editorRating != null ? String(r.editorRating) : '', goals: str(r?.goals), assist: str(r?.assist),
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
    time: String(m.time ?? ''),
    place: String(m.place ?? ''),
    placeLat: placeOf(m).lat,
    placeLng: placeOf(m).lng,
    placeUrl: placeOf(m).url,
  };
}

// ── la scheda ──────────────────────────────────────────────────────────────
/** `canEdit` = amministratore (modifica tutto); `canEditText` = redazione (solo titoli e descrizioni delle pagelle, e la Gazzetta). */
export function MatchCard(props: Parameters<typeof LoadedMatchCard>[0]) {
  return <MatchTextBoundary data={props.data} matchId={props.matchId} onClose={props.onClose}>{(data) => <LoadedMatchCard {...props} data={data} />}</MatchTextBoundary>;
}
function LoadedMatchCard({ data, matchId, onClose, act, canEdit = false, canEditText = false, canGazzetta = true, startText = false, startEdit = false }: { data: LeagueData; matchId: string; onClose: () => void; act: MatchActions; canEdit?: boolean; canEditText?: boolean; /** pubblicare/sostituire la Gazzetta (admin: solo Premium) */ canGazzetta?: boolean; startText?: boolean; startEdit?: boolean }) {
  const m = data.dataset.matches.find((x) => x.id === matchId);
  const { user } = useAuth();
  const communityVote = useCommunityVoteState(matchId);
  const bettingEnabled = useAdvancedEnabled(data.league.id);
  const toast = useToast();
  const confirm = useConfirm();
  const explainPremium = usePremiumExplain();
  const qc = useQueryClient();
  const [balanceOpen, setBalanceOpen] = useState(false);
  const formationPoll = useFormationPollState(matchId, canEdit && balanceOpen);
  const [planning, setPlanning] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [textOnly, setTextOnly] = useState(false);
  const [pagella, setPagella] = useState<{ key: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [betBusy, setBetBusy] = useState(false);
  const gazInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !pagella && !planning && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose, pagella, planning]);
  // Dal menu o dal pulsante Edit la scheda si apre già in modifica, secondo il ruolo.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !(startEdit && (canEdit || canEditText) || startText && canEditText)) return;
    const mm = data.dataset.matches.find((x) => x.id === matchId);
    if (!mm) return;
    started.current = true;
    // La redazione puo aprire la scheda in modifica anche se i dati arrivano dopo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTextOnly(!canEdit);
    setDraft(startDraft(mm, data.dataset.ratings.filter((r) => r.matchId === matchId)));
  }, [startEdit, startText, canEdit, canEditText, data, matchId]);
  const balance = useMemo(
    () => (balanceOpen && m ? matchBalance(data.dataset, data.weights, m, formOn(data)) : null),
    [balanceOpen, data, m],
  );
  if (!m) return null;
  const hideCommunityRatings = !!communityVote.data?.enabled && !communityVote.data.finalized;
  const ratings = data.dataset.ratings.filter((r) => r.matchId === matchId)
    .map((rating) => hideCommunityRatings ? { ...rating, rating: null } : rating);
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
    if (Object.values(draft.fields).some((f) => f.editorRating && clampRating(f.editorRating) === null)) {
      toast('Il voto editoriale deve essere tra 1 e 10, a passi di mezzo punto');
      return;
    }
    const changed = Object.values(draft.fields).flatMap((f) => {
      if (!f.id) return [];
      const r = ratings.find((x) => x.playerId === f.id);
      const oldTit = r && r.titolo ? String(r.titolo) : '';
      const oldDesc = r && r.notes ? String(r.notes) : '';
      const oldVote = r?.editorRating != null ? String(r.editorRating) : '';
      return f.tit !== oldTit || f.desc !== oldDesc || f.editorRating !== oldVote ?
        [{ playerId: f.id, titolo: f.tit, descrizione: f.desc, editorRating: clampRating(f.editorRating) }] : [];
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
      await qc.invalidateQueries({ queryKey: LEAGUE_HISTORY_QUERY_KEY });
      toast(`Salvate pagelle editoriali: ${changed.length}`);
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
    if (Object.values(draft.fields).some((f) => f.editorRating && clampRating(f.editorRating) === null)) {
      toast('Il voto editoriale deve essere tra 1 e 10, a passi di mezzo punto');
      return;
    }
    const plan = planSave(side('A', teamA.length), side('B', teamB.length), draft.scA, draft.scB, true);
    if (plan.overAssist.length) {
      const go = await confirm({
        icon: '🅰️', title: 'Assist più dei gol?', lines: [...plan.overAssist, '', 'Controlla i dati inseriti. Vuoi salvare comunque?'], okLabel: 'Salva comunque', cancelLabel: 'Correggi',
      });
      if (!go) return;
    }
    const notes = draft.notes.trim();
    const headerChanged = plan.scoreA !== (m.scoreA ?? '') || plan.scoreB !== (m.scoreB ?? '') || notes !== String(m.notes ?? '') || draft.time !== String(m.time ?? '') || draft.place.trim() !== String(m.place ?? '') || draft.placeLat !== placeOf(m).lat || draft.placeLng !== placeOf(m).lng || draft.placeUrl !== placeOf(m).url;
    setBusy(true);
    try {
      toast('⏳ Salvataggio...');
      const untouched = new Set(Object.entries(draft.fields).filter(([k, f]) => f.id && f.tit === draft.base[k]?.tit && f.desc === draft.base[k]?.desc).map(([, f]) => f.id as string));
      await saveMatchRatings(matchId, plan.rows, untouched, headerChanged ? {
        score_a: plan.scoreA === '' ? null : plan.scoreA,
        score_b: plan.scoreB === '' ? null : plan.scoreB,
        notes: notes || null, play_time: draft.time || null, place: draft.place.trim() || null,
        place_lat: draft.placeLat, place_lng: draft.placeLng, place_url: draft.placeUrl,
      } : undefined);
      releaseKeyboard();
      await qc.invalidateQueries({ queryKey: LEAGUE_HISTORY_QUERY_KEY });
      toast('Salvato: partita');
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
      await qc.invalidateQueries({ queryKey: LEAGUE_HISTORY_QUERY_KEY });
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
      await qc.invalidateQueries({ queryKey: LEAGUE_HISTORY_QUERY_KEY });
      toast('🗑 Gazzetta rimossa');
    } catch (e) {
      toast('❌ Non riuscito: ' + (e as Error).message);
    }
  };
  /** «Salta le pagelle»: la partita esce dall'elenco delle pagelle da scrivere (amministratore e redazione). */
  const toggleSkip = async () => {
    if (!m) return;
    const skip = !m.ratingsSkipped;
    try {
      await setRatingsSkipped(matchId, skip);
      await qc.invalidateQueries({ queryKey: LEAGUE_HISTORY_QUERY_KEY });
      toast(skip ? 'Pagelle saltate: la partita non compare più tra quelle da scrivere' : 'Pagelle rimesse tra quelle da scrivere');
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    }
  };
  const toggleBet = async () => {
    if (!m || betBusy) return;
    const enabled = m.bettingEnabled === false;
    setBetBusy(true);
    try {
      await setMatchBetEnabled(matchId, enabled);
      await Promise.all([
        qc.invalidateQueries({ queryKey: LEAGUE_HISTORY_QUERY_KEY }),
        qc.invalidateQueries({ queryKey: ['betting'] }),
        qc.invalidateQueries({ queryKey: ['advanced-predictions-board'] }),
        qc.invalidateQueries({ queryKey: ['advanced-leaderboard'] }),
        qc.invalidateQueries({ queryKey: ['advanced-stats'] }),
        qc.invalidateQueries({ queryKey: ['advanced-history'] }),
        qc.invalidateQueries({ queryKey: ['advanced-balance'] }),
      ]);
      toast(enabled ? 'Bet attivo per questa partita' : 'Bet disattivato: giocate conservate, punti sospesi');
    } catch (e) { toast('Errore: ' + (e as Error).message); }
    finally { setBetBusy(false); }
  };
  const remove = async () => {
    const ok = await confirm({
      icon: '🗑️', title: 'Eliminare la partita?', lines: ["Verranno eliminate anche tutte le pagelle e i gol di questa partita. L'operazione non è reversibile."], okLabel: 'Elimina', danger: true,
    });
    if (!ok) return;
    try {
      await deleteMatch(matchId);
      await qc.invalidateQueries({ queryKey: LEAGUE_HISTORY_QUERY_KEY });
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
            <div id="mbar-share" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}><MatchButtons data={data} m={m} act={act} withPlace={false} /></div>
            {canEdit && !editing ? (
              <button
                id="edit-toggle-btn" className="btn btn-secondary btn-sm mbar-btn admin-only" onClick={() => setDraft(startDraft(m, ratings))} title="Modifica partita" aria-label="Modifica partita"
                style={{ border: '2px solid var(--green)', color: 'var(--green)', marginLeft: 'auto', fontSize: 15, padding: '6px 9px' }}
              >
                ✏️
              </button>
            ) : canEditText && !editing ? (
              <button
                id="edit-text-btn" className="btn btn-secondary btn-sm mbar-btn staff-only" onClick={() => { setTextOnly(true); setDraft(startDraft(m, ratings)); }} title="Scrivi le pagelle" aria-label="Scrivi titoli e descrizioni"
                style={{ border: '2px solid var(--green)', color: 'var(--green)', marginLeft: 'auto', fontSize: 13, padding: '6px 9px' }}
              >
                📝 Scrivi le pagelle
              </button>
            ) : null}
          </div>
          {(canEdit || canEditText) && !editing && m && (m.ratingsSkipped || needsRatings(data.dataset, m)) ? (
            <div style={{ marginBottom: 10 }}>
              <button type="button" id="skip-ratings" className="btn btn-secondary btn-full btn-sm staff-only" style={{ whiteSpace: 'normal' }} onClick={() => void toggleSkip()}>
                {m.ratingsSkipped ? '↩ Rimetti tra le pagelle da scrivere' : '⏭️ Non scrivere le pagelle di questa partita'}
              </button>
            </div>
          ) : null}
          {canEdit && bettingEnabled.data === true ? <div className="match-bet-setting admin-only">
            <div><strong>Bet {m.bettingEnabled === false ? 'disattivato' : 'attivo'}</strong>
              <small>Le giocate già registrate restano salvate. Quando Bet è disattivato non contano nelle classifiche; riattivandolo tornano valide.</small></div>
            <button type="button" className="btn btn-secondary btn-sm" disabled={betBusy} onClick={() => void toggleBet()}>
              {betBusy ? 'Salvataggio…' : m.bettingEnabled === false ? 'Attiva Bet' : 'Disattiva Bet'}
            </button>
          </div> : null}
          <div id="match-fields" style={{ opacity: editing ? 1 : 0.92 }}>
            {canEdit && !editing && canPlanMatch(data.dataset, m) ? <button type="button" className="btn btn-secondary btn-full admin-only" style={{ marginBottom: 12 }} onClick={() => setPlanning(true)}>Modifica programma e squadre</button> : null}
            {full ? (
              <div style={{ marginBottom: 8 }}>
                <div style={{ ...LABEL, marginBottom: 6 }}>⏰ Ora</div>
                <HourSelect
                  id="edit-time" value={draft ? draft.time : String(m.time ?? '')} disabled={!full}
                  onChange={(v) => upd({ time: v })}
                  style={{ padding: '9px 11px', border: '1.5px solid var(--gray3)', borderRadius: 8, background: 'var(--gray)', color: 'var(--text)', marginBottom: 8 }}
                />
                <div style={{ ...LABEL, marginBottom: 6 }}>📍 Luogo</div>
                {full ? (
                  <PlaceField inputId="edit-place" placeholder="es. Campo Sole" value={draft ? { name: draft.place, lat: draft.placeLat, lng: draft.placeLng, url: draft.placeUrl } : placeOf(m)}
                    onChange={(p) => upd({ place: p.name, placeLat: p.lat, placeLng: p.lng, placeUrl: p.url })}
                    style={{ width: '100%', padding: '9px 11px', border: '1.5px solid var(--gray3)', borderRadius: 8, background: 'var(--gray)', color: 'var(--text)', boxSizing: 'border-box' }} />
                ) : (
                  <input type="text" id="edit-place" value={String(m.place ?? '')} placeholder="es. Campo Sole" disabled readOnly
                    style={{ width: '100%', padding: '9px 11px', border: '1.5px solid var(--gray3)', borderRadius: 8, background: 'var(--gray)', color: 'var(--text)', fontSize: 16, boxSizing: 'border-box' }} />
                )}
              </div>
            ) : whenWhere(m) ? (
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                <div id="match-when" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)' }}>⏰ {whenWhere(m)}</div>
                <PlaceShare place={placeOf(m)} />
              </div>
            ) : null}
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
            {!editing ? <Highlights data={data} m={m} hideRatings={hideCommunityRatings} /> : null}
            {!editing ? <CommunityVoteControls match={m} state={communityVote.data} canEdit={canEdit} userId={user?.id} /> : null}
            <div className="gaz-sec" id="gaz-sec">
              {g ? (
                <>
                  <div className="gaz-h">📰 La Gazzetta</div>
                  <div onClick={() => act.openGazzetta(m.id)}><GazThumb className="gaz-thumb" path={g} /></div>
                </>
              ) : null}
              {editing && canGazzetta ? (
                <div className="gaz-edit staff-only" style={{ display: 'flex' }}>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => gazInput.current?.click()}>
                    {g ? '🔄 Sostituisci la Gazzetta' : '📰 Carica la Gazzetta'}
                  </button>
                  {g ? <button type="button" className="btn btn-secondary btn-sm" style={{ color: 'var(--red)' }} disabled={busy} onClick={() => void dropGazzetta()}>🗑 Rimuovi</button> : null}
                  <input ref={gazInput} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void uploadGazzetta(f); }} />
                </div>
              ) : null}
              {editing && !canGazzetta ? (
                <div className="gaz-edit staff-only" style={{ display: 'flex' }}>
                  <button type="button" className="btn btn-sm premium-locked" id="gazzetta-locked" onClick={() => explainPremium('La Gazzetta')}>📰 Carica la Gazzetta <PremiumBadge /></button>
                </div>
              ) : null}
            </div>
            <div style={{ ...LABEL, margin: '14px 0 8px' }}>Gol, assist e voti (facoltativi)</div>
              {full ? <div className="mb-note" style={{ marginBottom: 8 }}>Puoi salvare gol, assist e voto dell’editore. Il voto dei votanti si calcola alla chiusura della votazione.</div> : null}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <TeamPanel title="🔵 Blu" team={teamA} ratings={ratings} blue side="A" ed={ed} hideRating={hideCommunityRatings} />
              <TeamPanel title="⚪ Bianchi" team={teamB} ratings={ratings} blue={false} side="B" ed={ed} hideRating={hideCommunityRatings} />
            </div>
            {!editing ? <><button type="button" className="btn btn-secondary btn-full eq-toggle" id="match-balance-btn" onClick={() => setBalanceOpen((o) => !o)}>
              ⚖️ Equilibrio squadre {balanceOpen ? '▴' : '▾'}
            </button>
            <div id="match-balance" style={{ display: balanceOpen ? 'block' : 'none' }}>
              {balance ? <BalanceBody b={balance} /> : null}
              {canEdit && formationPoll.data?.is_admin ? <FormationVoteSummary matchId={matchId} options={formationPoll.data.options}
                names={new Map(data.dataset.players.map((player) => [player.id, player.name]))} /> : null}
            </div></> : null}
            {full && draft ? (
              <SheetScan data={data} m={m} onApply={(r) => setDraft((d) => (d ? {
                ...d, scA: r.scA, scB: r.scB,
                fields: { ...d.fields, ...Object.fromEntries(Object.entries(r.fields).filter(([k]) => d.fields[k]).map(([k, v]) => [k, { ...(d.fields[k] as PlayerFields), goals: v.goals, assist: v.assist, autogol: v.autogol }])) },
              } : d))} />
            ) : null}
            {draft ? (
              <div className="staff-only staff-block" style={{ marginBottom: 8 }}>
                <WhatsAppImport
                  data={data} m={m}
                  hasRating={(k) => clampRating((draft.fields[k] as PlayerFields | undefined)?.editorRating) !== null}
                    onAssign={(k, tit, desc, editorRating) => ed?.set(k, { tit, desc, editorRating })}
                  defaultOpen={startText}
                />
              </div>
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
      {planning ? <PlannedMatchEditor data={data} match={m} onClose={() => setPlanning(false)} onSaved={onClose} /> : null}
      {pagella && draft ? (
        <PagellaDialog
          key={pagella.key}
          name={pagella.name}
          tit={(draft.fields[pagella.key] as PlayerFields).tit}
          desc={(draft.fields[pagella.key] as PlayerFields).desc}
          editorRating={(draft.fields[pagella.key] as PlayerFields).editorRating ?? ''}
          editorial={textOnly}
          onCancel={() => { releaseKeyboard(); setPagella(null); repairViewport(); }}
          onDone={(t, d, editorRating) => {
            ed?.set(pagella.key, { tit: t, desc: d, editorRating });
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
