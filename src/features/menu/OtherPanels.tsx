// Pannelli del menu: Privacy (con cancellazione dell'account), Aiuto, guida "Aggiungi i giocatori".
import { useAuth } from '../../app/auth';
import { usePrompt } from '../../app/Dialogs';
import { Sheet } from '../../app/Sheet';
import { useToast } from '../../app/Toast';
import { deleteMyAccount } from '../../data/account';
import { PRIVACY_SECTIONS } from './privacyText';

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
    ['Come si crea una lega?', 'Per ora le leghe le crea solo l’amministratore supremo: se te ne serve una nuova, chiedi a lui. Per entrare in una lega esistente usa il link personale o il codice d’invito.'],
    ['Chi può modificare le partite?', 'Gli amministratori. La redazione scrive solo titoli e descrizioni delle pagelle e carica la Gazzetta.'],
    ['Cosa vuol dire «Questo sono io»?', 'Collega il tuo account alla tua scheda di giocatore: scegli il tuo nome in ☰ → Il mio profilo e l’amministratore conferma.'],
    ['Ho un doppione nella rosa', 'Un amministratore può unire i due giocatori: ☰ → Gestione → Unisci giocatori.'],
    ['Come aggiorno l’app?', '☰ → Impostazioni app → Verifica e installa aggiornamenti. Per ricaricare solo i dati basta tirare la pagina verso il basso (sul computer, F5).'],
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

/** Lega nuova e vuota: aggiungi un giocatore. */
export function EmptyLeagueGuide({ onAddNew }: { onAddNew: () => void }) {
  return (
    <div className="card" id="empty-guide">
      <div className="section-header">👥 Aggiungi i giocatori</div>
      <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>La lega è vuota.</div>
      <button type="button" className="btn btn-secondary btn-full" id="guide-new" onClick={onAddNew}>➕ Nuovo giocatore</button>
    </div>
  );
}
