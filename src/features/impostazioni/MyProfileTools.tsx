// «Il mio profilo»: cambiare la mia foto e il mio nome. Il resto (statistiche, ruoli, collegamento) resta all'amministratore.
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { usePrompt } from '../../app/Dialogs';
import { useToast } from '../../app/Toast';
import { resizeSquare } from '../../canvas/photo';
import { MY_PLAYER_KEY, renameMyPlayer, setMyPhoto } from '../../data/claims';
import { LEAGUE_QUERY_KEY, photoUrl, type LeagueData } from '../../data/queries';
import { PlayerAvatar } from '../player/PlayerAvatar';

export function MyProfileTools({ data, playerId, name }: { data: LeagueData | undefined; playerId: string; name: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const prompt = usePrompt();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const oldPath = data?.photos[playerId] ?? null;
  const photo = photoUrl(oldPath);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY }), qc.invalidateQueries({ queryKey: MY_PLAYER_KEY })]);
  const fail = (e: unknown) => toast('Errore: ' + (e as Error).message);

  const onFile = (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    resizeSquare(f)
      .then((blob) => setMyPhoto(playerId, blob, oldPath))
      .then(refresh)
      .then(() => toast('Foto aggiornata'))
      .catch(fail)
      .finally(() => setBusy(false));
  };
  const removePhoto = () => {
    setBusy(true);
    setMyPhoto(playerId, null, oldPath)
      .then(refresh)
      .then(() => toast('Foto rimossa'))
      .catch(fail)
      .finally(() => setBusy(false));
  };
  const rename = async () => {
    const v = await prompt({
      icon: '✏️', title: 'Cambia il tuo nome',
      lines: ['Resti lo stesso giocatore: partite, pagelle e statistiche non cambiano. Il nome deve essere libero nelle tue leghe.'],
      okLabel: 'Cambia', input: { placeholder: name },
    });
    if (v === null || !v.trim()) return;
    setBusy(true);
    try {
      const saved = await renameMyPlayer(v);
      await refresh();
      toast(`Ora ti chiami ${saved}`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" id="my-tools" style={{ marginBottom: 12 }}>
      <div className="section-header">🛠 Foto e nome</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {photo ? <PlayerAvatar key={photo} size="xl" name={name} photo={photo} /> : null}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button type="button" id="my-photo" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => file.current?.click()}>📷 {photo ? 'Cambia la mia foto' : 'Carica la mia foto'}</button>
          {photo ? <button type="button" id="my-photo-remove" className="btn btn-secondary btn-sm" disabled={busy} onClick={removePhoto}>🗑 Rimuovi la foto</button> : null}
          <button type="button" id="my-rename" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void rename()}>✏️ Cambia il mio nome</button>
        </div>
      </div>
      <input ref={file} id="my-photo-file" type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}
