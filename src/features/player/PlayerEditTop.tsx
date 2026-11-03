// Parte alta della scheda giocatore quando si può modificare (dalla Rosa, per l'amministratore): foto, ruoli e statistiche.
// Fonte: openRosaCard, upStat, toggleRole, photoActions, onPhotoSelected, fitPhotoBand in legacy/index.html.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { releaseKeyboard, repairViewport } from '../../app/Dialogs';
import { useToast } from '../../app/Toast';
import { resizeSquare } from '../../canvas/photo';
import { setPlayerPhoto, updatePlayer } from '../../data/mutations';
import { LEAGUE_ROSTER_QUERY_KEY, photoUrl, type LeagueData } from '../../data/queries';
import { PlayerAvatar } from './PlayerAvatar';
import { clampStat, ROLES, ROLE_CLS, ROLE_LABEL, toggleRole } from '../../domain/playerEdit';
import { ICONS, STATS, type Player } from '../../domain/types';
import { FutMini } from './FutMini';

const SAVE_DELAY = 700; // le statistiche si salvano poco dopo l'ultima modifica

export function PlayerEditTop({ data, player, weightRow }: { data: LeagueData; player: Player; weightRow: ReactNode }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [raw, setRaw] = useState<string[]>(() => player.stats.map(String)); // quello che c'è scritto nei campi
  const [roles, setRoles] = useState<string[]>(player.roles ?? []);
  const [menu, setMenu] = useState(false);
  const band = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
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

  const onFile = (f: File | undefined) => {
    if (!f) return;
    resizeSquare(f)
      .then((blob) => setPlayerPhoto(player.id, blob, data.photos[player.id] ?? null))
      .then(() => refresh())
      .then(() => toast('Foto aggiornata'))
      .catch(fail);
  };
  const removePhoto = () => {
    setPlayerPhoto(player.id, null, data.photos[player.id] ?? null)
      .then(() => refresh())
      .then(() => toast('Foto rimossa'))
      .catch(fail);
  };
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
            // iPhone apre la scelta della foto solo dentro il tocco: senza foto si apre subito, con foto prima il menu
            onClick={() => (photo ? setMenu(true) : file.current?.click())}
            title={photo ? 'Tocca per cambiare o rimuovere la foto' : 'Tocca per caricare una foto'}
          >
            <PlayerAvatar key={`${player.id}:${photo}`} size="xl" name={player.name} roles={roles} photo={photo} />
            <span className="photo-badge">📷</span>
          </div>
          <input ref={file} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; onFile(f); }} />
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
      {menu ? (
        <div id="app-modal" style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 600, padding: 18, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 380, background: 'var(--gray)', borderRadius: 'var(--radius)', padding: 20, boxShadow: '0 12px 36px rgba(0,0,0,0.4)' }}>
            <div style={{ fontSize: 34, textAlign: 'center', marginBottom: 8 }}>📷</div>
            <div id="app-modal-title" style={{ fontSize: 17, fontWeight: 800, textAlign: 'center', marginBottom: 6, color: 'var(--text)' }}>{player.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center', lineHeight: 1.5, marginBottom: 14 }}>Cosa vuoi fare con la foto?</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setMenu(false); releaseKeyboard(); repairViewport(); }}>Annulla</button>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => { setMenu(false); removePhoto(); }}>🗑 Rimuovi</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { setMenu(false); file.current?.click(); }}>📷 Cambia</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
