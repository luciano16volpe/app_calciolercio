// Scheda "Le mie leghe" nelle Impostazioni: cambiare lega, crearne una, entrare con il codice d'invito, uscire.
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../app/auth';
import { useConfirm, usePrompt } from '../../app/Dialogs';
import { setSelectedLeague } from '../../app/league';
import { useToast } from '../../app/Toast';
import { createLeague, joinLeague, leaveLeague, MY_LEAGUES_KEY, useMyLeagues } from '../../data/leagues';
import { LEAGUE_QUERY_KEY } from '../../data/queries';

const ROLE_LABEL = { admin: 'Amministratore', redazione: 'Redazione', member: 'Membro' } as const;

export function LeaguesCard({ currentId }: { currentId: string | undefined }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const qc = useQueryClient();
  const leagues = useMyLeagues(user?.id ?? null);
  const list = leagues.data ?? [];
  const current = list.find((l) => l.id === currentId);

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: MY_LEAGUES_KEY }), qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY })]);

  const create = async () => {
    const name = await prompt({ icon: '🏆', title: 'Nuova lega', lines: ['Come si chiama il vostro gruppo? Ne diventerai amministratore.'], okLabel: 'Crea', input: { placeholder: 'Es. Calcetto del giovedì' } });
    if (name === null) return;
    if (!name.trim()) return toast('Nome non valido');
    try {
      const id = await createLeague(name.trim());
      setSelectedLeague(id);
      await refresh();
      toast('Lega creata');
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    }
  };
  const join = async () => {
    const code = await prompt({ icon: '🔑', title: 'Entra in una lega', lines: ["Scrivi il codice d'invito che ti ha dato l'amministratore."], okLabel: 'Entra', input: { placeholder: 'Codice' } });
    if (code === null) return;
    if (!code.trim()) return toast('Scrivi il codice');
    try {
      const id = await joinLeague(code);
      setSelectedLeague(id);
      await refresh();
      toast('Sei dentro la lega');
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    }
  };
  const leave = async (id: string, name: string) => {
    if (!user) return;
    const ok = await confirm({ icon: '🚪', title: 'Uscire dalla lega?', lines: [`Non vedrai più "${name}", a meno che non sia pubblica o ti invitino di nuovo.`], okLabel: 'Esci', danger: true });
    if (!ok) return;
    try {
      await leaveLeague(id, user.id);
      if (id === currentId) setSelectedLeague(null);
      await refresh();
      toast('Sei uscito dalla lega');
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    }
  };
  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast('Codice copiato');
    } catch {
      toast(`Codice: ${code}`);
    }
  };

  return (
    <div className="card" id="leagues-card">
      <div className="section-header">🏆 Le mie leghe</div>
      {leagues.isLoading ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>⏳ Caricamento…</div> : null}
      {list.map((l) => (
        <div key={l.id} className="league-row" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--gray2)' }}>
          <button
            type="button" className="league-pick" aria-pressed={l.id === currentId} onClick={() => setSelectedLeague(l.id)}
            style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text)' }}
          >
            <div style={{ fontSize: 14, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {l.id === currentId ? '✅ ' : ''}{l.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>{l.isPublic ? 'Pubblica' : 'Privata'}{l.role ? ` · ${ROLE_LABEL[l.role]}` : ''}</div>
          </button>
          {l.role && !l.isPublic ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void leave(l.id, l.name)} aria-label={`Esci da ${l.name}`}>Esci</button>
          ) : null}
        </div>
      ))}
      {current?.role === 'admin' ? (
        <div id="invite-box" style={{ marginTop: 10, background: 'var(--gray2)', borderRadius: 'var(--radius-sm)', padding: '9px 11px' }}>
          <div style={{ fontSize: 11, color: 'var(--text2)' }}>Codice d'invito di <b>{current.name}</b></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <code id="invite-code" style={{ fontSize: 18, fontWeight: 800, letterSpacing: 1, flex: 1 }}>{current.inviteCode}</code>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copyCode(current.inviteCode)}>Copia</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Chi lo inserisce entra come membro (guarda, non modifica).</div>
        </div>
      ) : null}
      {user ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" id="league-create" className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => void create()}>➕ Crea una lega</button>
          <button type="button" id="league-join" className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => void join()}>🔑 Ho un codice</button>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 10 }}>Accedi (qui sotto) per creare una lega o entrare con un codice.</div>
      )}
    </div>
  );
}
