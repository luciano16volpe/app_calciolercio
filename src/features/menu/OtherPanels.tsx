// Pannelli del menu: Il mio profilo, Privacy (con cancellazione dell'account), Aiuto, guida "Aggiungi i giocatori".
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '../../app/auth';
import { useConfirm, usePrompt } from '../../app/Dialogs';
import { setSelectedLeague } from '../../app/league';
import { Sheet } from '../../app/Sheet';
import { useToast } from '../../app/Toast';
import { deleteMyAccount } from '../../data/account';
import { addPlayersFromMyLeagues, leaveLeague, MY_LEAGUES_KEY, useMyLeagues } from '../../data/leagues';
import { LEAGUE_QUERY_KEY, type LeagueData } from '../../data/queries';
import { MyPlayerCard } from '../impostazioni/MyPlayerCard';
import { PRIVACY_SECTIONS } from './privacyText';

export function ProfilePanel({ data, onClose, onOpenMatch }: { data: LeagueData; onClose: () => void; onOpenMatch: (matchId: string) => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const leagues = useMyLeagues(user?.id ?? null);
  const mine = (leagues.data ?? []).filter((l) => l.role);
  const leave = async (id: string, slug: string, name: string) => {
    if (!user) return;
    const ok = await confirm({ icon: '🚪', title: 'Uscire dalla lega?', lines: [`Non vedrai più "${name}", a meno che ti invitino di nuovo.`], okLabel: 'Esci', danger: true });
    if (!ok) return;
    try {
      await leaveLeague(id, user.id);
      if (slug === data.league.slug) setSelectedLeague(null);
      await Promise.all([qc.invalidateQueries({ queryKey: MY_LEAGUES_KEY }), qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY })]);
      toast('Sei uscito dalla lega');
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    }
  };
  return (
    <Sheet title="Il mio profilo" onClose={onClose} id="sheet-profile">
      <MyPlayerCard data={data} onOpenMatch={(id) => { onClose(); onOpenMatch(id); }} />
      {mine.length ? (
        <div className="card" id="leave-card" style={{ marginTop: 12 }}>
          <div className="section-header">🚪 Uscire da una lega</div>
          {mine.map((l) => (
            <div key={l.id} className="row-line">
              <div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{l.name}</div>
              <button type="button" className="mini-btn danger" onClick={() => void leave(l.id, l.slug, l.name)} aria-label={`Esci da ${l.name}`}>Esci</button>
            </div>
          ))}
        </div>
      ) : null}
    </Sheet>
  );
}

export function PrivacyPanel({ onClose, onDeleted }: { onClose: () => void; onDeleted: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const prompt = usePrompt();
  const remove = async () => {
    const typed = await prompt({
      icon: '🗑️', title: 'Cancellare il mio account?',
      lines: ['Il tuo account, il nome e l’email vengono eliminati. Il tuo giocatore e il suo storico restano nelle leghe, senza account collegato.', 'Per confermare scrivi: CANCELLA'],
      okLabel: 'Cancella', danger: true, input: { placeholder: 'CANCELLA' },
    });
    if (typed === null) return;
    if (typed.trim().toUpperCase() !== 'CANCELLA') return toast('Scrivi CANCELLA per confermare');
    try {
      await deleteMyAccount();
      toast('Account cancellato');
      onDeleted();
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    }
  };
  return (
    <Sheet title="Privacy" onClose={onClose} id="sheet-privacy">
      {PRIVACY_SECTIONS.map((s) => (
        <div className="card" key={s.title} style={{ marginBottom: 10 }}>
          <div className="section-header">{s.title}</div>
          {s.text.map((t) => <p key={t} style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 6 }}>{t}</p>)}
        </div>
      ))}
      {user ? (
        <div className="card">
          <div className="section-header">Cancellare l'account</div>
          <button type="button" className="btn btn-danger btn-full" id="delete-account" onClick={() => void remove()}>Cancella il mio account…</button>
        </div>
      ) : null}
    </Sheet>
  );
}

export function HelpPanel({ onClose }: { onClose: () => void }) {
  const items: Array<[string, string]> = [
    ['Come entro in una lega?', 'Con il link personale che ti manda un amministratore, oppure con il codice d’invito: ☰ → Entra con un codice.'],
    ['Come creo una lega?', '☰ → Crea nuova lega. Ne diventi amministratore e creatore, e ricevi il codice d’invito da mandare agli amici.'],
    ['Chi può modificare le partite?', 'Gli amministratori. La redazione scrive solo titoli e descrizioni delle pagelle e carica la Gazzetta.'],
    ['Cosa vuol dire «Questo sono io»?', 'Collega il tuo account alla tua scheda di giocatore: scegli il tuo nome in ☰ → Il mio profilo e l’amministratore conferma.'],
    ['Ho un doppione nella rosa', 'Un amministratore può unire i due giocatori: ☰ → Gestione → Unisci giocatori.'],
    ['Come aggiorno l’app?', '☰ → Impostazioni app → Aggiorna app.'],
  ];
  return (
    <Sheet title="Aiuto" onClose={onClose} id="sheet-help">
      {items.map(([q, a]) => (
        <div className="card" key={q} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>{q}</div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text2)' }}>{a}</div>
        </div>
      ))}
    </Sheet>
  );
}

/** Lega nuova e vuota: guida "Aggiungi i giocatori" (dalle mie altre leghe, oppure uno nuovo). */
export function EmptyLeagueGuide({ data, onAddNew }: { data: LeagueData; onAddNew: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const leagues = useMyLeagues(user?.id ?? null);
  const others = (leagues.data ?? []).filter((l) => l.role === 'admin' && l.id !== data.league.id);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const n = await addPlayersFromMyLeagues(data.league.id, others.map((l) => l.id));
      await qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY });
      toast(n ? `Aggiunti ${n} giocatori` : 'Nessun giocatore nuovo da aggiungere');
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card" id="empty-guide">
      <div className="section-header">👥 Aggiungi i giocatori</div>
      <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>La lega è vuota. Hai due strade:</div>
      {others.length ? (
        <button type="button" className="btn btn-primary btn-full" id="guide-from-leagues" disabled={busy} onClick={() => void go()} style={{ marginBottom: 8 }}>
          📥 Dalle mie altre leghe ({others.map((l) => l.name).join(', ')})
        </button>
      ) : null}
      <button type="button" className="btn btn-secondary btn-full" id="guide-new" onClick={onAddNew}>➕ Nuovo giocatore</button>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>Con la prima strada i giocatori sono gli stessi, con le stesse schede: niente doppioni.</div>
    </div>
  );
}
