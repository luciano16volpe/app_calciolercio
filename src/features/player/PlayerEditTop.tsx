// Parte alta della scheda giocatore quando si può modificare (dalla Rosa, per l'amministratore): foto, ruoli e statistiche.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useToast } from '../../app/Toast';
import { updatePlayer } from '../../data/mutations';
import { LEAGUE_ROSTER_QUERY_KEY, photoUrl, type LeagueData } from '../../data/queries';
import { PlayerAvatar } from './PlayerAvatar';
import { clampStat, ROLES, ROLE_CLS, ROLE_LABEL, toggleRole } from '../../domain/playerEdit';
import { ICONS, STATS, type Player } from '../../domain/types';
import { FutMini } from './FutMini';
import { PlayerPhotoGallery } from './PlayerPhotoGallery';

const SAVE_DELAY = 700; // le statistiche si salvano poco dopo l'ultima modifica

export function PlayerEditTop({ data, player, weightRow }: { data: LeagueData; player: Player; weightRow: ReactNode }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [raw, setRaw] = useState<string[]>(() => player.stats.map(String)); // quello che c'è scritto nei campi
  const [roles, setRoles] = useState<string[]>(player.roles ?? []);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const band = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const stats = raw.map(clampStat);
  const photo = photoUrl(data.photos[player.id]);

  const refresh = () => qc.invalidateQueries({ queryKey: LEAGUE_ROSTER_QUERY_KEY });
  const fail = (e: unknown) => toast('Errore: ' + (e as Error).message);

  // le statistiche si salvano poco dopo l'ultima modifica
  const saveSoon = (next: string[]) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      updatePlayer(player.id, { stats: next.map(clampStat) }).then(refresh).catch(fail);
    }, SAVE_DELAY);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // foto e figurina alti quanto il blocco dei ruoli (stessa regola di fitPhotoBand)
  useLayoutEffect(() => {
    const fit = () => {
      const b = band.current;
      if (!b) return;
      const rolesEl = b.querySelector('.role-section') as HTMLElement | null;
      const col = b.querySelector('.photo-row') as HTMLElement | null;
      const ph = b.querySelector('.photo-edit') as HTMLElement | null;
      const mini = b.querySelector('.fut-mini') as HTMLElement | null;
      if (!rolesEl || !col) return;
      const h = Math.round(rolesEl.getBoundingClientRect().height), cw = col.getBoundingClientRect().width;
      if (ph) {
        const s = Math.min(h, cw);
        ph.style.width = s + 'px';
        ph.style.height = s + 'px';
      }
      if (mini) {
        const mw = Math.min(cw, h * 0.75), mh = Math.round(mw / 0.75);
        mini.style.width = Math.round(mw) + 'px';
        mini.style.height = mh + 'px';
        mini.style.setProperty('--s', (mh / 106).toFixed(3));
      }
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  });

  const toggle = (r: string) => {
    const next = toggleRole(roles, r);
    if (!next) return toast('Almeno un ruolo è richiesto');
    setRoles(next);
    updatePlayer(player.id, { roles: next }).then(refresh).catch(fail);
  };
  const live: Player = { ...player, stats, roles };

  return (
    <>
      <div className="photo-roles" ref={band}>
        <div className="photo-row">
          <div
            className="photo-edit"
            onClick={() => setGalleryOpen(true)}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setGalleryOpen(true); }}
            role="button" tabIndex={0}
            title="Apri le foto del giocatore"
          >
            <PlayerAvatar key={`${player.id}:${photo}`} size="xl" name={player.name} roles={roles} photo={photo} />
            <span className="photo-badge">📷</span>
          </div>
        </div>
        <div className="role-section">
          <div className="role-section-label">Ruoli</div>
          <div className="role-toggles">
            {ROLES.map((r) => {
              const on = roles.includes(r);
              const c = ROLE_CLS[r] as string;
              return (
                <button key={r} className={`role-toggle role-${c}${on ? ' tog-' + c : ''}`} onClick={() => toggle(r)}>
                  <span className="rt-label">{ROLE_LABEL[r]}</span>
                  {on ? <span className="rt-tick">✓</span> : null}
                </button>
              );
            })}
          </div>
        </div>
        <div className="photo-slot"><FutMini data={data} player={live} /></div>
      </div>
      <div className="stats-grid">
        {STATS.map((s, j) => (
          <div key={s} className="stat-row">
            <span className="stat-icon">{ICONS[j]}</span>
            <span className="stat-name">{s}</span>
            <input
              className="stat-input" type="number" min={1} max={10} step={1} value={raw[j]} inputMode="numeric"
              onChange={(e) => {
                const next = raw.slice();
                next[j] = e.target.value;
                setRaw(next);
                saveSoon(next);
              }}
            />
            <div className="mini-bar"><div className="mini-bar-fill" style={{ width: `${(stats[j] as number) * 10}%` }} /></div>
          </div>
        ))}
        {weightRow}
      </div>
      {galleryOpen ? <PlayerPhotoGallery data={data} playerId={player.id} name={player.name} canManage onClose={() => setGalleryOpen(false)} /> : null}
    </>
  );
}
