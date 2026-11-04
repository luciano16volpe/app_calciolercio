// Proposte di amministratore (creatore) e pannelli della Piattaforma (amministratore supremo): Tutte le leghe, Utenti.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useConfirm } from '../../app/Dialogs';
import { Sheet } from '../../app/Sheet';
import { useToast } from '../../app/Toast';
import {
  ADMIN_REQUESTS_KEY, assignOwner, decideAdminRequest, decideLeagueCreation, fetchLeagueAdmins, fetchLeagueCreationRequests, fetchPlatformLeagues, fetchPlatformUsers, MEMBERS_KEY, useAdminRequests,
} from '../../data/leagues';
import type { LeagueData } from '../../data/queries';
import { formatDate } from '../../domain/format';
import { endPremium, extendPremium, fetchPremiumStatuses, grantLifetimePremium, premiumDate } from '../../data/premium';
import { useAuth } from '../../app/auth';
import { FEATURE_LABELS, setFeatureMode, useFeatures, type Feature, type FeatureMode } from '../../data/features';

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
  const requests = useQuery({ queryKey: ['league-creation-requests'], queryFn: fetchLeagueCreationRequests, retry: false });
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
  const decideCreation = async (id: string, approve: boolean) => {
    try {
      await decideLeagueCreation(id, approve);
      await Promise.all([qc.invalidateQueries({ queryKey: ['league-creation-requests'] }), qc.invalidateQueries({ queryKey: ['platform-leagues'] })]);
      toast(approve ? 'Lega approvata' : 'Richiesta rifiutata');
    } catch (e) { toast('Errore: ' + (e as Error).message); }
  };
  return (
    <Sheet title="Tutte le leghe" onClose={onClose} id="sheet-platform-leagues">
      {requests.isError ? <div className="card" role="alert">Impossibile caricare le richieste: {(requests.error as Error).message}</div> : null}
      {(requests.data ?? []).map((r) => <div className="card" key={r.id} style={{ marginBottom: 10 }}>
        <b>Richiesta: {r.name}</b><div style={{ fontSize: 12 }}>Da {r.requester_name} · {r.email} · {formatDate(r.created_at.slice(0, 10))}</div>
        <button type="button" className="mini-btn" onClick={() => void decideCreation(r.id, true)}>Approva</button>{' '}
        <button type="button" className="mini-btn" onClick={() => void decideCreation(r.id, false)}>Rifiuta</button>
      </div>)}
      {q.isError ? <div className="card" style={{ color: 'var(--red)', fontWeight: 700, fontSize: 13 }}>{(q.error as Error).message}</div> : null}
      {(q.data ?? []).map((l) => (
        <div className="card platform-league" key={l.id} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>{l.ownerMissing ? '⚠️ ' : ''}{l.name} <span className="menu-role">Privata</span></div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4, lineHeight: 1.5 }}>
            Creatore: <b>{l.ownerMissing ? 'nessuno' : l.owner}</b><br />
            Amministratori: {l.admins || '—'}<br />
            {l.members} membri · {l.matches} partite · creata il {formatDate(l.createdAt.slice(0, 10))}<br />
            Ultima partita: {l.lastMatch ? formatDate(l.lastMatch) : 'nessuna'} · ultima attività {formatDate(l.lastActivity.slice(0, 10))}
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

export function PlatformUsersPanel({ onClose, premiumOnly = false }: { onClose: () => void; premiumOnly?: boolean }) {
  const q = useQuery({ queryKey: ['platform-users'], queryFn: fetchPlatformUsers, retry: false });
  const premium = useQuery({ queryKey: ['platform-premium'], queryFn: fetchPremiumStatuses, retry: false, enabled: premiumOnly });
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [months, setMonths] = useState<Record<string, number>>({});
  const changePremium = async (id: string, name: string, action: 'extend' | 'end' | 'lifetime') => {
    const duration = months[id] ?? 1;
    if (action === 'end' && !await confirm({ title: 'Disattivare Premium?', lines: [`Il Premium di ${name} terminerà subito.`], okLabel: 'Disattiva' })) return;
    if (action === 'lifetime' && !await confirm({ title: 'Premium a vita?', lines: [`${name} avrà Premium senza scadenza.`], okLabel: 'Assegna' })) return;
    setBusy(id);
    try {
      if (action === 'end') await endPremium(id); else if (action === 'lifetime') await grantLifetimePremium(id); else await extendPremium(id, duration);
      await Promise.all([qc.invalidateQueries({ queryKey: ['platform-premium'] }), qc.invalidateQueries({ queryKey: ['premium', id] })]);
      toast(action === 'end' ? 'Premium disattivato' : 'Premium aggiornato');
    } catch (e) { toast('Errore: ' + (e as Error).message); }
    finally { setBusy(null); }
  };
  return (
    <Sheet title={premiumOnly ? 'Abbonamenti Premium' : 'Utenti'} onClose={onClose} id="sheet-platform-users">
      {q.isError ? <div className="card" style={{ color: 'var(--red)', fontWeight: 700, fontSize: 13 }}>{(q.error as Error).message}</div> : null}
      {premium.isError ? <div className="card" role="alert">Impossibile caricare gli abbonamenti: {(premium.error as Error).message}</div> : null}
      {q.data ? <div style={{ fontSize: 12, color: 'var(--text3)', margin: '0 2px 8px' }}>{q.data.length} account</div> : null}
      {(q.data ?? []).map((u) => (
        <div className="card platform-user" key={u.id} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>{u.name || u.email}</div>
          {u.name ? <div style={{ fontSize: 11, color: 'var(--text3)' }}>{u.email}</div> : null}
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
            {u.leagues || 'Nessuna lega'}<br />
            Ultimo accesso: {u.lastSignIn ? formatDate(u.lastSignIn.slice(0, 10)) : '—'}
          </div>
          {premiumOnly && premium.data ? (() => {
            const status = premium.data.find((p) => p.user_id === u.id);
            return <div style={{ marginTop: 8, fontSize: 12 }}>
              <div><b>{status?.lifetime ? 'Premium a vita' : status?.trial ? 'Premium in prova' : status?.active ? 'Premium attivo' : 'Standard'}</b>{status?.trial_expires_at && status.trial ? ` · prova fino al ${premiumDate(status.trial_expires_at)}` : status?.expires_at ? ` · ${status.active ? 'scade' : 'scaduto'} il ${premiumDate(status.expires_at)}` : ''}</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
                {!status?.lifetime ? <><label>Durata <select aria-label={`Mesi Premium per ${u.name || u.email}`} value={months[u.id] ?? 1} onChange={(e) => setMonths((old) => ({ ...old, [u.id]: Number(e.target.value) }))}>
                  {[1, 3, 6, 12].map((m) => <option value={m} key={m}>{m} {m === 1 ? 'mese' : 'mesi'}</option>)}
                </select></label>
                <button type="button" className="mini-btn" disabled={busy !== null} onClick={() => void changePremium(u.id, u.name || u.email, 'extend')}>{status?.active ? 'Proroga' : 'Attiva'}</button>
                <button type="button" className="mini-btn" disabled={busy !== null} onClick={() => void changePremium(u.id, u.name || u.email, 'lifetime')}>Assegna a vita</button></> : null}
                {status?.active ? <button type="button" className="mini-btn" disabled={busy !== null} onClick={() => void changePremium(u.id, u.name || u.email, 'end')}>Disattiva</button> : null}
              </div>
            </div>;
          })() : null}
        </div>
      ))}
    </Sheet>
  );
}

export function PremiumPanel({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<'subscriptions' | 'trial' | 'features' | null>(null);
  if (section === 'subscriptions') return <PlatformUsersPanel premiumOnly onClose={() => setSection(null)} />;
  if (section === 'features') return <FeatureSettings onClose={() => setSection(null)} />;
  return <Sheet title="Premium" onClose={onClose} id="sheet-premium">
    {section === 'trial' ? <div className="card">
      <h3>Prova gratuita</h3>
      <p>Ogni nuovo account riceve un mese di Premium dalla registrazione. Nella gestione abbonamenti puoi vedere chi è in prova.</p>
      <button className="mini-btn" type="button" onClick={() => setSection(null)}>Torna a Premium</button>
    </div> : <div className="premium-tiles">
      <button type="button" className="premium-tile premium-tile-users" onClick={() => setSection('subscriptions')}><span>👥</span><b>Abbonamenti</b><small>Attiva, rinnova e controlla le scadenze</small></button>
      <button type="button" className="premium-tile premium-tile-trial" onClick={() => setSection('trial')}><span>✨</span><b>Prova gratuita</b><small>Un mese per i nuovi iscritti</small></button>
      <button type="button" className="premium-tile player-tile-records" onClick={() => setSection('features')}><span>⚙️</span><b>Funzionalità</b><small>Standard, Premium o Beta</small></button>
    </div>}
  </Sheet>;
}

function FeatureSettings({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const features = useFeatures(user?.id ?? null);
  const qc = useQueryClient();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const change = async (feature: Feature, mode: FeatureMode) => {
    setSaving(true);
    try {
      await setFeatureMode(feature, mode);
      await qc.invalidateQueries({ queryKey: ['feature-modes'] });
      toast('Funzionalità aggiornata');
    } catch (e) { toast('Errore: ' + (e as Error).message); }
    finally { setSaving(false); }
  };
  return <Sheet title="Funzionalità" onClose={onClose} id="sheet-feature-settings">
    <div className="card">
      <p>Standard è per tutti, Premium richiede l’abbonamento, Beta è visibile solo al super amministratore.</p>
      {features.isError ? <p role="alert">Impossibile caricare le impostazioni.</p> : null}
      {(features.data ?? []).map((f) => <label key={f.feature} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: '8px 0' }}>
        <span>{FEATURE_LABELS[f.feature as Feature] ?? f.feature}</span>
        <select value={f.mode} disabled={saving} onChange={(e) => void change(f.feature as Feature, e.target.value as FeatureMode)}>
          <option value="standard">Standard</option><option value="premium">Premium</option><option value="beta">Beta</option>
        </select>
      </label>)}
    </div>
  </Sheet>;
}
