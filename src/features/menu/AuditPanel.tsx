import { LoadingIndicator } from '../../app/LoadingIndicator';
// «🛡️ Registro attività» (solo amministratore supremo): chi ha fatto cosa, quando, dove. Filtri, azioni delicate ⚠️,
// elenco per operazione, dettaglio (prima → dopo, IP e dispositivo), esportazione CSV. Si legge soltanto: nessuno lo può modificare.
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Sheet } from '../../app/Sheet';
import { useToast } from '../../app/Toast';
import { AUDIT_PAGE, fetchAuditAll, fetchAuditFacets, fetchAuditPage, type AuditFilter } from '../../data/audit';
import {
  changeLines, describeRow, deviceName, formatDateTime, GROUP_LABEL, groupOperations, isDelicate, mergeRows, sourceLabel, toCsv, type AuditGroup, type AuditRow,
} from '../../domain/audit';
import { AUDIT_DAYS } from './privacyText';

type Period = 'today' | '7' | '30' | 'custom';

function periodRange(p: Period, from: string, to: string): Pick<AuditFilter, 'from' | 'to'> {
  const now = new Date();
  if (p === 'today') {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { from: d.toISOString() };
  }
  if (p === '7' || p === '30') return { from: new Date(now.getTime() - Number(p) * 86_400_000).toISOString() };
  const out: Pick<AuditFilter, 'from' | 'to'> = {};
  if (from) out.from = new Date(`${from}T00:00:00`).toISOString();
  if (to) out.to = new Date(new Date(`${to}T00:00:00`).getTime() + 86_400_000).toISOString(); // fino a fine giornata
  return out;
}

/** Data corta per l'intestazione: 28/10 14:32 */
const shortWhen = (iso: string) => formatDateTime(iso).replace(/\/\d{4}/, '');

function Detail({ r }: { r: AuditRow }) {
  const lines = changeLines(r);
  return (
    <div className="audit-detail" style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--text2)', background: 'var(--gray)', borderRadius: 8, padding: '8px 10px', margin: '4px 0 6px' }}>
      <div><b>Azione:</b> {r.action} · <b>Gruppo:</b> {GROUP_LABEL[r.grp]}</div>
      {r.entity_label ? <div><b>Oggetto:</b> {r.entity_label}</div> : null}
      {lines.length ? <ul style={{ margin: '4px 0 4px 16px', padding: 0 }}>{lines.map((l) => <li key={l} style={{ wordBreak: 'break-word' }}>{l}</li>)}</ul> : null}
      <div><b>Origine:</b> {sourceLabel(r.source)}</div>
      <div>
        <b>IP:</b> {r.ip ?? 'non più conservato'} · <b>Dispositivo:</b> {r.user_agent ? `${deviceName(r.user_agent)} (${r.user_agent})` : 'non più conservato'}
      </div>
    </div>
  );
}

