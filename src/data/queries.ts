// Lettura dei dati della lega da Supabase, con la cache di TanStack Query:
// la schermata mostra subito quello che c'era l'ultima volta, poi si aggiorna.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useSelectedLeague } from '../app/league';
import { useAuth } from '../app/auth';
import type { AlboRow } from '../domain/awards';
import type { Dataset } from '../domain/types';
import { dbToDataset, type DbRows } from './dataset';
import { supabase } from './supabase';
import { useFeatures } from './features';

export const SUPABASE_PUBLIC_URL = import.meta.env.VITE_SUPABASE_URL as string;

/** Indirizzo pubblico della foto di un giocatore (archivio `photos`). */
export const photoUrl = (path: string | null | undefined): string | null =>
  path ? `${SUPABASE_PUBLIC_URL}/storage/v1/object/public/photos/${path}` : null;

/** Indirizzo pubblico della Gazzetta di una partita (archivio `gazzette`). */
export const gazzettaUrl = (path: string): string => `${SUPABASE_PUBLIC_URL}/storage/v1/object/public/gazzette/${path}`;
/** Percorso della miniatura leggera di una Gazzetta (le Gazzette caricate prima non ce l'hanno: allora si usa il file completo). */
export const gazzettaThumbPath = (path: string): string => path.replace(/\.jpg$/, '-t.jpg');
export const gazzettaThumbUrl = (path: string): string => gazzettaUrl(gazzettaThumbPath(path));

/** URL temporaneo: il database verifica che la Gazzetta sia accessibile all'account. */
export function useGazzettaUrl(path: string | undefined, enabled = true) {
  const { user } = useAuth();
  return useQuery({ queryKey: ['gazzetta-url', user?.id, path], enabled: enabled && !!user && !!path,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('gazzette').createSignedUrl(path!, 300);
      if (error) throw error;
      return data.signedUrl;
    }, staleTime: 240_000, gcTime: 0, retry: false });
}

export interface LeagueData {
  textsDeferred?: boolean;
  textVersion?: string;
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

/** Individua la lega scelta oppure la prima accessibile. */
async function fetchLeagueIdentity(slug: string | null): Promise<LeagueData['league']> {
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
  return league;

}

/** Rosa attiva e soprannomi: hanno una cache distinta dallo storico. */
async function fetchLeagueRoster(leagueId: string) {
  const lp = await fetchAll((a, b) => supabase.from('league_players').select('player_id, aliases').eq('league_id', leagueId).order('player_id').range(a, b), 'giocatori della lega');
  const ids = lp.map((x) => x.player_id);
  const players: Array<DbRows['players'][number] & { photo_path: string | null }> = [];
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100);
    players.push(...await fetchAll((a, b) => supabase.from('players').select('id, name, roles, stats, photo_path').in('id', part).order('id').range(a, b), 'giocatori'));
  }
  return { ids, players, aliases: Object.fromEntries(lp.filter((x) => x.aliases?.length).map((x) => [x.player_id, x.aliases])) };
}

/** Lo storico resta completo per tutte le formule e si legge in pagine dal server. */
async function fetchLeagueHistory(league: LeagueData['league']) {
  const [matches, albo, editorsRes] = await Promise.all([
    fetchAll((a, b) => supabase.from('matches').select('id, date, play_time, place, place_lat, place_lng, ratings_skipped, notes, score_a, score_b, pred, pred_rank').eq('league_id', league.id).order('id').range(a, b), 'partite'),
    supabase.from('albo').select('rows').eq('league_id', league.id),
    supabase.from('match_editors').select('match_id, name').eq('league_id', league.id), // la firma delle pagelle: se non si legge, si omette
  ]);
  const matchIds = matches.map((m) => m.id);
  // Gazzette e pagelle si leggono a gruppi di 100 partite, tutti i gruppi insieme (non uno dopo l'altro).
  // Le Gazzette sono filtrate sul server: non si scaricano quelle delle altre leghe.
  const chunks: string[][] = [];
  for (let i = 0; i < matchIds.length; i += 100) chunks.push(matchIds.slice(i, i + 100));
  const [gazParts, mpParts] = await Promise.all([
    Promise.all(chunks.map((ids) => fetchAll((a, b) => supabase.from('gazzette').select('match_id, file_path').in('match_id', ids).order('match_id').range(a, b), 'Gazzette'))),
    Promise.all(chunks.map((part) => fetchAll(
      (a, b) => supabase.from('match_player_summaries')
        .select('match_id, player_id, team, position, rating, goals, assist, autogol, meta, rigori_sbagliati, has_text')
        .in('match_id', part).order('match_id').order('player_id').range(a, b),
      'squadre e pagelle',
    ))),
  ]);
  const gaz = gazParts.flat();
  const mp: DbRows['matchPlayers'] = mpParts.flat();
  if (albo.error) throw new Error(`albo: ${albo.error.message}`);

  return { matches, matchPlayers: mp,
    albo: (albo.data ?? []).flatMap((r) => r.rows as unknown as AlboRow[]),
    editors: Object.fromEntries((editorsRes.data ?? []).map((x) => [x.match_id, x.name])),
    gazzette: Object.fromEntries(gaz.map((g) => [g.match_id, g.file_path])) };
}

export const LEAGUE_QUERY_KEY = ['league-data'] as const;
export const LEAGUE_ROSTER_QUERY_KEY = [...LEAGUE_QUERY_KEY, 'roster'] as const;
export const LEAGUE_HISTORY_QUERY_KEY = [...LEAGUE_QUERY_KEY, 'history'] as const;
export const LEAGUE_VERSION_QUERY_KEY = [...LEAGUE_QUERY_KEY, 'version'] as const;
export const GAME_SETTINGS_QUERY_KEY = ['game-settings'] as const;

