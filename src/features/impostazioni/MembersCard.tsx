// Scheda "Membri" (solo per l'amministratore della lega): chi c'è, che ruolo ha, cambiare ruolo, togliere.
import { useQueryClient } from '@tanstack/react-query';
import { useAuth, useRole } from '../../app/auth';
import { useConfirm } from '../../app/Dialogs';
import { useToast } from '../../app/Toast';
import { CLAIMS_KEY, reviewClaim, usePendingClaims, type PendingClaim } from '../../data/claims';
import { MEMBERS_KEY, removeMember, setMemberRole, useMembers, type Member } from '../../data/leagues';

const ROLES: Array<[Member['role'], string]> = [['admin', 'Amministratore'], ['redazione', 'Redazione'], ['member', 'Membro']];

export function MembersCard({ leagueId, leagueName }: { leagueId: string | undefined; leagueName: string | undefined }) {
  const { user } = useAuth();
  const { isAdmin } = useRole(leagueId);
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const q = useMembers(leagueId, isAdmin);
  const claims = usePendingClaims(leagueId, isAdmin);
  if (!isAdmin || !leagueId) return null;
  const refresh = () => qc.invalidateQueries({ queryKey: MEMBERS_KEY });
  const decide = async (c: PendingClaim, approve: boolean) => {
    try {
      await reviewClaim(c.id, approve);
      await qc.invalidateQueries({ queryKey: CLAIMS_KEY });
      toast(approve ? `${c.who} è ora ${c.playerName}` : 'Richiesta rifiutata');
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
      await qc.invalidateQueries({ queryKey: CLAIMS_KEY });
    }
  };

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
      {(claims.data ?? []).length ? (
        <div id="claims-box" style={{ background: 'var(--gray2)', borderRadius: 'var(--radius-sm)', padding: '9px 11px', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>🙋 Richieste "questo sono io"</div>
          {(claims.data ?? []).map((c) => (
            <div key={c.id} className="claim-row" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0' }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis' }}><b>{c.who}</b> dice di essere <b>{c.playerName}</b></div>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void decide(c, true)} aria-label={`Conferma ${c.who} come ${c.playerName}`}>✔</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void decide(c, false)} aria-label={`Rifiuta ${c.who}`}>✖</button>
            </div>
          ))}
        </div>
      ) : null}
      {claims.isError ? <div id="claims-error" style={{ fontSize: 12, color: 'var(--red)', fontWeight: 700, marginBottom: 6 }}>{(claims.error as Error).message}</div> : null}
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
