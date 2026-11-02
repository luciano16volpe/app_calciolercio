// Intestazione dell'app: a sinistra la faccia del tuo giocatore con OVR e stato di forma (toccandola si apre il menu);
// al centro CALCIO LERCIO; a destra il logo con il nome della lega sotto. Senza un giocatore collegato resta il pulsante ☰.
import { useMemo } from 'react';
import { useAuth } from './auth';
import { useMyPlayer } from '../data/claims';
import { photoUrl, type LeagueData } from '../data/queries';
import { calcOvr } from '../domain/ovr';
import { formState } from '../domain/form';
import { seasonStats } from '../domain/stats';

export function AppHeader({ data, onMenu, onHome }: { data: LeagueData | undefined; onMenu: () => void; onHome: () => void }) {
  const { user } = useAuth();
  const mine = useMyPlayer(user?.id ?? null);
  const linkedId = mine.data?.linked?.id;

  // OVR e forma del mio giocatore nella lega che sto guardando (se ci gioca)
  const me = useMemo(() => {
    if (!data || !linkedId) return null;
    const p = data.dataset.players.find((x) => x.id === linkedId);
    if (!p) return null;
    return {
      name: p.name,
      ovr: calcOvr(p.stats, data.weights).toFixed(1),
      state: formState(data.dataset, p, seasonStats(data.dataset)),
      photo: photoUrl(data.photos[p.id]),
    };
  }, [data, linkedId]);

  const flame = me?.state === 'up' ? '🔥' : me?.state === 'down' ? '🌧️' : '';
  const flameText = me?.state === 'up' ? 'in forma' : me?.state === 'down' ? 'in crisi' : '';

  return (
    <header className="app-header">
      {me ? (
        <button
          type="button" className="hf" id="menu-button" onClick={onMenu}
          aria-label={`Apri il menu. Il tuo giocatore: ${me.name}, OVR ${me.ovr}${flameText ? ', ' + flameText : ''}`}
        >
          <span className="hf-av" style={me.photo ? { backgroundImage: `url('${me.photo}')` } : undefined}>
            {me.photo ? '' : me.name.slice(0, 1).toUpperCase()}
            <span className="hf-menu" aria-hidden="true">☰</span>
          </span>
          <span className="hf-stat">
            <span className="hf-ovr" id="header-ovr">{me.ovr}</span>
            {flame ? <span className="hf-flame" id="header-form" title={flameText}>{flame}</span> : null}
          </span>
        </button>
      ) : (
        <button type="button" className="hb" id="menu-button" aria-label="Apri il menu" onClick={onMenu}>☰</button>
      )}
      <div className="app-title" onClick={onHome}>CALCIO LERCIO</div>
      <div className="app-right">
        <img src="/logo.png" alt="CalcioLercio" onClick={onHome} />
        {data ? (
          <button type="button" className="lg-pill" id="league-pill" onClick={onMenu} aria-label={`Lega attiva: ${data.league.name}. Cambia lega`}>{data.league.name}</button>
        ) : null}
      </div>
    </header>
  );
}
