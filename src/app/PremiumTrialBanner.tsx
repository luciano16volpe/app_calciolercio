import { useState } from 'react';
import { useAuth } from './auth';
import { premiumDate, useMyPremium } from '../data/premium';

export function PremiumTrialBanner() {
  const { user } = useAuth();
  if (!user) return null;
  return <TrialBanner key={user.id} userId={user.id} />;
}

function TrialBanner({ userId }: { userId: string }) {
  const premium = useMyPremium(userId);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !premium.data?.trial || !premium.data.trial_expires_at) return null;
  return <div className="premium-trial-banner" role="status">
    <div><b>Un mese di Premium gratis ✨</b><br />La tua prova è attiva fino al {premiumDate(premium.data.trial_expires_at)}.</div>
    <button type="button" aria-label="Chiudi avviso Premium" onClick={() => setDismissed(true)}>×</button>
  </div>;
}
