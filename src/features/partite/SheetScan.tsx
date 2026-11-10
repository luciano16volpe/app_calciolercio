// «📷 Leggi il foglio»: si fotografa il foglio partita compilato in campo (una X per ogni gol, assist, autogol),
// l'app conta le X, mostra cosa ha letto per un controllo e, su conferma, compila la scheda (senza salvare).
import { useRef, useState } from 'react';
import { useToast } from '../../app/Toast';
import type { LeagueData } from '../../data/queries';
import { scoreFromRows, type ScanRow } from '../../domain/sheetScan';
import { normalizeTeam, playerKey } from '../../domain/stats';
import type { Match } from '../../domain/types';

export interface SheetApply {
  /** chiave del giocatore («A0», «B3»…) → numeri letti */
  fields: Record<string, { goals: string; assist: string; autogol: string }>;
  scA: string;
  scB: string;
}

type Kind = 'gol' | 'assist' | 'autogol';
const KINDS: Array<{ kind: Kind; label: string }> = [{ kind: 'gol', label: '⚽ Gol' }, { kind: 'assist', label: '🅰 Assist' }, { kind: 'autogol', label: '🙃 Autogol' }];

export function SheetScan({ data, m, onApply }: { data: LeagueData; m: Match; onApply: (r: SheetApply) => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<ScanRow[] | null>(null);
  const [extra, setExtra] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const names = (side: 'teamA' | 'teamB') => normalizeTeam(m[side]).map((p) => playerKey(data.dataset.players, p.id, p.name).name);
  const nA = names('teamA'), nB = names('teamB');

  const pick = async (f: File) => {
    setBusy(true);
    setError('');
    setRows(null);
    try {
      const { readSheetPhoto } = await import('../../canvas/sheetPhoto');
      const res = await readSheetPhoto(f, nA.length, nB.length);
      if (!res.ok) setError(res.message);
      else { setRows(res.rows); setExtra(res.extraMarked); }
    } catch (e) {
      setError((e as Error).message || 'Non riesco a leggere la foto.');
    } finally {
      setBusy(false);
    }
  };

  const step = (team: 'A' | 'B', index: number, kind: Kind, d: number) =>
    setRows((rs) => rs && rs.map((r) => (r.team === team && r.index === index ? { ...r, [kind]: Math.max(0, Math.min(20, r[kind] + d)), doubt: r.doubt.filter((k) => k !== kind) } : r)));

  const score = rows ? scoreFromRows(rows) : null;
  const apply = () => {
    if (!rows || !score) return;
    const fields: SheetApply['fields'] = {};
    for (const r of rows) fields[`${r.team}${r.index}`] = { goals: r.gol ? String(r.gol) : '', assist: r.assist ? String(r.assist) : '', autogol: r.autogol ? String(r.autogol) : '' };
    onApply({ fields, scA: String(score.a), scB: String(score.b) });
    setRows(null);
    setOpen(false);
    toast('Foglio letto: ora metti i voti e salva la partita');
  };

  const table = (team: 'A' | 'B', label: string, list: string[]) => (
    <div className="ss-team" key={team}>
      <div className="ss-th">{label}</div>
      {list.map((name, i) => {
        const r = (rows ?? []).find((x) => x.team === team && x.index === i);
        if (!r) return null;
        return (
          <div className="ss-row" key={i}>
            <span className="ss-name">{name}</span>
            {KINDS.map(({ kind, label: l }) => (
              <span className={`ss-cnt${r.doubt.includes(kind) ? ' doubt' : ''}`} key={kind} title={l}>
                <button type="button" aria-label={`${l} di ${name}: uno in meno`} onClick={() => step(team, i, kind, -1)}>−</button>
                <b aria-label={`${l} di ${name}`}>{r[kind]}</b>
                <button type="button" aria-label={`${l} di ${name}: uno in più`} onClick={() => step(team, i, kind, 1)}>+</button>
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );

  return (
    <div id="sheet-scan" className={`wa-import sheet-scan${open ? ' open' : ''}`} style={{ display: 'block' }}>
      <button type="button" id="sheet-toggle" className="wa-h wa-toggle" aria-expanded={open} aria-controls="sheet-body" onClick={() => setOpen((o) => !o)}>
        <span>📷 Leggi il foglio con le X</span><span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      <div id="sheet-body" hidden={!open}>
        <div className="mb-note" style={{ margin: '8px 0' }}>
          Fotografa il <b>foglio partita</b> compilato in campo, <b>intero</b> e con i <b>4 quadrati neri</b> agli angoli. L'app conta le X di ogni giocatore e calcola il risultato; voti e pagelle restano da inserire. Prima di compilare la scheda vedi quello che ha letto e puoi correggerlo. Serve il foglio <b>stampato dopo l'ultima modifica alle squadre</b>.
        </div>
        <input ref={file} id="sheet-file" type="file" accept="image/*" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pick(f); }} />
        <button type="button" id="sheet-pick" className="btn btn-secondary btn-full" disabled={busy} onClick={() => file.current?.click()}>
          {busy ? '⏳ Leggo il foglio…' : '📸 Scatta o scegli la foto'}
        </button>
        {error ? <div id="sheet-error" role="alert" className="mb-note" style={{ color: 'var(--red)', fontWeight: 700, lineHeight: 1.45 }}>⚠️ {error}</div> : null}
        {rows && score ? (
          <div id="sheet-result">
            <div className="mb-note" style={{ margin: '10px 0 6px' }}>Controlla i numeri letti. Le caselle in giallo erano dubbie: guardale sul foglio.</div>
            {table('A', '🔵 Blu', nA)}
            {table('B', '⚪ Bianchi', nB)}
            {extra ? <div className="mb-note" style={{ color: 'var(--red)', fontWeight: 700 }}>Ci sono X nelle righe vuote in fondo al foglio (giocatori non in lista): non sono state contate.</div> : null}
            <div id="sheet-score" style={{ textAlign: 'center', fontWeight: 800, margin: '8px 0' }}>Risultato: 🔵 Blu {score.a} – {score.b} Bianchi ⚪</div>
            <div className="mb-note">Applicando, gol, assist, autogol e risultato di questa scheda vengono <b>sostituiti</b>. Non si salva niente finché non tocchi «Salva partita».</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" id="sheet-apply" className="btn btn-primary" style={{ flex: 1 }} onClick={apply}>✅ Compila la scheda</button>
              <button type="button" className="btn btn-secondary" onClick={() => setRows(null)}>Scarta</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
