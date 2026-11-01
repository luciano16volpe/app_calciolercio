// Pagina d'ingresso per chi non è loggato: il logo al centro e le opzioni Accedi / Registrati (e «password dimenticata»).
import { AccountCard } from '../impostazioni/AccountCard';

export function LoginPage({ waiting = false }: { waiting?: boolean }) {
  return (
    <div
      id="login-page"
      style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px calc(24px + env(safe-area-inset-bottom, 0px))', boxSizing: 'border-box' }}
    >
      <img src="/logo.png" alt="CalcioLercio" style={{ width: 132, height: 132, objectFit: 'contain', display: 'block' }} />
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6, color: 'var(--text)' }}>CalcioLercio</div>
      <div style={{ fontSize: 13, color: 'var(--text3)', margin: '4px 0 18px', textAlign: 'center' }}>Il calcetto tra amici</div>
      <div style={{ width: '100%', maxWidth: 380 }}>
        {waiting ? <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>⏳ Un attimo…</div> : <AccountCard leagueId={undefined} />}
        {waiting ? null : <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', marginTop: 8, lineHeight: 1.4 }}>Hai ricevuto un link d’invito? Aprilo da qui: ti registri e il tuo giocatore è già collegato.</div>}
      </div>
    </div>
  );
}
