// "Crea nuova lega" (anteprima D) e "Entra con un codice".
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '../../app/auth';
import { setSelectedLeague } from '../../app/league';
import { Sheet } from '../../app/Sheet';
import { useToast } from '../../app/Toast';
import { createLeague, fetchMyLeagues, joinLeague, MY_LEAGUES_KEY, type MyLeague } from '../../data/leagues';
import { LEAGUE_QUERY_KEY } from '../../data/queries';

const DAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven'];

/** Messaggio da mandare agli amici (WhatsApp) per entrare in una lega. */
export const inviteMessage = (l: Pick<MyLeague, 'name' | 'slug' | 'inviteCode'>): string =>
  `Entra nella lega ${l.name} su CalcioLercio: ${window.location.origin}/l/${l.slug}/rosa · codice ${l.inviteCode}`;

export async function shareText(text: string, toast: (m: string) => void, title = 'CalcioLercio'): Promise<void> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Messaggio copiato');
  } catch {
    toast(text);
  }
}

export function CreateLeagueSheet({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [format, setFormat] = useState<5 | 6 | 7>(5);
  const [day, setDay] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<MyLeague | null>(null);

  const submit = async () => {
    const n = name.trim();
    if (n.length < 3 || n.length > 40) return toast('Il nome deve avere da 3 a 40 caratteri');
    setBusy(true);
    try {
      const { id } = await createLeague({ name: n, settings: { format, ...(day ? { day } : {}) } });
      const mine = await fetchMyLeagues(user?.id ?? null);
      const l = mine.find((x) => x.id === id);
      await qc.invalidateQueries({ queryKey: MY_LEAGUES_KEY });
      if (l) {
        setSelectedLeague(l.slug);
        setCreated(l);
      } else onClose();
      await qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY });
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <Sheet title="Lega creata" onClose={onClose} id="sheet-created">
        <div className="card">
          <div className="section-header">🎉 {created.name}</div>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>Sei l'<b>amministratore</b> e il <b>creatore</b>. Manda agli amici il codice d'invito:</div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 2, margin: '12px 0', fontFamily: 'ui-monospace, Menlo, monospace' }} id="created-code">{created.inviteCode}</div>
          <button type="button" className="f-btn" style={{ marginTop: 6 }} id="created-share" onClick={() => void shareText(inviteMessage(created), toast, 'Entra nella lega')}>📲 Condividi</button>
          <button type="button" className="btn btn-secondary btn-full" style={{ marginTop: 8 }} onClick={onClose}>Vai alla lega</button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="Crea nuova lega" onClose={onClose} id="sheet-create-league">
      <div className="card">
        <div className="f-lab" style={{ marginTop: 0 }}>Nome della lega</div>
        <input className="f-inp" id="cl-name" type="text" maxLength={40} placeholder="Es. Calcetto del Giovedì" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="f-hint" id="cl-private-note">🔒 La lega è privata: si entra solo con un invito (link personale o codice).</div>
        <div className="f-lab">Formato abituale</div>
        <div className="f-seg">
          {([5, 6, 7] as const).map((f) => <button type="button" key={f} className={format === f ? 'on' : ''} onClick={() => setFormat(f)}>{f} vs {f}</button>)}
        </div>
        <div className="f-lab">Giorno della partita (facoltativo)</div>
        <div className="f-seg">
          {DAYS.map((d, i) => <button type="button" key={d} className={day === i + 1 ? 'on' : ''} onClick={() => setDay(day === i + 1 ? undefined : i + 1)}>{d}</button>)}
        </div>
        <button type="button" className="f-btn" id="cl-submit" disabled={busy} onClick={() => void submit()}>Crea la lega</button>
        <div className="f-note">Diventerai <b>amministratore</b> della nuova lega. Riceverai il <b>codice d'invito</b> da mandare agli amici; i giocatori che hanno già una scheda in un'altra lega la porteranno con sé (niente doppioni).</div>
      </div>
    </Sheet>
  );
}

export function JoinLeagueSheet({ onClose, onJoined }: { onClose: () => void; onJoined?: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!code.trim()) return toast('Scrivi il codice');
    setBusy(true);
    try {
      const id = await joinLeague(code);
      await qc.invalidateQueries({ queryKey: MY_LEAGUES_KEY });
      const mine = await fetchMyLeagues(user?.id ?? null);
      const l = mine.find((x) => x.id === id);
      if (l) setSelectedLeague(l.slug);
      await qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY });
      toast('Sei dentro la lega');
      if (onJoined) onJoined(); // si apre il profilo: se non sei ancora collegato, scegli chi sei
      else onClose();
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title="Entra con un codice" onClose={onClose} id="sheet-join-league">
      <div className="card">
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>Scrivi il codice d'invito che ti ha dato l'amministratore. Se hai già un giocatore collegato al tuo account, entra con te.</div>
        <input className="f-inp" id="jl-code" type="text" autoCapitalize="none" autoCorrect="off" placeholder="Codice" value={code} onChange={(e) => setCode(e.target.value)} style={{ marginTop: 12 }} />
        <button type="button" className="f-btn" id="jl-submit" disabled={busy} onClick={() => void go()}>Entra</button>
      </div>
    </Sheet>
  );
}
