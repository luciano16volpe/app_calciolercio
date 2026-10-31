// Lettura dei dati della lega da Supabase, con la cache di TanStack Query:
// la schermata mostra subito quello che c'era l'ultima volta, poi si aggiorna.
import { useQuery } from '@tanstack/react-query';
import type { AlboRow } from '../domain/awards';
import type { Dataset } from '../domain/types';
import { dbToDataset, type DbRows } from './dataset';
import { supabase } from './supabase';

export const SUPABASE_PUBLIC_URL = import.meta.env.VITE_SUPABASE_URL as string;

/** Indirizzo pubblico della foto di un giocatore (archivio `photos`). */
export const photoUrl = (path: string | null | undefined): string | null =>
  path ? `${SUPABASE_PUBLIC_URL}/storage/v1/object/public/photos/${path}` : null;

/** Indirizzo pubblico della Gazzetta di una partita (archivio `gazzette`). */
export const gazzettaUrl = (path: string): string => `${SUPABASE_PUBLIC_URL}/storage/v1/object/public/gazzette/${path}`;
/** Percorso della miniatura leggera di una Gazzetta (le Gazzette caricate prima non ce l'hanno: allora si usa il file completo). */
export const gazzettaThumbPath = (path: string): string => path.replace(/\.jpg$/, '-t.jpg');
export const gazzettaThumbUrl = (path: string): string => gazzettaUrl(gazzettaThumbPath(path));

export interface LeagueData {
  league: { id: string; name: string; is_public: boolean };
  /** Rosa, partite con squadre e pagelle, nel formato della logica (src/domain). */
  dataset: Dataset;
  /** Pesi dell'OVR (11 valori, uguali per tutte le leghe). */
  weights: number[];
  /** Foto di ogni giocatore (id → percorso nell'archivio). */
  photos: Record<string, string | null>;
  /** Albo d'oro salvato (righe di tutte le stagioni). */
  albo: AlboRow[];
  /** Gazzette: id partita → percorso del file. */
  gazzette: Record<string, string>;
  /** soprannomi dei giocatori nella lega (id giocatore → altri nomi), per l'importazione da WhatsApp */
  aliases?: Record<string, string[]>;
}

const PAGE = 1000; // Supabase restituisce al massimo 1000 righe per richiesta

/** Legge tutte le righe di una query, a pagine, in un ordine fisso. */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, what: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(`${what}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

/** Carica tutto quello che serve per mostrare la lega pubblica. */
export async function fetchLeagueData(): Promise<LeagueData> {
  const { data: leagues, error } = await supabase.from('leagues').select('id, name, is_public').eq('is_public', true).order('created_at').limit(1);
  if (error) throw new Error(`lega: ${error.message}`);
  const league = leagues?.[0];
  if (!league) throw new Error('Nessuna lega pubblica trovata.');

  const lp = await fetchAll((a, b) => supabase.from('league_players').select('player_id, aliases').eq('league_id', league.id).order('player_id').range(a, b), 'giocatori della lega');
  const ids = lp.map((x) => x.player_id);
  const [players, matches, settings, albo, gaz] = await Promise.all([
    fetchAll((a, b) => supabase.from('players').select('id, name, roles, stats, photo_path').in('id', ids).order('id').range(a, b), 'giocatori'),
    fetchAll((a, b) => supabase.from('matches').select('id, date, notes, score_a, score_b, pred, pred_rank').eq('league_id', league.id).order('id').range(a, b), 'partite'),
    supabase.from('app_settings').select('key, value').eq('key', 'ovr_weights'),
    supabase.from('albo').select('rows').eq('league_id', league.id),
    fetchAll((a, b) => supabase.from('gazzette').select('match_id, file_path').order('match_id').range(a, b), 'Gazzette'),
  ]);
  const matchIds = matches.map((m) => m.id);
  // le pagelle si leggono a gruppi di partite (l'elenco degli id sta nell'indirizzo della richiesta)
  const mp: DbRows['matchPlayers'] = [];
  for (let i = 0; i < matchIds.length; i += 100) {
    const part = matchIds.slice(i, i + 100);
    mp.push(
      ...(await fetchAll(
        (a, b) =>
          supabase
            .from('match_players')
            .select('match_id, player_id, team, position, rating, goals, assist, autogol, meta, rigori_sbagliati, titolo, descrizione')
            .in('match_id', part)
            .order('match_id')
            .order('player_id')
            .range(a, b),
        'squadre e pagelle',
      )),
    );
  }
  if (settings.error) throw new Error(`impostazioni: ${settings.error.message}`);
  if (albo.error) throw new Error(`albo: ${albo.error.message}`);

  const w = settings.data?.[0]?.value;
  const weights = Array.isArray(w) && w.length === 11 ? (w as number[]) : Array(11).fill(1);
  const matchSet = new Set(matchIds);
  return {
    league,
    dataset: dbToDataset({ players, matches, matchPlayers: mp }),
    weights,
    photos: Object.fromEntries(players.map((p) => [p.id, p.photo_path])),
    albo: (albo.data ?? []).flatMap((r) => r.rows as unknown as AlboRow[]),
    aliases: Object.fromEntries(lp.filter((x) => x.aliases?.length).map((x) => [x.player_id, x.aliases])),
    gazzette: Object.fromEntries(gaz.filter((g) => matchSet.has(g.match_id)).map((g) => [g.match_id, g.file_path])),
  };
}

export const LEAGUE_QUERY_KEY = ['league-data'] as const;

/** Dati della lega: dalla cache subito, poi aggiornati in rete. */
export function useLeagueData() {
  return useQuery({
    queryKey: LEAGUE_QUERY_KEY,
    queryFn: fetchLeagueData,
    staleTime: 60_000, // come legacy: i dati valgono 1 minuto
  });
}
