// Lettura dei dati della lega da Supabase, con la cache di TanStack Query:
// la schermata mostra subito quello che c'era l'ultima volta, poi si aggiorna.
import { useQuery } from '@tanstack/react-query';
import { useSelectedLeague } from '../app/league';
import { useAuth } from '../app/auth';
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
  league: { id: string; name: string; is_public: boolean; slug: string; owner_id: string | null };
  /** Giocatori della lega, partite con squadre e pagelle, nel formato della logica (src/domain). Include anche chi è uscito dalla Rosa ma ha giocato partite della lega (storia). */
  dataset: Dataset;
  /** Id dei giocatori che sono in Rosa adesso (gli altri compaiono solo nella storia). Assente = tutti. */
  rosterIds?: string[];
  /** Pesi dell'OVR (11 valori, uguali per tutte le leghe). */
  weights: number[];
  /** «Forma recente» nel bilanciamento (impostazione unica dell'app; assente = acceso) */
  useForm?: boolean;
  /** formazioni personalizzate, nel formato di salvataggio (assente = quelle predefinite) */
  modulesText?: string;
  /** Foto di ogni giocatore (id → percorso nell'archivio). */
  photos: Record<string, string | null>;
  /** Albo d'oro salvato (righe di tutte le stagioni). */
  albo: AlboRow[];
  /** Gazzette: id partita → percorso del file. */
  gazzette: Record<string, string>;
  /** Chi ha scritto le pagelle di ogni partita (id partita → nome), per la firma «Redazione …». Assente = non si sa. */
  editors?: Record<string, string>;
  /** soprannomi dei giocatori nella lega (id giocatore → altri nomi), per l'importazione da WhatsApp */
  aliases?: Record<string, string[]>;
}

/** Solo i giocatori in Rosa: per Rosa, Gioca e nuova partita (chi è uscito resta nella storia delle partite, non qui). */
export function rosterView(data: LeagueData): LeagueData {
  if (!data.rosterIds) return data;
  const ids = new Set(data.rosterIds);
  return { ...data, dataset: { ...data.dataset, players: data.dataset.players.filter((p) => ids.has(p.id)) } };
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

/** Chi non fa parte di nessuna lega: non c'è niente da mostrare (si entra solo su invito). */
export class NoLeagueError extends Error {
  constructor() {
    super('Non fai ancora parte di nessuna lega.');
    this.name = 'NoLeagueError';
  }
}

/** Carica tutto quello che serve per mostrare una lega: quella scelta (se si può vedere), altrimenti la prima di cui faccio parte. */
export async function fetchLeagueData(slug: string | null = null): Promise<LeagueData> {
  let league: LeagueData['league'] | undefined;
  if (slug) {
    const chosen = await supabase.from('leagues').select('id, name, is_public, slug, owner_id').eq('slug', slug).maybeSingle();
    if (chosen.error) throw new Error(`lega: ${chosen.error.message}`);
    league = chosen.data ?? undefined; // lega non più visibile (uscito, tolta, indirizzo sbagliato): si passa alla prima delle mie
  }
  if (!league) {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id;
    if (uid) {
      const { data: mine, error } = await supabase.from('league_members').select('joined_at, leagues(id, name, is_public, slug, owner_id)').eq('user_id', uid).order('joined_at').limit(1);
      if (error) throw new Error(`lega: ${error.message}`);
      league = mine?.[0]?.leagues ?? undefined;
    }
  }
  if (!league) throw new NoLeagueError();

  const lp = await fetchAll((a, b) => supabase.from('league_players').select('player_id, aliases').eq('league_id', league.id).order('player_id').range(a, b), 'giocatori della lega');
  const ids = lp.map((x) => x.player_id);
  const [players, matches, settings, albo, gaz, editorsRes] = await Promise.all([
    fetchAll((a, b) => supabase.from('players').select('id, name, roles, stats, photo_path').in('id', ids).order('id').range(a, b), 'giocatori'),
    fetchAll((a, b) => supabase.from('matches').select('id, date, play_time, place, ratings_skipped, notes, score_a, score_b, pred, pred_rank').eq('league_id', league.id).order('id').range(a, b), 'partite'),
    supabase.from('app_settings').select('key, value').in('key', ['ovr_weights', 'use_form', 'game_modules']),
    supabase.from('albo').select('rows').eq('league_id', league.id),
    fetchAll((a, b) => supabase.from('gazzette').select('match_id, file_path').order('match_id').range(a, b), 'Gazzette'),
    supabase.from('match_editors').select('match_id, name').eq('league_id', league.id), // la firma delle pagelle: se non si legge, si omette
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
  // chi è uscito dalla Rosa ma ha partite in questa lega resta nella storia (nome, foto, statistiche)
  const inRoster = new Set(ids);
  const exIds = [...new Set(mp.map((x) => x.player_id))].filter((id) => !inRoster.has(id));
  const exPlayers = exIds.length
    ? await fetchAll((a, b) => supabase.from('players').select('id, name, roles, stats, photo_path').in('id', exIds).order('id').range(a, b), 'giocatori usciti dalla lega')
    : [];
  const everyone = [...players, ...exPlayers];
  if (settings.error) throw new Error(`impostazioni: ${settings.error.message}`);
  if (albo.error) throw new Error(`albo: ${albo.error.message}`);

  const setting = (k: string) => settings.data?.find((s) => s.key === k)?.value;
  const w = setting('ovr_weights');
  const weights = Array.isArray(w) && w.length === 11 ? (w as number[]) : Array(11).fill(1);
  const matchSet = new Set(matchIds);
  return {
    league,
    dataset: dbToDataset({ players: everyone, matches, matchPlayers: mp }),
    rosterIds: ids,
    weights,
    useForm: setting('use_form') !== false,
    ...(typeof setting('game_modules') === 'string' ? { modulesText: setting('game_modules') as string } : {}),
    photos: Object.fromEntries(everyone.map((p) => [p.id, p.photo_path])),
    albo: (albo.data ?? []).flatMap((r) => r.rows as unknown as AlboRow[]),
    editors: Object.fromEntries((editorsRes.data ?? []).map((x) => [x.match_id, x.name])),
    aliases: Object.fromEntries(lp.filter((x) => x.aliases?.length).map((x) => [x.player_id, x.aliases])),
    gazzette: Object.fromEntries(gaz.filter((g) => matchSet.has(g.match_id)).map((g) => [g.match_id, g.file_path])),
  };
}

export const LEAGUE_QUERY_KEY = ['league-data'] as const;

/** Dati della lega: dalla cache subito, poi aggiornati in rete. */
export function useLeagueData() {
  const leagueId = useSelectedLeague();
  const { user } = useAuth();
  return useQuery({
    queryKey: [...LEAGUE_QUERY_KEY, user?.id, leagueId],
    enabled: !!user,
    queryFn: () => fetchLeagueData(leagueId),
    retry: (n, e) => !(e instanceof NoLeagueError) && n < 1, // «nessuna lega» non cambia riprovando
    staleTime: 60_000, // come legacy: i dati valgono 1 minuto
  });
}
