import { useState } from 'react';
import { avatarClass, initials } from '../../domain/format';

/** La stessa foto e lo stesso ripiego sulle iniziali in Rosa e nei convocati. */
export function PlayerAvatar({ name, roles, photo, className = '' }: { name: string; roles: string[]; photo: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  const showPhoto = !!photo && !failed;
  return (
    <div className={`avatar avatar-ini ${className} ${avatarClass(roles)}${showPhoto ? ' has-photo' : ''}`}>
      {initials(name)}
      {showPhoto ? <img className="player-avatar-photo" src={photo} alt="" onError={() => setFailed(true)} /> : null}
    </div>
  );
}
