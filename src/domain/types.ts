/** Le 11 statistiche, sempre in questo ordine (valori 0–10). */
export const STATS = [
  'stamina', 'forza', 'dribling', 'velocità', 'tiro', 'passaggio',
  'attacco', 'difesa', 'tecnica', 'porta', 'intelligenza',
] as const;

export type Role = 'ATT' | 'MED' | 'DIF';

export interface Player {
  id: string;
  name: string;
  roles?: string[];
  stats: number[];
}

/** Un giocatore in una squadra salvata: la vecchia app a volte salvava solo il nome (stringa). */
export type TeamEntry = string | { id?: string | null; name?: string };

export interface Match {
  id: string;
  date?: string;
  scoreA?: number | string | null;
  scoreB?: number | string | null;
  teamA?: TeamEntry[];
  teamB?: TeamEntry[];
  [extra: string]: unknown;
}

/** Una pagella (una riga per giocatore e partita). I numeri possono arrivare come testo. */
export interface Rating {
  /** Text exists on the server, even when its content has not been requested yet. */
  hasText?: boolean;
  matchId: string;
  player?: string;
  playerId?: string | null;
  rating?: number | string | null;
  goals?: number | string | null;
  assist?: number | string | null;
  autogol?: number | string | null;
  rigoriSbagliati?: number | string | null;
  meta?: number | string | null;
  [extra: string]: unknown;
}

/** Tutto ciò che serve ai calcoli: rosa, partite, pagelle. */
export interface Dataset {
  players: Player[];
  matches: Match[];
  ratings: Rating[];
}
/** Icona di ogni statistica, nello stesso ordine di STATS (emoji come in legacy). */
export const ICONS = ["🏃","💪","⚡","💨","🎯","🔀","⚔️","🛡️","🎨","🧤","🧠"] as const;

/** Nome esteso dei ruoli. */
export const ROLE_LABELS: Record<Role, string> = {"ATT":"Attacco","MED":"Centrocampo","DIF":"Difesa"};