export function AuditPanel({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [period, setPeriod] = useState<Period>('7');
  const [dFrom, setDFrom] = useState('');
  const [dTo, setDTo] = useState('');
  const [leagueId, setLeagueId] = useState('');
  const [actorId, setActorId] = useState('');
  const [group, setGroup] = useState<AuditGroup | ''>('');
  const [delicateOnly, setDelicateOnly] = useState(false);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [openRow, setOpenRow] = useState<Set<number>>(new Set());
  const seq = useRef(0);
  const [applied, setApplied] = useState<AuditFilter | null>(null);
  const [appliedKey, setAppliedKey] = useState('');
  const [loadFacets, setLoadFacets] = useState(false);
  const draftKey = JSON.stringify([period, dFrom, dTo, leagueId, actorId, group, delicateOnly]);
  const dirty = applied !== null && draftKey !== appliedKey;
  useEffect(() => () => { seq.current++; }, []);
  const facets = useQuery({ queryKey: ['audit-facets'], enabled: loadFacets, queryFn: fetchAuditFacets, retry: false, staleTime: 60_000 });

  const filter = (): AuditFilter => ({
    ...periodRange(period, dFrom, dTo),
    ...(leagueId ? { leagueId } : {}), ...(actorId ? { actorId } : {}), ...(group ? { group } : {}), ...(delicateOnly ? { delicateOnly: true } : {}),
  });

  const search = async () => {
    if (busy) return;
    if (period === 'custom' && (!dFrom || !dTo || dFrom > dTo)) {
      setError('Scegli un intervallo di date valido, con inizio e fine.');
      return;
    }
    const my = ++seq.current;
    const next = filter();
    setBusy(true);
    setError('');
    setRows([]);
    setMore(false);
    setApplied(null);
    setOpen(new Set());
    setOpenRow(new Set());
    try {
      const r = await fetchAuditPage(next, 0);
      if (my !== seq.current) return;
      setRows(r);
      setMore(r.length === AUDIT_PAGE);
      setApplied(next);
      setAppliedKey(draftKey);
    } catch (e) {
      if (my === seq.current) setError((e as Error).message);
    } finally {
      if (my === seq.current) setBusy(false);
    }
  };

  const loadMore = async () => {
    if (!applied || busy) return;
    setBusy(true);
    try {
      const r = await fetchAuditPage(applied, rows.length);
      setRows((old) => mergeRows(old, r));
      setMore(r.length === AUDIT_PAGE);
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    if (!applied || busy) return;
    setBusy(true);
    try {
      const all = await fetchAuditAll(applied);
      const url = URL.createObjectURL(new Blob([toCsv(all)], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `registro-attivita-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast(`Esportate ${all.length} righe`);
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const ops = groupOperations(rows);
  const toggle = <T,>(s: Set<T>, v: T): Set<T> => {
    const n = new Set(s);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    return n;
  };
  const periods: Array<[Period, string]> = [['today', 'Oggi'], ['7', '7 giorni'], ['30', '30 giorni'], ['custom', 'Date']];

  return (
    <Sheet title="🛡️ Registro attività" onClose={onClose} id="sheet-audit">
      <div className="card" id="audit-filters">
        <div className="f-lab" style={{ marginTop: 0 }}>Periodo</div>
        <div className="f-seg" id="audit-period">
          {periods.map(([k, l]) => <button type="button" key={k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>)}
        </div>
        {period === 'custom' ? (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input type="date" className="f-inp" id="audit-from" aria-label="Dal giorno" value={dFrom} onChange={(e) => setDFrom(e.target.value)} />
            <input type="date" className="f-inp" id="audit-to" aria-label="Al giorno" value={dTo} onChange={(e) => setDTo(e.target.value)} />
          </div>
        ) : null}
        <div className="f-lab">Lega</div>
        <select className="f-inp" id="audit-league" onFocus={() => setLoadFacets(true)} aria-label="Lega" value={leagueId} onChange={(e) => setLeagueId(e.target.value)}>
          <option value="">Tutte le leghe</option>
          {(facets.data?.leagues ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <div className="f-lab">Persona</div>
        <select className="f-inp" id="audit-actor" onFocus={() => setLoadFacets(true)} aria-label="Persona" value={actorId} onChange={(e) => setActorId(e.target.value)}>
          <option value="">Tutte le persone</option>
          {(facets.data?.actors ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <div className="f-lab">Che tipo di azione</div>
        <select className="f-inp" id="audit-group" aria-label="Gruppo" value={group} onChange={(e) => setGroup(e.target.value as AuditGroup | '')}>
          <option value="">Tutti i gruppi</option>
          {(Object.keys(GROUP_LABEL) as AuditGroup[]).map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, fontWeight: 700 }}>
          <input type="checkbox" id="audit-delicate" checked={delicateOnly} onChange={(e) => setDelicateOnly(e.target.checked)} style={{ width: 20, height: 20 }} />
          ⚠️ Solo azioni delicate
        </label>
        <div className="f-hint">Il registro tiene le azioni per {AUDIT_DAYS} giorni, poi si cancella da solo. Non si può modificare né cancellare da nessuno.</div>
        <button type="button" className="btn btn-primary btn-full" id="audit-search" disabled={busy} onClick={() => void search()} style={{ marginTop: 12 }}>{busy ? 'Ricerca in corso...' : 'Cerca attività'}</button>
        {facets.isLoading ? <LoadingIndicator /> : null}
        {facets.isError ? <p role="alert" className="f-hint">Impossibile caricare persone e leghe. <button type="button" className="mini-btn" onClick={() => void facets.refetch()}>Riprova</button></p> : null}
      </div>

      {!applied && !busy && !error ? <div className="card" id="audit-start">Scegli i filtri e premi Cerca attività per caricare il registro.</div> : null}
      {dirty ? <p role="status" className="f-hint">Filtri modificati: premi Cerca attività per aggiornare i risultati. CSV e altre pagine usano l'ultima ricerca eseguita.</p> : null}
      {busy ? <LoadingIndicator /> : null}
      {error ? <div className="card" id="audit-error" style={{ color: 'var(--red)', fontWeight: 700, fontSize: 13 }}>{error}</div> : null}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 2px 8px', flexWrap: 'wrap' }}>
        <span id="audit-count" style={{ flex: 1, fontSize: 12, color: 'var(--text3)' }}>
          {!applied && !busy ? 'Nessuna ricerca eseguita' : busy && !rows.length ? '' : `${ops.length} operazioni (${rows.length} righe)${more ? ' · ce ne sono altre' : ''}`}
        </span>
        <button type="button" className="mini-btn" id="audit-csv" disabled={busy || !rows.length} onClick={() => void exportCsv()}>⬇️ Esporta CSV</button>
      </div>

      {applied && !busy && !error && !rows.length ? <div className="card" id="audit-empty" style={{ fontSize: 13, color: 'var(--text3)' }}>Nessuna azione in questo periodo, con questi filtri.</div> : null}

      {ops.map((o) => {
        const key = `${o.tx}|${o.rows[0]?.id}`;
        const isOpen = open.has(key);
        return (
          <div key={key} className={`card audit-op${o.delicate ? ' delicate' : ''}`} style={{ marginBottom: 8, padding: '10px 12px', borderLeft: o.delicate ? '4px solid var(--amber, #e0a100)' : undefined }}>
            <button type="button" className="audit-head" aria-expanded={isOpen} onClick={() => setOpen((s) => toggle(s, key))}
              style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer', boxSizing: 'border-box' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700 }}>
                {o.delicate ? '⚠️ ' : ''}{o.actor} · {shortWhen(o.at)}{o.league ? ` · ${o.league}` : ''}
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 2, wordBreak: 'break-word' }}>{o.headline} <span style={{ color: 'var(--text3)' }}>{isOpen ? '▴' : '▾'}</span></div>
            </button>
            {isOpen ? (
              <div className="audit-rows" style={{ marginTop: 8 }}>
                {o.rows.map((r) => (
                  <div key={r.id} className="audit-row">
                    <button type="button" aria-expanded={openRow.has(r.id)} onClick={() => setOpenRow((s) => toggle(s, r.id))}
                      style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer', fontSize: 12.5, lineHeight: 1.45, padding: '3px 0', boxSizing: 'border-box', wordBreak: 'break-word' }}>
                      {isDelicate(r.action) ? '⚠️ ' : '• '}{describeRow(r).join(' · ')} <span style={{ color: 'var(--text3)' }}>ⓘ</span>
                    </button>
                    {openRow.has(r.id) ? <Detail r={r} /> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}

      {more ? <button type="button" className="btn btn-secondary btn-full" id="audit-more" disabled={busy} onClick={() => void loadMore()}>{busy ? '⏳…' : 'Carica altre'}</button> : null}
    </Sheet>
  );
}
