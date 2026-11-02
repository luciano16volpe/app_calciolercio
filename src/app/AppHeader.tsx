// Intestazione dell'app: a sinistra il pulsante ☰ (menu) e il logo con il nome della lega sotto; al centro CALCIO LERCIO.
// Toccando il logo o il titolo si torna alla pagina iniziale (Il mio profilo).
import type { LeagueData } from '../data/queries';

export function AppHeader({ data, onMenu, onHome }: { data: LeagueData | undefined; onMenu: () => void; onHome: () => void }) {
  return (
    <header className="app-header">
      <button type="button" className="hb" id="menu-button" aria-label="Apri il menu" onClick={onMenu}>☰</button>
      <div className="app-logo">
        <img src="/logo.png" alt="CalcioLercio" onClick={onHome} />
        {data ? (
          <button type="button" className="lg-pill" id="league-pill" onClick={onMenu} aria-label={`Lega attiva: ${data.league.name}. Cambia lega`}>{data.league.name}</button>
        ) : null}
      </div>
      <div className="app-title" onClick={onHome}>CALCIO LERCIO</div>
      <span className="app-gap" aria-hidden="true" />
    </header>
  );
}
