import { useState } from 'react';
import { avatarClass, initials } from '../../domain/format';

/**
 * Il pallino del giocatore, uguale ovunque: la foto se c'è e si carica, altrimenti le iniziali.
 * Le iniziali restano visibili finché la foto non è davvero arrivata (niente cerchio vuoto).
 * `size="xl"` è il pallino grande (scheda, modifica, profilo); `label` sostituisce le iniziali;
 * senza `roles` non c'è il colore del ruolo.
 */
export function PlayerAvatar({ name, roles, photo, className = '', size = 'ini', label }: {
  name: string;
  roles?: string[];
  photo: string | null;
  className?: string;
  size?: 'ini' | 'xl' | 'sm';
  label?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const showPhoto = !!photo && !failed;
  const cls = [
    'avatar',
    size === 'ini' ? 'avatar-ini' : size === 'xl' ? 'avatar-xl' : '',
    className,
    roles ? avatarClass(roles) : '',
    showPhoto ? 'has-photo' : '',
    showPhoto && loaded ? 'photo-loaded' : '',
  ].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      {label ?? initials(name)}
      {showPhoto ? <img className="player-avatar-photo" src={photo} alt="" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} /> : null}
    </div>
  );
}
