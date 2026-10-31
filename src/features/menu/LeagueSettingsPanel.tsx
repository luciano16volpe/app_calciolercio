// "Impostazioni della lega" (amministratore): nome, visibilità, formato, giorno, codice d'invito (copia, rigenera),
// cessione della proprietà (solo creatore), elimina la lega (scrivendone il nome).
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuth } from '../../app/auth';
import { useConfirm, usePrompt } from '../../app/Dialogs';
import { setSelectedLeague } from '../../app/league';
import { Sheet } from '../../app/Sheet';
import { useToast } from '../../app/Toast';
import {
  deleteLeague, MEMBERS_KEY, MY_LEAGUES_KEY, readLeagueSettings, regenerateInviteCode, transferOwnership, updateLeague, useMembers, useMyLeagues, type LeagueSettings,
} from '../../data/leagues';
import { LEAGUE_QUERY_KEY, type LeagueData } from '../../data/queries';

const DAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven'];

export function LeagueSettingsPanel({ data, onClose }: { data: LeagueData; onClose: () => void }) {
  const { user } = useAuth();
  const lid = data.league.id;
  const isOwner = !!user && data.league.owner_id === user.id;
  const toast = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const qc = useQueryClient();
  const mine = useMyLeagues(user?.id ?? null);
  const code = mine.data?.find((l) => l.id === lid)?.inviteCode ?? '';
  const members = useMembers(lid, true);
  const [name, setName] = useState(data.league.name);
  const [isPublic, setIsPublic] = useState(data.league.is_public);
  const [s, setS] = useState<LeagueSettings>({});
  const [busy, setBusy] = useState(false);
  const [newOwner, setNewOwner] = useState('');
  useEffect(() => {
    void readLeagueSettings(lid).then(setS).catch(() => undefined);
  }, [lid]);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: MY_LEAGUES_KEY }), qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY }), qc.invalidateQueries({ queryKey: MEMBERS_KEY })]);

  const save = async () => {
    const n = name.trim();
    if (n.length < 3 || n.length > 40) return toast('Il nome deve avere da 3 a 40 caratteri');
    setBusy(true);
    try {
      await updateLeague(lid, { name: n, isPublic, settings: s });
      await refresh();
      toast('Impostazioni salvate');
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const regen = async () => {
    const ok = await confirm({ icon: '🔑', title: 'Rigenerare il codice?', lines: ['Il vecchio codice smette di funzionare: chi lo ha ricevuto dovrà avere quello nuovo.'], okLabel: 'Rigenera' });
    if (!ok) return;
    try {
      await regenerateInviteCode(lid);
      await refresh();
      toast('Nuovo codice creato');
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast('Codice copiato');
    } catch {
      toast(`Codice: ${code}`);
    }
  };
  const transfer = async () => {
    if (!newOwner) return toast('Scegli a chi cedere la proprietà');
    const who = members.data?.find((m) => m.userId === newOwner);
    const ok = await confirm({ icon: '👑', title: 'Cedere la proprietà?', lines: [`${who?.name || who?.email} diventa il creatore di "${data.league.name}". Tu resti amministratore.`], okLabel: 'Cedi' });
    if (!ok) return;
    try {
      await transferOwnership(lid, newOwner);
      await refresh();
      toast('Proprietà ceduta');
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    }
  };
  const remove = async () => {
    const typed = await prompt({
      icon: '🗑️', title: 'Eliminare la lega?',
      lines: ['Si perdono partite, pagelle, albo e Gazzette di questa lega. I giocatori restano, con le loro altre leghe.', `Per confermare scrivi il nome della lega: ${data.league.name}`],
      okLabel: 'Elimina', danger: true, input: { placeholder: data.league.name },
    });
    if (typed === null) return;
    if (typed.trim() !== data.league.name) return toast('Il nome non coincide: lega non eliminata');
    try {
      await deleteLeague(lid);
      setSelectedLeague(null);
      await refresh();
      toast('Lega eliminata');
      onClose();
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    }
  };
  const admins = (members.data ?? []).filter((m) => m.role === 'admin' && m.userId !== user?.id);

  return (
    <Sheet title="Impostazioni della lega" onClose={onClose} id="sheet-league-settings">
      <div className="card">
        <div className="f-lab" style={{ marginTop: 0 }}>Nome</div>
        <input className="f-inp" id="ls-name" type="text" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        <div className="f-lab">Chi può vederla</div>
        <div className="f-seg">
          <button type="button" className={!isPublic ? 'on' : ''} onClick={() => setIsPublic(false)}>🔒 Solo i membri</button>
          <button type="button" className={isPublic ? 'on' : ''} onClick={() => setIsPublic(true)}>🌐 Chiunque abbia il link</button>
        </div>
        <div className="f-lab">Formato abituale</div>
        <div className="f-seg">
          {([5, 6, 7] as const).map((f) => <button type="button" key={f} className={s.format === f ? 'on' : ''} onClick={() => setS({ ...s, format: f })}>{f} vs {f}</button>)}
        </div>
        <div className="f-lab">Giorno della partita</div>
        <div className="f-seg">
          {DAYS.map((d, i) => <button type="button" key={d} className={s.day === i + 1 ? 'on' : ''} onClick={() => setS({ ...s, day: s.day === i + 1 ? undefined : i + 1 })}>{d}</button>)}
        </div>
        <button type="button" className="f-btn" id="ls-save" disabled={busy} onClick={() => void save()}>Salva</button>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="section-header">🔑 Codice d'invito</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <code id="ls-code" style={{ fontSize: 20, fontWeight: 800, letterSpacing: 2, flex: 1 }}>{code}</code>
          <button type="button" className="mini-btn" onClick={() => void copy()}>Copia</button>
          <button type="button" className="mini-btn" id="ls-regen" onClick={() => void regen()}>Rigenera</button>
        </div>
      </div>

      {isOwner ? (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="section-header">👑 Cedi la proprietà</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8, lineHeight: 1.4 }}>Il creatore nomina e toglie gli amministratori. Puoi cedere la proprietà a un altro amministratore della lega.</div>
          <select id="ls-owner" className="f-inp" value={newOwner} onChange={(e) => setNewOwner(e.target.value)} aria-label="Nuovo creatore">
            <option value="">{admins.length ? '— scegli un amministratore —' : 'Nessun altro amministratore'}</option>
            {admins.map((m) => <option key={m.userId} value={m.userId}>{m.name || m.email}</option>)}
          </select>
          <button type="button" className="btn btn-secondary btn-full" style={{ marginTop: 8 }} id="ls-transfer" disabled={!admins.length} onClick={() => void transfer()}>Cedi la proprietà</button>
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 12 }}>
        <div className="section-header">🗑️ Elimina la lega</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8, lineHeight: 1.4 }}>Si perdono partite, pagelle, albo e Gazzette di questa lega. I giocatori restano, con le altre leghe.</div>
        <button type="button" className="btn btn-danger btn-full" id="ls-delete" onClick={() => void remove()}>Elimina la lega…</button>
      </div>
    </Sheet>
  );
}
