// Testi delle notifiche push (promemoria della mattina, risultato, pagelle pronte, Gazzetta). Funzioni pure (niente rete):
// le usa il servizio che invia e le provano i test.

/** Tipi di notifica (uguali a push_prefs e push_sent nel database). */
export type PushKind = 'reminder' | 'result' | 'ratings' | 'gazzetta' | `change:${string}`;

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

/** Una riga di push_due(): tutto quello che serve per scrivere la notifica. */
export interface EventInput extends ReminderInput {
  kind: PushKind;
  /** data della partita (aaaa-mm-gg) */
  match_date: string;
  score_a: number | null;
  score_b: number | null;
}

export interface PushMessage {
  title: string;
  body: string;
  /** dove porta il tocco sulla notifica */
  url: string;
  /** stessa partita e tipo = una sola notifica sullo schermo */
  tag: string;
}

const TEAM = { A: 'Blu 🔵', B: 'Bianchi ⚪' } as const;

/** «hh:mm:ss» → «hh:mm» (vuoto se manca). */
export function hhmm(t: string | null | undefined): string {
  const m = String(t ?? '').match(/^(\d{1,2}):(\d{2})/);
  return m ? `${(m[1] as string).padStart(2, '0')}:${m[2]}` : '';
}

/** «2026-10-28» → «28/10». */
export function ddmm(d: string | null | undefined): string {
  const m = String(d ?? '').match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[1]}` : '';
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

/** «🏁 Blu 5 - 3 Bianchi» + «Hai vinto 🎉» / «Hai perso» / «Pareggio». */
export function buildResult(r: EventInput): PushMessage {
  const a = Number(r.score_a), b = Number(r.score_b);
  const mine = r.team === 'A' ? a - b : r.team === 'B' ? b - a : 0;
  const outcome = !TEAM[r.team as 'A' | 'B'] ? '' : a === b ? 'Pareggio' : mine > 0 ? 'Hai vinto 🎉' : 'Hai perso';
  return {
    title: r.league_name,
    body: `🏁 Blu ${a} - ${b} Bianchi${outcome ? '\n' + outcome : ''}`,
    url: `/l/${r.league_slug}/partite`,
    tag: `result-${r.match_id}`,
  };
}

/** Il messaggio giusto per ogni tipo di notifica. */
export function buildMessage(r: EventInput): PushMessage {
  if (r.kind.startsWith('change:')) {
    const detail=[ddmm(r.match_date),hhmm(r.play_time),r.place?.trim()].filter(Boolean).join(' · ');
    const team=TEAM[r.team as 'A' | 'B'];
    return { title: r.league_name,
      body: r.team === 'out' ? `La tua convocazione per la partita del ${ddmm(r.match_date)} è stata annullata`
        : `📅 Partita aggiornata: ${detail}${team ? `\nSei con i ${team}` : ''}`,
      url: `/l/${r.league_slug}/partite`, tag: `change-${r.match_id}` };
  }
  switch (r.kind) {
    case 'result':
      return buildResult(r);
    case 'ratings':
      return { title: r.league_name, body: `📝 Le pagelle della partita del ${ddmm(r.match_date)} sono pronte`, url: `/l/${r.league_slug}/partite`, tag: `ratings-${r.match_id}` };
    case 'gazzetta':
      return { title: r.league_name, body: `📰 La Gazzetta della partita del ${ddmm(r.match_date)} è online`, url: `/l/${r.league_slug}/partite`, tag: `gazzetta-${r.match_id}` };
    default:
      { const message=buildReminder(r);
        const today=new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
        return r.match_date === today ? message : { ...message, body: message.body.replace('Oggi si gioca', `Il ${ddmm(r.match_date)} si gioca`) };
      }
  }
}
