// Regole di gioco uniche per tutta l'app (le cambia solo l'amministratore supremo): forma recente, formazioni, pesi.
import { parseModules, type Modules } from '../domain/modules';
import type { LeagueData } from './queries';
import { supabase } from './supabase';

/** «Forma recente» acceso? (se l'impostazione non c'è, sì) */
export const formOn = (d: Pick<LeagueData, 'useForm'>): boolean => d.useForm !== false;

/** Formazioni valide per questa app (quelle salvate, altrimenti le predefinite). */
export const modulesOf = (d: Pick<LeagueData, 'modulesText'>): Modules => parseModules(d.modulesText ?? null);

export type SettingKey = 'ovr_weights' | 'use_form' | 'game_modules';

/** Cambia un'impostazione (il database accetta solo l'amministratore supremo). */
export async function setSetting(key: SettingKey, value: unknown): Promise<void> {
  const { error } = await supabase.rpc('admin_set_setting', { k: key, v: value as never });
  if (error) throw new Error(error.message);
}
