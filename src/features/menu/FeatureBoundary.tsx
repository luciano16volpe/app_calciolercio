import type { ReactNode } from 'react';
import { useAuth } from '../../app/auth';
import { Sheet } from '../../app/Sheet';
import { useFeatures, type Feature } from '../../data/features';

export function FeatureBoundary({ feature, onClose, children }: { feature: Feature; onClose: () => void; children: ReactNode }) {
  const { user } = useAuth();
  const features = useFeatures(user?.id ?? null);
  const entry = features.data?.find((f) => f.feature === feature);
  if (entry?.allowed) return children;
  return <Sheet title="Funzionalità" onClose={onClose}>
    <div className="card">{features.isPending ? 'Caricamento…' : features.isError ? 'Impossibile verificare l’accesso. Riprova.' : entry?.mode === 'premium' ? 'Questa funzione è riservata agli utenti Premium.' : 'Funzionalità non disponibile.'}</div>
  </Sheet>;
}
