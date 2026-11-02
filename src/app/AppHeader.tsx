// Intestazione dell'app: a sinistra solo il pulsante ☰ (menu); al centro CALCIO LERCIO; a destra il nome della lega (tocco = cambia lega).
import type { LeagueData } from '../data/queries';

export function AppHeader({ data, onMenu }: { data: LeagueData | undefined; onMenu: () => void }) {
  return (
    <header className="app-header">
      <button type="button" className="hb" id="menu-button" aria-label="Apri il menu" onClick={onMenu}>☰</button>
      <div className="app-title">CALCIO LERCIO</div>
      {data ? (
        <button type="button" className="lg-pill" id="league-pill" onClick={onMenu} aria-label={`Lega attiva: ${data.league.name}. Cambia lega`}>{data.league.name}</button>
      ) : null}
    </header>
  );
}
