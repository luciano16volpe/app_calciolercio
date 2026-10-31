// Cancellazione dell'account (privacy). Il giocatore e il suo storico restano, senza account collegato.
import { supabase } from './supabase';

export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw new Error(error.message);
  await supabase.auth.signOut();
}
