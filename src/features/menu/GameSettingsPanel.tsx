// «Regole di gioco»: formazioni, forma recente e peso delle statistiche. Uniche per tutta l'app.
// Le vedono gli amministratori di lega (sola lettura); le cambia solo l'amministratore supremo (il database lo garantisce).
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useConfirm } from '../../app/Dialogs';
import { Sheet } from '../../app/Sheet';
import { useToast } from '../../app/Toast';
import { formOn, modulesOf, setSetting } from '../../data/gameSettings';
import { LEAGUE_QUERY_KEY, type LeagueData } from '../../data/queries';
import { FORM_FULL_RATINGS, FORM_MAX_WEIGHT, FORM_MIN_RATINGS } from '../../domain/form';
import { addModule, moduleComposition, MODULE_SIZES, removeModule, serializeModules, type Modules } from '../../domain/modules';
import { ICONS, STATS } from '../../domain/types';

const PILLS = [0, 0.5, 1, 1.5, 2, 2.5, 3];
const numInput = { width: '100%', padding: 5, border: '1.5px solid var(--gray3)', borderRadius: 6, background: 'var(--gray)', color: 'var(--text)', fontSize: 16, fontWeight: 700, textAlign: 'center', boxSizing: 'border-box' } as const;

function AddForm({ n, onAdd }: { n: number; onAdd: (n: number, d: number, m: number, a: number, desc: string) => boolean }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ def: '2', med: '2', att: '1', desc: '' });
  if (!open) {
    return (
      <button type="button" id={`add-toggle-${n}`} onClick={() => setOpen(true)} style={{ background: 'none', border: '1px dashed var(--gray3)', color: 'var(--text2)', fontSize: 11, fontWeight: 600, padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', width: '100%', textAlign: 'center' }}>
        ➕ Aggiungi formazione {n}vs{n}
      </button>
    );
  }
  const field = (k: 'def' | 'med' | 'att', label: string, color: string) => (
    <div>
      <label style={{ fontSize: 10, color, display: 'block', marginBottom: 2, fontWeight: 700 }}>{label}</label>
      <input type="number" min={0} max={6} inputMode="numeric" id={`new-${k}-${n}`} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} style={numInput} />
    </div>
  );
  return (
    <div id={`add-form-${n}`} style={{ background: 'var(--gray2)', borderRadius: 'var(--radius-sm)', padding: '9px 10px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 7 }}>
        {field('def', '🛡️ Dif', 'var(--def)')}
        {field('med', '🔀 Med', 'var(--mid)')}
        {field('att', '⚔️ Att', 'var(--att)')}
      </div>
      <input type="text" placeholder="descrizione opz." id={`new-desc-${n}`} value={v.desc} onChange={(e) => setV({ ...v, desc: e.target.value })} style={{ width: '100%', padding: '5px 8px', border: '1.5px solid var(--gray3)', borderRadius: 6, background: 'var(--gray)', color: 'var(--text)', fontSize: 16, marginBottom: 7, boxSizing: 'border-box' }} />
      <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6, textAlign: 'center' }}>somma deve fare {n - 1}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => setOpen(false)}>Annulla</button>
        <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => onAdd(n, parseInt(v.def, 10), parseInt(v.med, 10), parseInt(v.att, 10), v.desc) && setOpen(false)}>Aggiungi</button>
      </div>
    </div>
  );
}

