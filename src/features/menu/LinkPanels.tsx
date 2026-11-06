// Pannelli del collegamento account (amministratore): Inviti giocatori, Richieste «sono io», Unisci giocatori.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useConfirm } from '../../app/Dialogs';
import { Sheet } from '../../app/Sheet';
import { useToast } from '../../app/Toast';
import { CLAIMS_KEY, reviewClaim, usePendingClaims } from '../../data/claims';
import { createInvite, inviteUrl, mergePlayers, PLAYERS_STATUS_KEY, unlinkPlayer, usePlayersStatus, type PlayerStatus } from '../../data/invites';
import { LEAGUE_QUERY_KEY, type LeagueData } from '../../data/queries';
import { formatDate } from '../../domain/format';
import { LeagueInviteBox } from './LeagueInviteBox';
import { shareText } from './LeagueSheets';

export function InvitesPanel({ data, onClose }: { data: LeagueData; onClose: () => void }) {
  const lid = data.league.id;
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const q = usePlayersStatus(lid, true);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: PLAYERS_STATUS_KEY }), qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY })]);
  const message = (p: PlayerStatus, token: string) => `Ciao ${p.name}! Ecco il tuo link per entrare in CalcioLercio: ${inviteUrl(token)}`;
  const invite = async (p: PlayerStatus) => {
    try {
      const token = await createInvite(p.playerId, lid);
      await refresh();
      await shareText(message(p, token), toast, 'Invito a CalcioLercio');
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    }
  };
  const copyLink = async (p: PlayerStatus) => {
    if (!p.inviteToken) return;
    try {
      await navigator.clipboard.writeText(inviteUrl(p.inviteToken));
      toast('Link copiato');
    } catch {
      toast(inviteUrl(p.inviteToken));
    }
  };
  const unlink = async (p: PlayerStatus) => {
    const ok = await confirm({ icon: '🔗', title: 'Scollegare?', lines: [`${p.name} non sarà più collegato a ${p.linkedName}. Il giocatore e il suo storico restano intatti.`], okLabel: 'Scollega', danger: true });
    if (!ok) return;
    try {
      await unlinkPlayer(p.playerId);
      await refresh();
      toast('Scollegato');
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    }
  };
  return (
    <Sheet title="Inviti giocatori" onClose={onClose} id="sheet-invites">
      <LeagueInviteBox data={data} />
      <div className="card">
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8, lineHeight: 1.4 }}>
          Manda a ogni amico il suo <b>link personale</b>: valido 7 giorni, lo collega alla sua scheda e lo fa entrare nella lega.
        </div>
        {q.isError ? <div style={{ color: 'var(--red)', fontSize: 12, fontWeight: 700 }}>{(q.error as Error).message}</div> : null}
        {(q.data ?? []).map((p) => (
          <div key={p.playerId} className="row-line invite-row" style={{ flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                {p.linked ? `✅ Collegato a ${p.linkedName}` : p.inviteToken ? `Invito inviato il ${formatDate((p.inviteCreated ?? '').slice(0, 10))} · valido fino al ${formatDate((p.inviteExpires ?? '').slice(0, 10))}` : 'Non collegato'}
              </div>
            </div>
            {p.linked ? (
              <button type="button" className="mini-btn danger" onClick={() => void unlink(p)} aria-label={`Scollega ${p.name}`}>Scollega</button>
            ) : (
              <>
                {p.inviteToken ? <button type="button" className="mini-btn" onClick={() => void copyLink(p)}>📋 Copia link</button> : null}
                <button type="button" className="mini-btn" onClick={() => void invite(p)} aria-label={p.inviteToken ? `Rigenera il link di ${p.name}` : `Invita ${p.name}`}>
                  {p.inviteToken ? 'Rigenera link' : `🔗 Invita ${p.name}`}
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </Sheet>
  );
}

export function ClaimsPanel({ data, onClose }: { data: LeagueData; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const q = usePendingClaims(data.league.id, true);
  const decide = async (id: string, who: string, name: string, approve: boolean) => {
    try {
      await reviewClaim(id, approve);
      toast(approve ? `${who} è ora ${name}` : 'Richiesta rifiutata');
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    }
    await Promise.all([qc.invalidateQueries({ queryKey: CLAIMS_KEY }), qc.invalidateQueries({ queryKey: PLAYERS_STATUS_KEY })]);
  };
  return (
    <Sheet title="Richieste «sono io»" onClose={onClose} id="sheet-claims">
      <div className="card" id="claims-box">
        {q.isError ? <div id="claims-error" style={{ color: 'var(--red)', fontSize: 12, fontWeight: 700 }}>{(q.error as Error).message}</div> : null}
        {q.data && !q.data.length ? <div id="claims-empty" style={{ fontSize: 13, color: 'var(--text3)' }}>Nessuna richiesta in attesa.</div> : null}
        {(q.data ?? []).map((c) => (
          <div key={c.id} className="row-line claim-row">
            <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}><b>{c.who}</b> dice di essere <b>{c.playerName}</b></div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void decide(c.id, c.who, c.playerName, true)} aria-label={`Conferma ${c.who} come ${c.playerName}`}>✔</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void decide(c.id, c.who, c.playerName, false)} aria-label={`Rifiuta ${c.who}`}>✖</button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

export function MergePanel({ data, onClose }: { data: LeagueData; onClose: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const players = [...data.dataset.players].sort((a, b) => a.name.localeCompare(b.name));
  const [keep, setKeep] = useState('');
  const [drop, setDrop] = useState('');
  const [busy, setBusy] = useState(false);
  const status = usePlayersStatus(data.league.id, true);
  const findStatus = (id: string) => status.data?.find((p) => p.playerId === id);
  const bothLinked = !!findStatus(keep)?.linked && !!findStatus(drop)?.linked;
  const statusKnown = status.isSuccess && !!findStatus(keep) && !!findStatus(drop);
  const label = (id: string) => {
    const p = findStatus(id);
    return !p ? 'stato non disponibile' : p.linked ? 'assegnato a ' + p.linkedName : 'non assegnato';
  };
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '';
  const go = async () => {
    if (!keep || !drop) return toast('Scegli i due giocatori');
    if (keep === drop) return toast('Scegli due giocatori diversi');
    if (!statusKnown || status.isFetching) return toast('Attendi la verifica degli account collegati');
    if (bothLinked) return toast('Non puoi unire due giocatori entrambi assegnati a un account');
    const ok = await confirm({
      icon: '🔀', title: 'Unire i giocatori?',
      lines: [`${name(drop)} viene assorbito da ${name(keep)}: leghe, partite, pagelle e storico passano a ${name(keep)}, poi ${name(drop)} viene eliminato.`, 'Le statistiche di ' + name(keep) + ' non cambiano. L’operazione non si annulla.'],
      okLabel: 'Unisci', danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await mergePlayers(keep, drop);
      await Promise.all([qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY }), qc.invalidateQueries({ queryKey: PLAYERS_STATUS_KEY })]);
      toast('Giocatori uniti');
      setDrop('');
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title="Unisci giocatori" onClose={onClose} id="sheet-merge">
      <div className="card">
        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.4 }}>
          Per i doppioni (uno stesso amico inserito due volte). Scegli <b>chi tenere</b> e <b>chi assorbire</b>. Serve essere amministratore di tutte le leghe del doppione; se i due hanno giocato la stessa partita non si possono unire. Almeno uno dei due deve essere non assegnato a un account.
        </div>
        <div className="f-lab">Giocatore da tenere</div>
        <select id="mg-keep" className="f-inp" value={keep} disabled={busy || !status.isSuccess} onChange={(e) => setKeep(e.target.value)} aria-label="Giocatore da tenere">
          <option value="">— scegli —</option>
          {players.map((p) => <option key={p.id} value={p.id} disabled={!findStatus(p.id) || p.id === drop || (!!findStatus(p.id)?.linked && !!findStatus(drop)?.linked)}>{p.name} ({label(p.id)})</option>)}
        </select>
        <div className="f-lab">Doppione da assorbire</div>
        <select id="mg-drop" className="f-inp" value={drop} disabled={busy || !status.isSuccess} onChange={(e) => setDrop(e.target.value)} aria-label="Doppione da assorbire">
          <option value="">— scegli —</option>
          {players.filter((p) => p.id !== keep).map((p) => <option key={p.id} value={p.id} disabled={!findStatus(p.id) || (!!findStatus(keep)?.linked && !!findStatus(p.id)?.linked)}>{p.name} ({label(p.id)})</option>)}
        </select>
        {status.isPending || status.isFetching ? <p role="status" className="f-hint">Verifica degli account collegati...</p> : null}
        {status.isError ? <p role="alert" className="f-hint">Impossibile verificare gli account. <button type="button" className="mini-btn" onClick={() => void status.refetch()}>Riprova</button></p> : null}
        {bothLinked ? <p role="alert" className="f-hint">Non puoi unire due giocatori entrambi assegnati a un account.</p> : null}
        <button type="button" className="f-btn" id="mg-submit" disabled={busy || status.isFetching || !statusKnown || bothLinked || keep === drop} onClick={() => void go()}>Unisci</button>
      </div>
    </Sheet>
  );
}