/** Le regole sono condivise dalle leghe e si ricaricano solo quando cambiano. */
export async function fetchGameSettings(): Promise<Pick<LeagueData, 'weights' | 'useForm' | 'modulesText'>> {
  const { data, error } = await supabase.from('app_settings').select('key, value').in('key', ['ovr_weights', 'use_form', 'game_modules']);
  if (error) throw new Error('impostazioni: ' + error.message);
  const setting = (k: string) => data?.find((s) => s.key === k)?.value;
  const w = setting('ovr_weights');
  return {
    weights: Array.isArray(w) && w.length === 11 ? (w as number[]) : Array(11).fill(1),
    useForm: setting('use_form') !== false,
    ...(typeof setting('game_modules') === 'string' ? { modulesText: setting('game_modules') as string } : {}),
  };
}

/** Chi e uscito dalla rosa resta leggibile nelle partite passate. */
async function fetchPastPlayers(ids: string[]) {
  const players: Array<DbRows['players'][number] & { photo_path: string | null }> = [];
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100);
    players.push(...await fetchAll((a, b) => supabase.from('players').select('id, name, roles, stats, photo_path').in('id', part).order('id').range(a, b), 'giocatori nello storico'));
  }
  return players;
}

/** Identita, rosa, storico e regole hanno cache separate per utente e lega. */
export function useLeagueData() {
  const qc = useQueryClient();
  const slug = useSelectedLeague();
  const { user } = useAuth();
  const uid = user?.id;
  const features = useFeatures(uid ?? null);
  const historyAllowed = features.data?.find((f) => f.feature === 'history')?.allowed === true;
  const settings = useQuery({ queryKey: [...GAME_SETTINGS_QUERY_KEY, uid], enabled: !!uid, queryFn: fetchGameSettings, staleTime: 60_000 });
  const league = useQuery({ queryKey: [...LEAGUE_QUERY_KEY, 'identity', uid, slug], enabled: !!uid,
    queryFn: () => fetchLeagueIdentity(slug), retry: (n, e) => !(e instanceof NoLeagueError) && n < 1, staleTime: 60_000 });
  const identity = league.data;
  const roster = useQuery({ queryKey: [...LEAGUE_ROSTER_QUERY_KEY, uid, identity?.id], enabled: !!identity && !!uid,
    queryFn: () => fetchLeagueRoster(identity!.id), staleTime: 60_000 });
  const version = useQuery({ queryKey: [...LEAGUE_VERSION_QUERY_KEY, uid, identity?.id, historyAllowed], enabled: !!identity && !!uid && features.isSuccess,
    queryFn: async () => {
      const { data, error } = await supabase.from('league_data_versions').select('version').eq('league_id', identity!.id).maybeSingle();
      if (error) throw new Error('versione dati: ' + error.message);
      if (!data) throw new Error('Lega non disponibile: aggiorna le tue leghe.');
      return data.version;
    }, staleTime: 15_000, refetchInterval: 60_000, gcTime: 30 * 60_000 });
  const history = useQuery({ queryKey: [...LEAGUE_HISTORY_QUERY_KEY, uid, identity?.id, historyAllowed], enabled: !!identity && !!uid && features.isSuccess && version.isSuccess,
    queryFn: async () => ({ ...await fetchLeagueHistory(identity!), version: version.data }), staleTime: Infinity, gcTime: 30 * 60_000, refetchOnWindowFocus: false, refetchOnReconnect: false });
  useEffect(() => {
    if (version.data && history.data && history.data.version !== version.data) {
      void qc.invalidateQueries({ queryKey: [...LEAGUE_HISTORY_QUERY_KEY, uid, identity?.id] });
    }
  }, [qc, uid, identity?.id, version.data, history.data]);
  const pastIds = useMemo(() => {
    const active = new Set(roster.data?.ids ?? []);
    return [...new Set((history.data?.matchPlayers ?? []).map((p) => p.player_id))].filter((id) => !active.has(id)).sort();
  }, [roster.data, history.data]);
  const pastPlayers = useQuery({ queryKey: [...LEAGUE_QUERY_KEY, 'past-players', uid, identity?.id, pastIds],
    enabled: !!uid && !!identity && !!roster.data && !!history.data,
    queryFn: () => fetchPastPlayers(pastIds), staleTime: 60_000 });
  const data = useMemo((): LeagueData | undefined => {
    if (version.isError || !version.isSuccess || !identity || !roster.data || !history.data || !settings.data || !pastPlayers.data) return undefined;
    const players = [...roster.data.players, ...pastPlayers.data];
    return { textsDeferred: true, textVersion: version.data + ':' + history.dataUpdatedAt, league: identity, rosterIds: roster.data.ids, aliases: roster.data.aliases,
      dataset: dbToDataset({ players, matches: history.data.matches, matchPlayers: history.data.matchPlayers }),
      photos: Object.fromEntries(players.map((p) => [p.id, p.photo_path])),
      albo: history.data.albo, gazzette: history.data.gazzette, editors: history.data.editors, ...settings.data };
  }, [identity, roster.data, history.data, history.dataUpdatedAt, version.data, version.isError, version.isSuccess, settings.data, pastPlayers.data]);
  return { ...league, data,
    isError: version.isError || league.isError || roster.isError || history.isError || settings.isError || pastPlayers.isError || features.isError,
    error: version.error ?? league.error ?? roster.error ?? history.error ?? settings.error ?? pastPlayers.error ?? features.error,
    refetch: () => Promise.all([league.refetch(), version.refetch(), settings.refetch(), ...(identity ? [roster.refetch(), history.refetch()] : []), ...(identity && roster.data && history.data ? [pastPlayers.refetch()] : [])]),
  };
}
