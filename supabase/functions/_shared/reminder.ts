// Testo del promemoria della mattina della partita. Funzione pura (niente rete): la usa il servizio che invia e la provano i test.

export interface ReminderInput {
  league_name: string;
  league_slug: string;
  /** hh:mm o hh:mm:ss (può mancare) */
  play_time: string | null;
  /** luogo (può mancare) */
  place: string | null;
  /** 'A' = Blu, 'B' = Bianchi */
  team: string;
  match_id: string;
}

export interface PushMessage {
  title: string;
  body: string;
  /** dove porta il tocco sulla notifica */
  url: string;
  /** stessa partita = una sola notifica sullo schermo */
  tag: string;
}

const TEAM = { A: 'Blu 🔵', B: 'Bianchi ⚪' } as const;

/** «hh:mm:ss» → «hh:mm» (vuoto se manca). */
export function hhmm(t: string | null | undefined): string {
  const m = String(t ?? '').match(/^(\d{1,2}):(\d{2})/);
  return m ? `${(m[1] as string).padStart(2, '0')}:${m[2]}` : '';
}

/** «⚽ Oggi si gioca alle 21:00 · Campo Sole» + «Sei con i Blu 🔵». Le parti mancanti si saltano. */
export function buildReminder(r: ReminderInput): PushMessage {
  const t = hhmm(r.play_time);
  const place = (r.place ?? '').trim();
  const when = [t ? `alle ${t}` : '', place].filter(Boolean).join(' · ');
  const first = `⚽ Oggi si gioca${when ? ' ' + when : ''}`;
  const team = TEAM[r.team as 'A' | 'B'];
  return {
    title: r.league_name,
    body: team ? `${first}\nSei con i ${team}` : first,
    url: `/l/${r.league_slug}/partite`,
    tag: `reminder-${r.match_id}`,
  };
}
