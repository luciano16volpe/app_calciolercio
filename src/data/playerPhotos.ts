import { preparePlayerPhoto } from '../canvas/photo';
import { supabase } from './supabase';

export type PhotoAction = 'add' | 'replace' | 'select' | 'remove';

/** La scelta della foto attiva e le tre posizioni sono protette dal database. */
export async function managePlayerPhoto(playerId: string, action: PhotoAction, path: string, oldPath?: string): Promise<void> {
  const { error } = await supabase.rpc('manage_player_photo', {
    p_player: playerId, p_action: action, p_path: path, p_old_path: oldPath ?? null,
  });
  if (error) throw new Error(error.message);
  if ((action === 'replace' && oldPath) || action === 'remove') {
    const obsolete = action === 'remove' ? path : oldPath!;
    const removed = await supabase.storage.from('photos').remove([obsolete]);
    if (removed.error) console.warn('Foto rimossa dalla galleria ma ancora presente nello Storage:', removed.error.message);
  }
}

export async function uploadPlayerPhoto(playerId: string, file: File, action: 'add' | 'replace', oldPath?: string): Promise<string> {
  const blob = await preparePlayerPhoto(file);
  const path = `${playerId}-${Date.now()}${Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0')}.jpg`;
  const bucket = supabase.storage.from('photos');
  const uploaded = await bucket.upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (uploaded.error) throw new Error(uploaded.error.message);
  try {
    await managePlayerPhoto(playerId, action, path, oldPath);
    return path;
  } catch (error) {
    await bucket.remove([path]);
    throw error;
  }
}
