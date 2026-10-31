// Finestra di conferma (come confirmModal di legacy) e due piccoli aiuti per la tastiera di iPhone.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

/** Toglie il cursore dai campi: su iPhone, se la tastiera resta aperta chiudendo una finestra, la barra in basso resta "sospesa". */
export function releaseKeyboard(): void {
  const a = document.activeElement as HTMLElement | null;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) a.blur();
}
/** Dopo la chiusura della tastiera rimette la pagina a posto. */
export function repairViewport(): void {
  requestAnimationFrame(() => window.scrollTo(window.scrollX, window.scrollY));
  window.setTimeout(() => window.scrollTo(window.scrollX, window.scrollY), 300);
}

export interface ConfirmOptions {
  icon?: string;
  title?: string;
  /** righe di testo (una sotto l'altra) */
  lines?: string[];
  okLabel?: string;
  cancelLabel?: string;
  /** pulsante rosso (azioni che non si annullano) */
  danger?: boolean;
  /** campo di testo (finestra "scrivi un nome"): suggerimento nel campo */
  input?: { placeholder?: string };
}

type Confirm = (o: ConfirmOptions) => Promise<boolean>;
type Prompt = (o: ConfirmOptions) => Promise<string | null>;
const DialogContext = createContext<{ confirm: Confirm; prompt: Prompt }>({ confirm: () => Promise.resolve(false), prompt: () => Promise.resolve(null) });
export const useConfirm = () => useContext(DialogContext).confirm;
/** Finestra con un campo di testo: restituisce il testo scritto, oppure null se si annulla. */
export const usePrompt = () => useContext(DialogContext).prompt;

export function DialogProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [text, setText] = useState('');
  const textRef = useRef('');
  const pending = useRef<((v: string | null) => void) | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const confirm = useCallback<Confirm>(
    (o) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setText('');
        textRef.current = '';
        setOpts(o);
      }),
    [],
  );
  const prompt = useCallback<Prompt>(
    (o) => new Promise<string | null>((resolve) => { pending.current = resolve; void confirm({ ...o, input: o.input ?? {} }).then((ok) => { const r = pending.current; pending.current = null; r?.(ok ? textRef.current : null); }); }),
    [confirm],
  );
  const done = (v: boolean) => {
    releaseKeyboard();
    setOpts(null);
    repairViewport();
    resolver.current?.(v);
    resolver.current = null;
  };
  const value = useMemo(() => ({ confirm, prompt }), [confirm, prompt]);
  return (
    <DialogContext.Provider value={value}>
      {children}
      {opts ? (
        <div id="app-modal" style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 600, padding: 18, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 380, background: 'var(--gray)', borderRadius: 'var(--radius)', padding: 20, boxShadow: '0 12px 36px rgba(0,0,0,0.4)' }}>
            <div id="app-modal-icon" style={{ fontSize: 34, textAlign: 'center', marginBottom: 8 }}>{opts.icon || '❓'}</div>
            <div id="app-modal-title" style={{ fontSize: 17, fontWeight: 800, textAlign: 'center', marginBottom: 6, color: 'var(--text)' }}>{opts.title || 'Conferma'}</div>
            <div id="app-modal-msg" style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center', lineHeight: 1.5, marginBottom: 14 }}>
              {(opts.lines ?? []).map((l, i) => (l === '' ? <br key={i} /> : <div key={i}>{l}</div>))}
            </div>
            {opts.input ? (
              <input
                id="app-modal-input" type="text" placeholder={opts.input.placeholder} value={text} autoFocus
                onChange={(e) => { setText(e.target.value); textRef.current = e.target.value; }}
                style={{ display: 'block', width: '100%', padding: '11px 13px', border: '1.5px solid var(--gray3)', borderRadius: 10, background: 'var(--gray2)', color: 'var(--text)', fontSize: 16, fontWeight: 600, marginBottom: 14, boxSizing: 'border-box' }}
              />
            ) : null}
            <div style={{ display: 'flex', gap: 8 }}>
              <button id="app-modal-cancel" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => done(false)}>{opts.cancelLabel || 'Annulla'}</button>
              <button id="app-modal-ok" className={`btn ${opts.danger ? 'btn-danger' : 'btn-primary'}`} style={{ flex: 1 }} onClick={() => done(true)}>{opts.okLabel || 'Conferma'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </DialogContext.Provider>
  );
}
