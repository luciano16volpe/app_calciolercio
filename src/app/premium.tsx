// Aspetto e spiegazione comuni a tutte le funzioni Premium: etichetta dorata, avviso del requisito, finestra al tocco.
import { useCallback, type ReactNode } from 'react';
import { useConfirm } from './Dialogs';

/** Come si attiva Premium (lo concede l'amministratore dell'app). */
export const PREMIUM_HOW = 'Per usarla serve Premium attivo: chiedi all’amministratore di attivarlo.';

export function PremiumBadge({ label = 'Premium' }: { label?: string }) {
  return <span className="premium-badge">{label}</span>;
}

export function PremiumNote({ title = 'Funzione Premium', children }: { title?: ReactNode; children: ReactNode }) {
  return <div className="premium-note"><b>{title}</b><p>{children}</p></div>;
}

/** Al tocco di una funzione Premium senza Premium: spiega come attivarla, senza eseguire l'azione riservata. */
export function usePremiumExplain(): (name: string) => void {
  const confirm = useConfirm();
  return useCallback((name: string) => {
    void confirm({ icon: '✨', title: `${name}: funzione Premium`, lines: [PREMIUM_HOW], okLabel: 'Ho capito', cancelLabel: 'Chiudi' });
  }, [confirm]);
}
