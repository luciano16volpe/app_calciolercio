// Proposte di amministratore (creatore) e pannelli della Piattaforma (amministratore supremo): Tutte le leghe, Utenti.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useConfirm } from '../../app/Dialogs';
import { Sheet } from '../../app/Sheet';
import { useToast } from '../../app/Toast';
import {
  ADMIN_REQUESTS_KEY, assignOwner, decideAdminRequest, fetchLeagueAdmins, fetchPlatformLeagues, fetchPlatformUsers, MEMBERS_KEY, useAdminRequests,
} from '../../data/leagues';
import type { LeagueData } from '../../data/queries';
import { formatDate } from '../../domain/format';

export function AdminProposalsPanel({ data, onClose }: { data: LeagueData; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useAdminRequests(data.league.id, true);
  const decide = async (id: string, who: string, approve: boolean) => {
    try {
      await decideAdminRequest(id, approve);
      toast(approve ? `${who} è ora amministratore` : 'Proposta rifiutata');
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    }
    await Promise.all([qc.invalidateQueries({ queryKey: ADMIN_REQUESTS_KEY }), qc.invalidateQueries({ queryKey: MEMBERS_KEY })]);
  };
  return (
    <Sheet title="Proposte di amministratore" onClose={onClose} id="sheet-proposals">
      <div className="card">
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8, lineHeight: 1.4 }}>Gli altri amministratori possono solo proporre: diventa amministratore chi approvi tu.</div>
        {q.isError ? <div style={{ color: 'var(--red)', fontSize: 12, fontWeight: 700 }}>{(q.error as Error).message}</div> : null}
        {q.data && !q.data.length ? <div id="proposals-empty" style={{ fontSize: 13, color: 'var(--text3)' }}>Nessuna proposta in attesa.</div> : null}
        {(q.data ?? []).map((r) => (
          <div key={r.id} className="row-line proposal-row">
            <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}><b>{r.name}</b>{r.requestedBy ? <span style={{ color: 'var(--text3)' }}> · proposto da {r.requestedBy}</span> : null}</div>
            <button type="button" className="btn btn-primary btn-sm" aria-label={`Approva ${r.name}`} onClick={() => void decide(r.id, r.name, true)}>✔</button>
            <button type="button" className="btn btn-secondary btn-sm" aria-label={`Rifiuta ${r.name}`} onClick={() => void decide(r.id, r.name, false)}>✖</button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

export function PlatformLeaguesPanel({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['platform-leagues'], queryFn: fetchPlatformLeagues, retry: false });
  const [assign, setAssign] = useState<{ leagueId: string; options: Array<{ id: string; name: string }> } | null>(null);
  const openAssign = async (leagueId: string) => {
    try {
      setAssign({ leagueId, options: await fetchLeagueAdmins(leagueId) });
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    }
  };
  const doAssign = async (id: string, name: string) => {
    if (!assign) return;
    const ok = await confirm({ icon: '👑', title: 'Assegnare la lega?', lines: [`${name} diventa il creatore della lega.`], okLabel: 'Assegna' });
    if (!ok) return;
    try {
      await assignOwner(assign.leagueId, id);
      toast('Lega assegnata');
      setAssign(null);
      await qc.invalidateQueries({ queryKey: ['platform-leagues'] });
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    }
  };
  return (
    <Sheet title="Tutte le leghe" onClose={onClose} id="sheet-platform-leagues">
      {q.isError ? <div className="card" style={{ color: 'var(--red)', fontWeight: 700, fontSize: 13 }}>{(q.error as Error).message}</div> : null}
      {(q.data ?? []).map((l) => (
        <div className="card platform-league" key={l.id} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>{l.ownerMissing ? '⚠️ ' : ''}{l.name} <span className="menu-role">Privata</span></div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4, lineHeight: 1.5 }}>
            Creatore: <b>{l.ownerMissing ? 'nessuno' : l.owner}</b><br />
            Amministratori: {l.admins || '—'}<br />
            {l.members} membri · {l.matches} partite · creata il {formatDate(l.createdAt.slice(0, 10))} · ultima attività {formatDate(l.lastActivity.slice(0, 10))}
          </div>
          {l.ownerMissing ? <button type="button" className="mini-btn" style={{ marginTop: 6 }} onClick={() => void openAssign(l.id)}>Assegna un creatore</button> : null}
          {assign?.leagueId === l.id ? (
            <div style={{ marginTop: 6 }}>
              {assign.options.length ? assign.options.map((o) => <button type="button" key={o.id} className="mini-btn" style={{ marginRight: 5 }} onClick={() => void doAssign(o.id, o.name)}>{o.name}</button>) : <span style={{ fontSize: 12, color: 'var(--text3)' }}>Nessun amministratore tra cui scegliere.</span>}
            </div>
          ) : null}
        </div>
      ))}
    </Sheet>
  );
}

export function PlatformUsersPanel({ onClose }: { onClose: () => void }) {
  const q = useQuery({ queryKey: ['platform-users'], queryFn: fetchPlatformUsers, retry: false });
  return (
    <Sheet title="Utenti" onClose={onClose} id="sheet-platform-users">
      {q.isError ? <div className="card" style={{ color: 'var(--red)', fontWeight: 700, fontSize: 13 }}>{(q.error as Error).message}</div> : null}
      {q.data ? <div style={{ fontSize: 12, color: 'var(--text3)', margin: '0 2px 8px' }}>{q.data.length} account</div> : null}
      {(q.data ?? []).map((u) => (
        <div className="card platform-user" key={u.id} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>{u.name || u.email}</div>
          {u.name ? <div style={{ fontSize: 11, color: 'var(--text3)' }}>{u.email}</div> : null}
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
            {u.leagues || 'Nessuna lega'}<br />
            Ultimo accesso: {u.lastSignIn ? formatDate(u.lastSignIn.slice(0, 10)) : '—'}
          </div>
        </div>
      ))}
    </Sheet>
  );
}