export function GameSettingsPanel({ data, editable, onClose }: { data: LeagueData; editable: boolean; onClose: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const mods = modulesOf(data);
  const useForm = formOn(data);
  const [weights, setWeights] = useState<number[]>(() => [...data.weights]);
  const [busy, setBusy] = useState(false);
  const dirty = weights.some((w, i) => w !== data.weights[i]);

  /** Salva sul database e rilegge i dati: tutti i telefoni vedranno il nuovo valore. */
  const save = async (key: Parameters<typeof setSetting>[0], value: unknown, ok: string): Promise<boolean> => {
    setBusy(true);
    try {
      await setSetting(key, value);
      await qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY });
      toast(ok);
      return true;
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const saveModules = (m: Modules, ok: string) => save('game_modules', serializeModules(m), ok);
  const add = (n: number, d: number, m: number, a: number, desc: string) => {
    const r = addModule(mods, n, d, m, a, desc);
    if (r.error) {
      toast(r.error);
      return false;
    }
    void saveModules(r.modules, `Formazione ${r.notation} aggiunta!`);
    return true;
  };
  const del = async (n: number, idx: number) => {
    const m = mods[n]?.[idx];
    if (!m) return;
    const r = removeModule(mods, n, idx);
    if (r.error) return toast(r.error);
    const ok = await confirm({ icon: '🗑️', title: 'Rimuovere la formazione?', lines: [`${m.notation} verrà eliminata dai moduli ${n}v${n} per tutte le leghe.`], okLabel: 'Rimuovi', danger: true });
    if (ok) await saveModules(r.modules, 'Formazione rimossa');
  };

  return (
    <Sheet title="🎮 Regole di gioco" onClose={onClose} id="sheet-game-settings">
      <div className="card" id="game-settings">
        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.45, marginBottom: 10 }}>
          Valgono per <b>tutte le leghe</b>. {editable ? 'Le cambi solo tu, come amministratore della piattaforma.' : 'Le vedi come amministratore di lega, ma le cambia solo l’amministratore della piattaforma.'}
        </div>

        <div className="section-header">Moduli di gioco</div>
        <div style={{ background: 'var(--green-light)', borderRadius: 'var(--radius-sm)', padding: '11px 13px', marginBottom: 16, border: '1px solid var(--green-mid)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', marginBottom: 4 }}>🤖 Scelta automatica</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
            L'algoritmo prova <strong>tutte</strong> le formazioni disponibili e sceglie quella che bilancia meglio i ruoli dei giocatori convocati.
          </div>
        </div>
        {MODULE_SIZES.map((n) => (
          <div key={n} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>
              {n}vs{n} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text3)', marginLeft: 4 }}>{n} giocatori per squadra</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              {(mods[n] ?? []).map((m, idx) => {
                const c = moduleComposition(m.slots);
                return (
                  <div key={m.notation} className="module-tile" style={{ display: 'flex', alignItems: 'flex-start', gap: 6, background: 'var(--gray)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', minWidth: 0 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>{m.notation}</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', fontSize: 10, lineHeight: 1.3 }}>
                        <span style={{ color: 'var(--text2)' }}>🧤<strong>{c.por}</strong></span>
                        <span style={{ color: 'var(--def)' }}>🛡️<strong>{c.def}</strong></span>
                        <span style={{ color: 'var(--mid)' }}>🔀<strong>{c.med}</strong></span>
                        <span style={{ color: 'var(--att)' }}>⚔️<strong>{c.att}</strong></span>
                      </div>
                      {m.desc ? <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.desc}</div> : null}
                    </div>
                    {editable && (mods[n] ?? []).length > 1 ? (
                      <button disabled={busy} onClick={() => void del(n, idx)} title="Rimuovi" aria-label={`Rimuovi ${m.notation}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 15, padding: 2, flexShrink: 0, lineHeight: 1 }}>🗑️</button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {editable ? <div style={{ marginTop: 8 }}><AddForm n={n} onAdd={add} /></div> : null}
          </div>
        ))}

        <div className="section-header" style={{ marginTop: 4 }}>⚽ Forma recente</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(128,128,128,0.08)', borderRadius: 'var(--radius-sm)', padding: '11px 13px', marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Considera le pagelle {editable ? '' : `· ${useForm ? 'attiva' : 'spenta'}`}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.4, marginTop: 2 }}>
              Corregge l'OVR con la media voti storica. Il peso cresce con le pagelle: 0% con {FORM_MIN_RATINGS}, fino a {Math.round(FORM_MAX_WEIGHT * 100)}% con {FORM_FULL_RATINGS} o più.
            </div>
          </div>
          {editable ? (
            <button
              id="form-switch" className={`form-switch${useForm ? ' on' : ''}`} aria-label="Attiva forma" aria-pressed={useForm} disabled={busy}
              onClick={() => void save('use_form', !useForm, !useForm ? 'Forma recente attiva' : 'Forma recente disattivata')}
            >
              <span className="form-knob" />
            </button>
          ) : null}
        </div>

        <div className="section-header" style={{ marginTop: 4 }}>Peso statistiche</div>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10, lineHeight: 1.4 }}>
          Così pesa ogni statistica nell'OVR: <strong>0</strong> = escluso dal bilanciamento, <strong>3</strong> = peso massimo.
        </p>
        {STATS.map((s, i) => {
          const cur = Number(weights[i]);
          return (
            <div className="w-row" key={s} id={`wr${i}`}>
              <span className="w-name">{ICONS[i]} {s}</span>
              <div className="w-pills">
                {PILLS.map((v) => (
                  <span
                    key={v} className={`w-pill${Math.abs(v - cur) < 0.01 ? ' w-pill-on' : ''}`} style={{ cursor: editable ? 'pointer' : 'default' }}
                    role={editable ? 'button' : undefined} aria-label={editable ? `${s} ${v}` : undefined}
                    onClick={editable ? () => setWeights((w) => w.map((x, j) => (j === i ? v : x))) : undefined}
                  >{v}</span>
                ))}
              </div>
            </div>
          );
        })}
        {editable ? (
          <button type="button" className="f-btn" id="weights-save" disabled={busy || !dirty} onClick={() => void save('ovr_weights', weights, 'Pesi salvati: valgono per tutte le leghe')}>Salva i pesi</button>
        ) : null}
      </div>
    </Sheet>
  );
}
