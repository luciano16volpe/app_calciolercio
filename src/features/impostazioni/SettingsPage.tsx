// Pagina Impostazioni: versione e aggiornamento, formazioni, forma recente, pesi delle statistiche (sola lettura), account.
// Fonte: buildSettings, addModule, deleteModule, toggleFormBalance, manualUpdate in legacy/index.html.
// Backup su file e indirizzo del foglio Google non ci sono più: i dati stanno nel database.
import { useState } from 'react';
import { useConfirm } from '../../app/Dialogs';
import { readModules, readUseForm, writeModules, writeUseForm } from '../../app/settings';
import { useToast } from '../../app/Toast';
import type { LeagueData } from '../../data/queries';
import { addModule, moduleComposition, MODULE_SIZES, removeModule, type Modules } from '../../domain/modules';
import { FORM_FULL_RATINGS, FORM_MAX_WEIGHT, FORM_MIN_RATINGS } from '../../domain/form';
import { ICONS, STATS } from '../../domain/types';
import { AccountCard } from './AccountCard';
import { LeaguesCard } from './LeaguesCard';
import { MembersCard } from './MembersCard';

const PILLS = [0, 0.5, 1, 1.5, 2, 2.5, 3];
const numInput = { width: '100%', padding: 5, border: '1.5px solid var(--gray3)', borderRadius: 6, background: 'var(--gray)', color: 'var(--text)', fontSize: 16, fontWeight: 700, textAlign: 'center', boxSizing: 'border-box' } as const;

/** Cerca una nuova versione e la carica (il service worker la scarica, poi si ricarica la pagina). */
async function updateApp(toast: (m: string) => void): Promise<void> {
  toast('⏳ Controllo aggiornamenti…');
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (!reg) return toast(`✓ Hai già l'ultima versione (${__APP_VERSION__})`);
    await reg.update();
    const next = reg.installing ?? reg.waiting;
    if (!next) return toast(`✓ Hai già l'ultima versione (${__APP_VERSION__})`);
    toast('⬇️ Scarico la nuova versione…');
    await new Promise<void>((done) => {
      if (next.state === 'activated') return done();
      next.addEventListener('statechange', () => next.state === 'activated' && done());
      setTimeout(done, 15_000);
    });
    window.location.reload();
  } catch {
    toast('❌ Non riesco a controllare: riprova con la connessione attiva');
  }
}

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

export function SettingsPage({ data }: { data: LeagueData | undefined }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [mods, setMods] = useState<Modules>(readModules);
  const [useForm, setUseForm] = useState(readUseForm);
  const weights = data?.weights ?? Array(11).fill(1);

  const save = (m: Modules) => {
    setMods(m);
    writeModules(m);
  };
  const add = (n: number, d: number, m: number, a: number, desc: string) => {
    const r = addModule(mods, n, d, m, a, desc);
    if (r.error) {
      toast(r.error);
      return false;
    }
    save(r.modules);
    toast(`Formazione ${r.notation} aggiunta!`);
    return true;
  };
  const del = async (n: number, idx: number) => {
    const m = mods[n]?.[idx];
    if (!m) return;
    const r = removeModule(mods, n, idx);
    if (r.error) return toast(r.error);
    const ok = await confirm({ icon: '🗑️', title: 'Rimuovere la formazione?', lines: [`${m.notation} verrà eliminata dai moduli ${n}v${n}.`], okLabel: 'Rimuovi', danger: true });
    if (ok) save(r.modules);
  };

  return (
    <>
      <div className="card" id="settings-inner">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>
            Versione in uso: <strong id="app-version">{__APP_VERSION__}</strong>
          </span>
          <button className="btn btn-secondary btn-sm" id="update-app" onClick={() => void updateApp(toast)}>🔄 Aggiorna app</button>
        </div>

        <div className="section-header">Moduli di gioco</div>
        <div style={{ background: 'var(--green-light)', borderRadius: 'var(--radius-sm)', padding: '11px 13px', marginBottom: 16, border: '1px solid var(--green-mid)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', marginBottom: 4 }}>🤖 Scelta automatica</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
            L'algoritmo prova <strong>tutte</strong> le formazioni disponibili e sceglie quella che bilancia meglio i ruoli dei giocatori convocati. Le formazioni che aggiungi restano su questo telefono.
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
                    {(mods[n] ?? []).length > 1 ? (
                      <button onClick={() => void del(n, idx)} title="Rimuovi" aria-label={`Rimuovi ${m.notation}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 15, padding: 2, flexShrink: 0, lineHeight: 1 }}>🗑️</button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 8 }}><AddForm n={n} onAdd={add} /></div>
          </div>
        ))}

        <div className="section-header" style={{ marginTop: 4 }}>⚽ Forma recente</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(128,128,128,0.08)', borderRadius: 'var(--radius-sm)', padding: '11px 13px', marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Considera le pagelle</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.4, marginTop: 2 }}>
              Corregge l'OVR con la media voti storica. Il peso cresce con le pagelle: 0% con {FORM_MIN_RATINGS}, fino a {Math.round(FORM_MAX_WEIGHT * 100)}% con {FORM_FULL_RATINGS} o più. Lo vedi in ogni scheda alla voce ⚖️ Peso voti.
            </div>
          </div>
          <button
            id="form-switch" className={`form-switch${useForm ? ' on' : ''}`} aria-label="Attiva forma" aria-pressed={useForm}
            onClick={() => {
              const on = !useForm;
              setUseForm(on);
              writeUseForm(on);
              toast(on ? 'Forma recente attiva' : 'Forma recente disattivata');
            }}
          >
            <span className="form-knob" />
          </button>
        </div>

        <div className="section-header" style={{ marginTop: 4 }}>Peso statistiche</div>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10, lineHeight: 1.4 }}>
          Così pesa ogni statistica nell'OVR: <strong>0</strong> = escluso dal bilanciamento, <strong>3</strong> = peso massimo. Sono uguali per tutte le leghe e per ora non si cambiano da qui.
        </p>
        {STATS.map((s, i) => {
          const cur = Number(weights[i]);
          return (
            <div className="w-row" key={s} id={`wr${i}`}>
              <span className="w-name">{ICONS[i]} {s}</span>
              <div className="w-pills">
                {PILLS.map((v) => (
                  <span key={v} className={`w-pill${Math.abs(v - cur) < 0.01 ? ' w-pill-on' : ''}`} style={{ cursor: 'default' }}>{v}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <LeaguesCard currentId={data?.league.id} />
      <MembersCard leagueId={data?.league.id} leagueName={data?.league.name} />
      <AccountCard leagueId={data?.league.id} />
    </>
  );
}
