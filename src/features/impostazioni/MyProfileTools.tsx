// «Il mio profilo»: cambiare la mia foto e il mio nome. Il resto (statistiche, ruoli, collegamento) resta all'amministratore.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { usePrompt } from '../../app/Dialogs';
import { useToast } from '../../app/Toast';
import { MY_PLAYER_KEY, renameMyPlayer } from '../../data/claims';
import { LEAGUE_QUERY_KEY, photoUrl, type LeagueData } from '../../data/queries';
import { PlayerAvatar } from '../player/PlayerAvatar';
import { PlayerPhotoGallery } from '../player/PlayerPhotoGallery';

export function MyProfileTools({ data, playerId, name }: { data: LeagueData | undefined; playerId: string; name: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const prompt = usePrompt();
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const oldPath = data?.photos[playerId] ?? null;
  const photo = photoUrl(oldPath);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY }), qc.invalidateQueries({ queryKey: MY_PLAYER_KEY })]);
  const fail = (e: unknown) => toast('Errore: ' + (e as Error).message);

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
        {photo ? <button type="button" onClick={() => setGalleryOpen(true)} aria-label="Apri le mie foto" style={{ border: 0, padding: 0, background: 'none', cursor: 'pointer' }}><PlayerAvatar key={photo} size="xl" name={name} photo={photo} /></button> : null}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button type="button" id="my-photo" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setGalleryOpen(true)}>📷 Le mie foto ({data?.photoGalleries?.[playerId]?.length ?? (photo ? 1 : 0)}/3)</button>
          <button type="button" id="my-rename" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void rename()}>✏️ Cambia il mio nome</button>
        </div>
      </div>
      {galleryOpen && data ? <PlayerPhotoGallery data={data} playerId={playerId} name={name} canManage onClose={() => setGalleryOpen(false)} /> : null}
    </div>
  );
}
