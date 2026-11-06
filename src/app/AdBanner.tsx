export type AdPlacement = 'partite-feed' | 'gioca-risultato' | 'profilo-feed';

/** Spazio riservato: nessuno script pubblicitario viene caricato.
 * data-ad-placement identifica la posizione per la futura integrazione del provider.
 */
export function AdBanner({ placement }: { placement: AdPlacement }) {
  if (import.meta.env.VITE_AD_SPACES_ENABLED !== 'true') return null;

  return (
    <aside className="ad-banner" aria-label="Spazio pubblicitario" data-ad-placement={placement}>
      <span className="ad-banner-label">Pubblicità</span>
      <div className="ad-banner-space">
        <span className="ad-banner-title">Spazio pubblicitario</span>
        <span className="ad-banner-note">Banner in arrivo</span>
      </div>
    </aside>
  );
}
