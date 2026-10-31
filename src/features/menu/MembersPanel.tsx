// "Membri e ruoli" (amministratore): chi c'è e che ruolo ha. Il creatore 👑 nomina e toglie gli admin e cede la proprietà;
// gli altri admin possono proporre un admin (decide il creatore). Le regole vere stanno nel database: qui si mostra solo ciò che si può fare.
import { useQueryClient } from '@tanstack/react-query';
import { useAuth, useRole } from '../../app/auth';
import { useConfirm } from '../../app/Dialogs';
import { Sheet } from '../../app/Sheet';
import { useToast } from '../../app/Toast';
import {
  ADMIN_REQUESTS_KEY, cancelAdminRequest, MEMBERS_KEY, MY_LEAGUES_KEY, proposeAdmin, removeMember, setMemberRole, useMembers, type Member,
} from '../../data/leagues';
import { LEAGUE_QUERY_KEY, type LeagueData } from '../../data/queries';

export function MembersPanel({ data, onClose }: { data: LeagueData; onClose: () => void }) {
  const { user } = useAuth();
  const lid = data.league.id;
  const { isAdmin } = useRole(lid);
  const isOwner = !!user && data.league.owner_id === user.id;
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const q = useMembers(lid, isAdmin);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: MEMBERS_KEY }), qc.invalidateQueries({ queryKey: ADMIN_REQUESTS_KEY }), qc.invalidateQueries({ queryKey: MY_LEAGUES_KEY }), qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY })]);
  const act = async (f: () => Promise<void>, ok: string) => {
    try {
      await f();
      toast(ok);
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    }
    await refresh();
  };
  const label = (m: Member) => m.name || m.email;
  const setRole = (m: Member, role: Member['role'], ok: string) => void act(() => setMemberRole(lid, m.userId, role), ok);
  const drop = async (m: Member) => {
    const yes = await confirm({ icon: '🚪', title: 'Togliere dalla lega?', lines: [`${label(m)} non vedrà più "${data.league.name}", a meno che non sia pubblica o rientri con il codice.`], okLabel: 'Togli', danger: true });
    if (yes) void act(() => removeMember(lid, m.userId), 'Membro tolto');
  };

  return (
    <Sheet title={`Membri di ${data.league.name}`} onClose={onClose} id="sheet-members">
      <div className="card" id="members-card">
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6, lineHeight: 1.4 }}>
          <b>Amministratore</b> gestisce tutto · <b>Redazione</b> scrive titoli e descrizioni delle pagelle · <b>Membro</b> guarda. Solo il <b>creatore</b> nomina e toglie gli amministratori.
        </div>
        {q.isLoading ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>⏳ Caricamento…</div> : null}
        {q.isError ? <div id="members-error" style={{ fontSize: 12, color: 'var(--red)', fontWeight: 700 }}>{(q.error as Error).message}</div> : null}
        {(q.data ?? []).map((m) => {
          const me = m.userId === user?.id;
          return (
            <div key={m.userId} className="member-row" style={{ padding: '9px 0', borderBottom: '1px solid var(--gray2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 800 }}>{label(m)}{me ? ' (tu)' : ''}</span>
                {m.isOwner ? <span className="pill-owner">👑 Creatore</span> : m.role === 'admin' ? <span className="menu-role a">Admin</span> : m.role === 'redazione' ? <span className="menu-role r">Redazione</span> : <span className="menu-role">Membro</span>}
                {m.adminRequestId ? <span className="pill-wait">⏳ Proposto come admin · in attesa del creatore</span> : null}
              </div>
              {m.name && m.email ? <div style={{ fontSize: 11, color: 'var(--text3)' }}>{m.email}</div> : null}
              {!m.isOwner ? (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                  {m.role === 'admin' ? (
                    isOwner ? <button type="button" className="mini-btn" onClick={() => setRole(m, 'member', 'Ora è membro')}>Torna membro</button> : null
                  ) : (
                    <>
                      {m.role !== 'redazione' ? <button type="button" className="mini-btn" onClick={() => setRole(m, 'redazione', 'Ora è redazione')}>Rendi redazione</button> : null}
                      {m.role !== 'member' ? <button type="button" className="mini-btn" onClick={() => setRole(m, 'member', 'Ora è membro')}>Torna membro</button> : null}
                      {isOwner ? <button type="button" className="mini-btn" onClick={() => setRole(m, 'admin', 'Ora è amministratore')}>Rendi admin</button> : null}
                      {!isOwner && !m.adminRequestId ? <button type="button" className="mini-btn" onClick={() => void act(() => proposeAdmin(lid, m.userId), 'Proposta inviata al creatore')}>Proponi come admin</button> : null}
                      {m.adminRequestId ? <button type="button" className="mini-btn" onClick={() => void act(() => cancelAdminRequest(m.adminRequestId as string), 'Proposta annullata')}>Annulla la proposta</button> : null}
                    </>
                  )}
                  {(m.role !== 'admin' || isOwner) && !me ? (
                    <button type="button" className="mini-btn danger" onClick={() => void drop(m)} aria-label={`Togli ${label(m)}`}>Rimuovi</button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
