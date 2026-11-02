// Intestazione dell'app: a sinistra il logo e vicino il pulsante ☰ (menu); al centro CALCIO LERCIO; a destra il nome della lega (tocco = cambia lega).
// Toccando il logo o il titolo si torna alla pagina iniziale (Il mio profilo).
import type { LeagueData } from '../data/queries';

export function AppHeader({ data, onMenu, onHome }: { data: LeagueData | undefined; onMenu: () => void; onHome: () => void }) {
  return (
    <header className="app-header">
      <img className="app-logo" src="/logo.png" alt="CalcioLercio" onClick={onHome} />
      <button type="button" className="hb" id="menu-button" aria-label="Apri il menu" onClick={onMenu}>☰</button>
      <div className="app-title" onClick={onHome}>CALCIO LERCIO</div>
      {data ? (
        <button type="button" className="lg-pill" id="league-pill" onClick={onMenu} aria-label={`Lega attiva: ${data.league.name}. Cambia lega`}>{data.league.name}</button>
      ) : null}
    </header>
  );
}
