// Scheda "Membri" (solo per l'amministratore della lega): chi c'è, che ruolo ha, cambiare ruolo, togliere.
import { useQueryClient } from '@tanstack/react-query';
import { useAuth, useRole } from '../../app/auth';
import { useConfirm } from '../../app/Dialogs';
import { useToast } from '../../app/Toast';
import { MEMBERS_KEY, removeMember, setMemberRole, useMembers, type Member } from '../../data/leagues';

const ROLES: Array<[Member['role'], string]> = [['admin', 'Amministratore'], ['redazione', 'Redazione'], ['member', 'Membro']];

export function MembersCard({ leagueId, leagueName }: { leagueId: string | undefined; leagueName: string | undefined }) {
  const { user } = useAuth();
  const { isAdmin } = useRole(leagueId);
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const q = useMembers(leagueId, isAdmin);
  if (!isAdmin || !leagueId) return null;
  const refresh = () => qc.invalidateQueries({ queryKey: MEMBERS_KEY });

  const change = async (m: Member, role: Member['role']) => {
    if (role === m.role) return;
    try {
      await setMemberRole(leagueId, m.userId, role);
      await refresh();
      toast('Ruolo cambiato');
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
      await refresh(); // la tendina torna al valore vero
    }
  };
  const drop = async (m: Member) => {
    const ok = await confirm({ icon: '🚪', title: 'Togliere dalla lega?', lines: [`${m.name || m.email} non vedrà più "${leagueName ?? 'la lega'}", a meno che non sia pubblica o rientri con il codice.`], okLabel: 'Togli', danger: true });
    if (!ok) return;
    try {
      await removeMember(leagueId, m.userId);
      await refresh();
      toast('Membro tolto');
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    }
  };

  return (
    <div className="card" id="members-card">
      <div className="section-header">👥 Membri di {leagueName}</div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6, lineHeight: 1.4 }}>
        <b>Amministratore</b> gestisce tutto · <b>Redazione</b> scrive titoli e descrizioni delle pagelle · <b>Membro</b> guarda.
      </div>
      {q.isLoading ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>⏳ Caricamento…</div> : null}
      {q.isError ? <div id="members-error" style={{ fontSize: 12, color: 'var(--red)', fontWeight: 700 }}>{(q.error as Error).message}</div> : null}
      {(q.data ?? []).map((m) => {
        const me = m.userId === user?.id;
        return (
          <div key={m.userId} className="member-row" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--gray2)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name || m.email}{me ? ' (tu)' : ''}</div>
              {m.name && m.email ? <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</div> : null}
            </div>
            <select
              value={m.role} aria-label={`Ruolo di ${m.name || m.email}`} onChange={(e) => void change(m, e.target.value as Member['role'])}
              style={{ fontSize: 16, padding: '6px 4px', borderRadius: 8, border: '1.5px solid var(--gray3)', background: 'var(--gray)', color: 'var(--text)', maxWidth: 130 }}
            >
              {ROLES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
            {!me ? <button type="button" onClick={() => void drop(m)} title="Togli" aria-label={`Togli ${m.name || m.email}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16, padding: 2 }}>🗑️</button> : null}
          </div>
        );
      })}
    </div>
  );
}
